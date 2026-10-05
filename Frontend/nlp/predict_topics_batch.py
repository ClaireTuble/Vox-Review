"""Classify reviews with multilingual E5 topic-description similarity."""

from __future__ import annotations

import json
import os
import sys
from time import perf_counter

import torch
import torch.nn.functional as functional
from transformers import AutoModel, AutoTokenizer

from topic_applicability import apply_platform_applicability
from topic_taxonomy import TOPIC_E5_DESCRIPTIONS, TOPIC_LABELS, TOPIC_MODEL_NAME

TOPIC_BATCH_SIZE = int(os.getenv("TOPIC_BATCH_SIZE", "16"))
MAX_LENGTH = 512
REVIEW_PREFIX = "query: "
TOPIC_PREFIX = "passage: "
_tokenizer = None
_model = None
_topic_embeddings = None
_diagnostic_request_id = None


def set_topic_request_id(request_id) -> None:
    global _diagnostic_request_id
    _diagnostic_request_id = request_id


def log_model_event(event: str, **metadata) -> None:
    print(
        json.dumps({
            "event": event,
            "workerPid": os.getpid(),
            "requestId": _diagnostic_request_id,
            **metadata,
        }),
        file=sys.stderr,
        flush=True,
    )


def get_topic_configuration() -> tuple[str, str, None]:
    return "e5", TOPIC_MODEL_NAME, None


def encode_texts(texts, prefix: str, tokenizer, model) -> torch.Tensor:
    embeddings = []
    for start in range(0, len(texts), TOPIC_BATCH_SIZE):
        batch = [prefix + text for text in texts[start:start + TOPIC_BATCH_SIZE]]
        tokens = tokenizer(
            batch,
            max_length=MAX_LENGTH,
            padding=True,
            truncation=True,
            return_tensors="pt",
        )
        with torch.inference_mode():
            hidden = model(**tokens).last_hidden_state
            mask = tokens["attention_mask"].unsqueeze(-1).to(dtype=hidden.dtype)
            pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
            embeddings.append(functional.normalize(pooled, p=2, dim=1))
    return torch.cat(embeddings, dim=0)


def get_topic_embeddings():
    global _tokenizer, _model, _topic_embeddings

    if _model is None or _tokenizer is None:
        load_started = perf_counter()
        log_model_event("model_load_start", cached=False, model=TOPIC_MODEL_NAME)
        try:
            tokenizer = AutoTokenizer.from_pretrained(TOPIC_MODEL_NAME)
            model = AutoModel.from_pretrained(TOPIC_MODEL_NAME)
            model.eval()
        except Exception:
            log_model_event(
                "model_load_failed",
                loadDurationMs=round((perf_counter() - load_started) * 1000, 3),
            )
            raise
        _tokenizer = tokenizer
        _model = model
        log_model_event(
            "model_load_complete",
            cached=False,
            loadDurationMs=round((perf_counter() - load_started) * 1000, 3),
        )
    else:
        log_model_event("model_cache_reused", cached=True, loadDurationMs=0)

    if _topic_embeddings is None:
        descriptions = [topic["description"] for topic in TOPIC_E5_DESCRIPTIONS]
        embeddings = encode_texts(descriptions, TOPIC_PREFIX, _tokenizer, _model)
        if embeddings.shape[0] != len(TOPIC_LABELS):
            raise ValueError("E5 topic embeddings do not match the 11-topic taxonomy")
        _topic_embeddings = embeddings

    return _tokenizer, _model, _topic_embeddings


def sanitize_unpaired_surrogates(text: str) -> str:
    return text.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace")


def select_top_two(scores: torch.Tensor) -> list[int]:
    return sorted(
        range(len(TOPIC_LABELS)),
        key=lambda index: (-float(scores[index]), index),
    )[:2]


def classify_reviews(reviews: list[str], platform: str | None = None) -> dict:
    if not isinstance(reviews, list) or any(
        not isinstance(review, str) or not review.strip()
        for review in reviews
    ):
        raise ValueError("reviews must be a list of non-empty strings")
    if TOPIC_BATCH_SIZE < 1:
        raise ValueError("TOPIC_BATCH_SIZE must be at least 1")

    provider, model_name, threshold = get_topic_configuration()
    if not reviews:
        return {
            "provider": provider,
            "model": model_name,
            "threshold": threshold,
            "results": [],
        }

    tokenizer, model, topic_embeddings = get_topic_embeddings()
    classifier_input = [sanitize_unpaired_surrogates(review) for review in reviews]
    with torch.inference_mode():
        review_embeddings = encode_texts(classifier_input, REVIEW_PREFIX, tokenizer, model)
        similarities = review_embeddings @ topic_embeddings.T

    results = []
    for review_index, scores in enumerate(similarities):
        selected_indices = set(select_top_two(scores))
        assignments = [
            {
                "label": topic["label"],
                "score": round(float(scores[index]), 4),
            }
            for index, topic in enumerate(TOPIC_E5_DESCRIPTIONS)
            if index in selected_indices
        ]
        assignments = apply_platform_applicability(
            assignments,
            reviews[review_index],
            platform,
        )
        topic_scores = [
            {"label": label, "score": float(scores[index])}
            for index, label in enumerate(TOPIC_LABELS)
        ]
        results.append({
            "reviewIndex": review_index,
            "topics": assignments,
            "topicScores": topic_scores,
        })

    return {
        "provider": provider,
        "model": model_name,
        "threshold": threshold,
        "results": results,
    }


def main() -> None:
    payload = json.load(sys.stdin)
    reviews = payload.get("reviews") if isinstance(payload, dict) else None
    platform = payload.get("platform") if isinstance(payload, dict) else None
    print(json.dumps(classify_reviews(reviews, platform)))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Topic classification failed: {error}", file=sys.stderr)
        raise
