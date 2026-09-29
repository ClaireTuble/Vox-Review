import os
import unittest
from unittest.mock import patch

import predict_topics_batch
from topic_taxonomy import TOPIC_LABELS, TOPIC_MODEL_NAME, TOPIC_TAXONOMY


class FakeClassifier:
    def __init__(self):
        self.model = self
        self.request = None
        self.received_reviews = []

    def eval(self):
        return self

    def __call__(self, reviews, **request):
        self.request = request
        self.received_reviews.append(list(reviews))
        labels = request["candidate_labels"]
        return [
            {
                "labels": labels,
                "scores": [0.8 if label.startswith("Quality:") else 0.1 for label in labels],
            }
            for _ in reviews
        ]


class TopicProviderTests(unittest.TestCase):
    def run_with_provider(self, provider=None, threshold=None):
        environment = {}
        if provider is not None:
            environment["TOPIC_MODEL_PROVIDER"] = provider
        if threshold is not None:
            environment["TOPIC_CONFIDENCE_THRESHOLD"] = str(threshold)
        classifier = FakeClassifier()
        with patch.dict(os.environ, environment, clear=True), patch.object(
            predict_topics_batch, "get_classifier", return_value=classifier
        ):
            response = predict_topics_batch.classify_reviews(["A durable product.", "Works well."])
        return response, classifier

    def assert_classifier_receives_sanitized_review(self, review, expected):
        classifier = FakeClassifier()
        with patch.object(predict_topics_batch, "get_topic_configuration", return_value=("minilm", "test-model", 0.5)), patch.object(
            predict_topics_batch, "get_classifier", return_value=classifier
        ):
            response = predict_topics_batch.classify_reviews([review])

        self.assertEqual(response["results"][0]["reviewIndex"], 0)
        self.assertEqual(classifier.received_reviews, [[expected]])
        self.assertTrue(all(isinstance(text, str) for batch in classifier.received_reviews for text in batch))
        self.assertFalse(any(
            0xD800 <= ord(character) <= 0xDFFF
            for batch in classifier.received_reviews
            for text in batch
            for character in text
        ))

    def test_sanitizer_preserves_normal_english(self):
        text = "A normal English review with punctuation."

        self.assertEqual(predict_topics_batch.sanitize_unpaired_surrogates(text), text)

    def test_sanitizer_preserves_taglish(self):
        text = "Ang ganda nito, sulit talaga!"

        self.assertEqual(predict_topics_batch.sanitize_unpaired_surrogates(text), text)

    def test_sanitizer_preserves_emoji(self):
        text = "Ganda \u2764\ufe0f\U0001f60a"

        self.assertEqual(predict_topics_batch.sanitize_unpaired_surrogates(text), text)

    def test_unpaired_high_surrogate_is_replaced_before_classifier_calls(self):
        self.assert_classifier_receives_sanitized_review("Review \ud800 text", "Review \ufffd text")

    def test_unpaired_low_surrogate_is_replaced_before_classifier_calls(self):
        self.assert_classifier_receives_sanitized_review("Review \udc00 text", "Review \ufffd text")

    def test_normal_review_without_malformed_characters_is_unchanged(self):
        text = "Fast delivery, maayos ang quality, and works as expected."

        self.assert_classifier_receives_sanitized_review(text, text)

    def test_batch_classifier_receives_sanitized_reviews(self):
        reviews = ["Works well.", "Review \ud800 text", "Ganda \u2764\ufe0f\U0001f60a", "Review \udc00 text"]
        expected = ["Works well.", "Review \ufffd text", "Ganda \u2764\ufe0f\U0001f60a", "Review \ufffd text"]
        classifier = FakeClassifier()

        with patch.object(predict_topics_batch, "get_topic_configuration", return_value=("minilm", "test-model", 0.5)), patch.object(
            predict_topics_batch, "get_classifier", return_value=classifier
        ):
            response = predict_topics_batch.classify_reviews(reviews)

        self.assertEqual(classifier.received_reviews, [expected])
        self.assertEqual(len(response["results"]), len(expected))

    def test_mdeberta_remains_the_default(self):
        response, classifier = self.run_with_provider()

        self.assertEqual(response["provider"], "mdeberta")
        self.assertEqual(response["model"], TOPIC_MODEL_NAME)
        self.assertEqual(response["threshold"], 0.35)
        self.assertEqual(classifier.request["hypothesis_template"], "This review discusses {}.")
        self.assertTrue(classifier.request["multi_label"])
        self.assertEqual(
            classifier.request["candidate_labels"],
            [f"{topic['label']}: {topic['definition']}" for topic in TOPIC_TAXONOMY],
        )
        self.assertEqual(
            [result["topics"] for result in response["results"]],
            [
                [{"label": "Quality", "score": 0.8}],
                [{"label": "Quality", "score": 0.8}],
            ],
        )
        self.assertEqual(len(response["results"][0]["topicScores"]), len(TOPIC_LABELS))
        self.assertEqual(response["results"][0]["topicScores"][0], {"label": "Quality", "score": 0.8})
        self.assertEqual(response["results"][0]["topicScores"][1], {"label": TOPIC_LABELS[1], "score": 0.1})

    def test_minilm_uses_candidate_model_and_threshold(self):
        response, _ = self.run_with_provider("minilm")

        self.assertEqual(response["provider"], "minilm")
        self.assertEqual(response["model"], "MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli")
        self.assertEqual(response["threshold"], 0.5)
        self.assertEqual(response["results"][0]["reviewIndex"], 0)
        self.assertEqual(response["results"][0]["topics"][0]["label"], TOPIC_LABELS[0])

    def test_minilm_threshold_can_be_overridden_without_changing_model(self):
        response, _ = self.run_with_provider("minilm", 0.65)

        self.assertEqual(response["provider"], "minilm")
        self.assertEqual(response["model"], "MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli")
        self.assertEqual(response["threshold"], 0.65)
        self.assertEqual(response["results"][0]["topics"], [{"label": "Quality", "score": 0.8}])


if __name__ == "__main__":
    unittest.main()