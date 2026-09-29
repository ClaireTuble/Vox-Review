"""Classify reviews with a multilingual, multi-label zero-shot NLI model."""

from __future__ import annotations

import json
import os
import sys
from time import perf_counter

import torch
from transformers import pipeline

from topic_taxonomy import TOPIC_CONFIDENCE_THRESHOLD, TOPIC_LABELS, TOPIC_MODEL_NAME, TOPIC_TAXONOMY

TOPIC_BATCH_SIZE = int(os.getenv("TOPIC_BATCH_SIZE", "4"))
TOPIC_MODEL_PROVIDERS = {
    "mdeberta": {
        "model": TOPIC_MODEL_NAME,
        "threshold": TOPIC_CONFIDENCE_THRESHOLD,
    },
    "minilm": {
        "model": "MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli",
        "threshold": 0.50,
    },
}
_classifier = None
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


def get_topic_configuration() -> tuple[str, str, float]:
    provider_setting = os.getenv("TOPIC_MODEL_PROVIDER")
    provider = (provider_setting or "mdeberta").strip().lower()
    if provider not in TOPIC_MODEL_PROVIDERS:
        raise ValueError("TOPIC_MODEL_PROVIDER must be 'mdeberta' or 'minilm'")

    provider_config = TOPIC_MODEL_PROVIDERS[provider]
    model_name = provider_config["model"]
    if provider_setting is None and os.getenv("TOPIC_MODEL_NAME"):
        model_name = os.environ["TOPIC_MODEL_NAME"]

    threshold_setting = os.getenv("TOPIC_CONFIDENCE_THRESHOLD")
    threshold = float(threshold_setting) if threshold_setting is not None else provider_config["threshold"]
    if not 0 <= threshold <= 1:
        raise ValueError("TOPIC_CONFIDENCE_THRESHOLD must be between 0 and 1")

    return provider, model_name, threshold


def get_classifier(model_name: str):
    global _classifier
    if _classifier is None:
        load_started = perf_counter()
        log_model_event("model_load_start", cached=False)
        try:
            classifier = pipeline(
                "zero-shot-classification",
                model=model_name,
                device=-1,
            )
            classifier.model.eval()
        except Exception:
            log_model_event(
                "model_load_failed",
                loadDurationMs=round((perf_counter() - load_started) * 1000, 3),
            )
            raise
        _classifier = classifier
        log_model_event(
            "model_load_complete",
            cached=False,
            loadDurationMs=round((perf_counter() - load_started) * 1000, 3),
        )
    else:
        log_model_event("model_cache_reused", cached=True, loadDurationMs=0)
    return _classifier


def sanitize_unpaired_surrogates(text: str) -> str:
    return text.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace")


def classify_reviews(reviews: list[str]) -> dict:
    if not isinstance(reviews, list) or any(not isinstance(review, str) or not review.strip() for review in reviews):
        raise ValueError("reviews must be a list of non-empty strings")
    provider, model_name, threshold = get_topic_configuration()

    if TOPIC_BATCH_SIZE < 1:
        raise ValueError("TOPIC_BATCH_SIZE must be at least 1")

    classifier = get_classifier(model_name)
    candidate_labels = [
        f"{topic['label']}: {topic['definition']}"
        for topic in TOPIC_TAXONOMY
    ]
    label_lookup = dict(zip(candidate_labels, TOPIC_LABELS))
    hypothesis_template = "This review discusses {}."
    results = []

    classifier_input = [sanitize_unpaired_surrogates(review) for review in reviews]
    with torch.inference_mode():
        raw_results = classifier(
            classifier_input,
            candidate_labels=candidate_labels,
            hypothesis_template=hypothesis_template,
            multi_label=True,
            batch_size=TOPIC_BATCH_SIZE,
            truncation=True,
            max_length=256,
        )
        for review_index, result in enumerate(raw_results):
            scores = {
                label_lookup[label]: score
                for label, score in zip(result["labels"], result["scores"])
            }
            assignments = [
                {"label": topic["label"], "score": round(float(scores.get(topic["label"], 0)), 4)}
                for topic in TOPIC_TAXONOMY
                if scores.get(topic["label"], 0) >= threshold
            ]
            topic_scores = [
                {"label": topic["label"], "score": float(scores.get(topic["label"], 0))}
                for topic in TOPIC_TAXONOMY
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
    print(json.dumps(classify_reviews(reviews)))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Topic classification failed: {error}", file=sys.stderr)
        raise
