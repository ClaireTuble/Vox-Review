import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

import torch
import torch.nn.functional as functional

import predict_topics_batch
from topic_taxonomy import (
    TOPIC_E5_DESCRIPTIONS,
    TOPIC_LABELS,
    TOPIC_MODEL_NAME,
    TOPIC_TAXONOMY,
)

_encode_texts = predict_topics_batch.encode_texts


class FakeTokenizer:
    def __init__(self):
        self.batches = []

    def __call__(self, texts, **kwargs):
        self.batches.append(list(texts))
        input_ids = torch.tensor([[len(text)] for text in texts], dtype=torch.float32)
        return {
            "input_ids": input_ids,
            "attention_mask": torch.ones_like(input_ids, dtype=torch.long),
        }


class FakeModel:
    def __init__(self):
        self.eval_called = False

    def eval(self):
        self.eval_called = True
        return self

    def __call__(self, input_ids, **kwargs):
        hidden = torch.stack((input_ids, input_ids * 2), dim=-1)
        return type("ModelOutput", (), {"last_hidden_state": hidden})()


class FakeEmbeddings:
    def __init__(self):
        self.prefixes = []
        self.calls = []
        self.topic_vectors = torch.eye(len(TOPIC_LABELS))
        self.review_vectors = {
            "English review": self.vector({0: 0.9, 1: 0.8}),
            "Ang ganda nito, sulit talaga!": self.vector({2: 0.8, 4: 0.7}),
        }

    @staticmethod
    def vector(scores):
        values = torch.zeros(len(TOPIC_LABELS), dtype=torch.float32)
        for index, score in scores.items():
            values[index] = score
        return functional.normalize(values, p=2, dim=0)

    def __call__(self, texts, prefix, tokenizer, model):
        self.prefixes.append(prefix)
        self.calls.append(list(texts))
        if prefix == predict_topics_batch.TOPIC_PREFIX:
            return self.topic_vectors.clone()
        return torch.stack([
            self.review_vectors.get(text, self.vector({0: 0.9, 1: 0.8}))
            for text in texts
        ])


class TopicProviderTests(unittest.TestCase):
    def setUp(self):
        self.tokenizer = FakeTokenizer()
        self.model = FakeModel()
        self.embeddings = FakeEmbeddings()
        self.cache_patches = [
            patch.object(predict_topics_batch, "_tokenizer", None),
            patch.object(predict_topics_batch, "_model", None),
            patch.object(predict_topics_batch, "_topic_embeddings", None),
            patch.object(predict_topics_batch, "encode_texts", side_effect=self.embeddings),
            patch.object(
                predict_topics_batch.AutoTokenizer,
                "from_pretrained",
                return_value=self.tokenizer,
            ),
            patch.object(
                predict_topics_batch.AutoModel,
                "from_pretrained",
                return_value=self.model,
            ),
        ]
        for context in self.cache_patches:
            context.start()
            self.addCleanup(context.stop)

    def test_e5_model_and_phase1_descriptions_match_the_saved_experiment(self):
        self.assertEqual(TOPIC_MODEL_NAME, "intfloat/multilingual-e5-small")
        self.assertEqual([topic["label"] for topic in TOPIC_TAXONOMY], TOPIC_LABELS)
        self.assertEqual([topic["label"] for topic in TOPIC_E5_DESCRIPTIONS], TOPIC_LABELS)

        report_path = (
            Path(__file__).resolve().parents[1]
            / "evaluation_reports"
            / "phase1_e5_prefixes_top2_50_2026-10-03.json"
        )
        report = json.loads(report_path.read_text(encoding="utf-8"))
        phase1_descriptions = report["experiments"]["B_prefix_only"]["topicDescriptions"]
        self.assertEqual(TOPIC_E5_DESCRIPTIONS, phase1_descriptions)

    def test_uses_query_and_passage_prefixes_and_returns_two_topics(self):
        response = predict_topics_batch.classify_reviews(["English review"])

        self.assertEqual(response["provider"], "e5")
        self.assertEqual(response["model"], TOPIC_MODEL_NAME)
        self.assertIsNone(response["threshold"])
        self.assertEqual(self.embeddings.prefixes, [
            predict_topics_batch.TOPIC_PREFIX,
            predict_topics_batch.REVIEW_PREFIX,
        ])
        self.assertEqual(
            response["results"][0]["topics"],
            [
                {"label": "Quality", "score": 0.7474},
                {"label": "Performance / Functionality", "score": 0.6644},
            ],
        )
        self.assertEqual(len(response["results"][0]["topicScores"]), 11)
        self.assertEqual(
            [topic["label"] for topic in response["results"][0]["topicScores"]],
            TOPIC_LABELS,
        )

    def test_loads_model_and_caches_topic_embeddings_across_requests(self):
        first = predict_topics_batch.classify_reviews(["English review"])
        second = predict_topics_batch.classify_reviews(["English review"])

        self.assertEqual(first["results"][0]["topics"], second["results"][0]["topics"])
        predict_topics_batch.AutoTokenizer.from_pretrained.assert_called_once_with(TOPIC_MODEL_NAME)
        predict_topics_batch.AutoModel.from_pretrained.assert_called_once_with(TOPIC_MODEL_NAME)
        self.assertEqual(self.embeddings.prefixes.count(predict_topics_batch.TOPIC_PREFIX), 1)
        self.assertTrue(self.model.eval_called)

    def test_preserves_duplicate_and_multilingual_reviews(self):
        reviews = [
            "Ang ganda nito, sulit talaga!",
            "Ang ganda nito, sulit talaga!",
        ]
        response = predict_topics_batch.classify_reviews(reviews)

        self.assertEqual(len(response["results"]), 2)
        self.assertEqual(
            [result["reviewIndex"] for result in response["results"]],
            [0, 1],
        )
        self.assertEqual(
            response["results"][0]["topics"],
            response["results"][1]["topics"],
        )
        self.assertEqual(
            response["results"][0]["topics"],
            [
                {"label": "Features / Content", "score": 0.7526},
                {"label": "Delivery / Transaction", "score": 0.6585},
            ],
        )
        self.assertEqual(
            self.embeddings.calls[-1],
            reviews,
        )

    def test_platform_guardrail_filters_after_top_two_without_changing_scores(self):
        review = "The game world has a beautiful atmosphere."
        self.embeddings.review_vectors[review] = self.embeddings.vector({
            9: 0.9,
            4: 0.8,
        })

        baseline = predict_topics_batch.classify_reviews([review])
        guarded = predict_topics_batch.classify_reviews([review], "Steam")

        self.assertEqual(
            [topic["label"] for topic in baseline["results"][0]["topics"]],
            ["Delivery / Transaction", "Environment / Location"],
        )
        self.assertEqual(guarded["results"][0]["topics"], [])
        self.assertEqual(
            guarded["results"][0]["topicScores"],
            baseline["results"][0]["topicScores"],
        )

    def test_rejects_empty_or_non_string_reviews(self):
        for reviews in ([""], ["  "], [None], "not a list"):
            with self.subTest(reviews=reviews):
                with self.assertRaises(ValueError):
                    predict_topics_batch.classify_reviews(reviews)

    def test_empty_batch_does_not_load_the_model(self):
        response = predict_topics_batch.classify_reviews([])

        self.assertEqual(response["results"], [])
        predict_topics_batch.AutoTokenizer.from_pretrained.assert_not_called()
        predict_topics_batch.AutoModel.from_pretrained.assert_not_called()

    def test_embedding_helper_batches_inputs_and_normalizes_mean_pooled_vectors(self):
        with patch.object(predict_topics_batch, "TOPIC_BATCH_SIZE", 2):
            vectors = _encode_texts(
                ["one", "two", "three", "four", "five"],
                predict_topics_batch.REVIEW_PREFIX,
                self.tokenizer,
                self.model,
            )

        self.assertEqual([len(batch) for batch in self.tokenizer.batches], [2, 2, 1])
        self.assertEqual(
            self.tokenizer.batches[0],
            ["query: one", "query: two"],
        )
        self.assertEqual(vectors.shape, (5, 2))
        self.assertTrue(torch.allclose(torch.linalg.vector_norm(vectors, dim=1), torch.ones(5)))

    def test_unpaired_surrogates_are_sanitized_and_unicode_is_preserved(self):
        malformed = predict_topics_batch.sanitize_unpaired_surrogates("Review \ud800 text")
        self.assertEqual(malformed, "Review \ufffd text")
        self.assertEqual(
            predict_topics_batch.sanitize_unpaired_surrogates("Ganda \u2764\ufe0f\U0001f60a"),
            "Ganda \u2764\ufe0f\U0001f60a",
        )


if __name__ == "__main__":
    unittest.main()
