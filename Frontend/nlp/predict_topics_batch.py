"""Classify reviews with multilingual E5 topic-description similarity."""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from time import perf_counter

import torch
import torch.nn.functional as functional
from transformers import AutoModel, AutoTokenizer

from topic_applicability import apply_platform_applicability
from topic_refinement import refine_topic_scores
from topic_taxonomy import (
    TOPIC_CONFIDENCE_THRESHOLD,
    TOPIC_E5_DESCRIPTIONS,
    TOPIC_LABELS,
    TOPIC_MODEL_NAME,
)

TOPIC_BATCH_SIZE = int(os.getenv("TOPIC_BATCH_SIZE", "16"))
TOPIC_KEYWORD_BATCH_SIZE = 64
MAX_TORCH_THREADS = 8
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


def encode_texts(
    texts,
    prefix: str,
    tokenizer,
    model,
    batch_size: int | None = None,
) -> torch.Tensor:
    batch_size = TOPIC_BATCH_SIZE if batch_size is None else batch_size
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1")
    embeddings = []
    for start in range(0, len(texts), batch_size):
        batch = [prefix + text for text in texts[start:start + batch_size]]
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


def get_cgroup_cpu_quota_values() -> tuple[int, int] | None:
    quota_files = (
        (Path("/sys/fs/cgroup/cpu.max"), None),
        (
            Path("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"),
            Path("/sys/fs/cgroup/cpu/cpu.cfs_period_us"),
        ),
    )
    for quota_path, period_path in quota_files:
        try:
            if period_path is None:
                quota_text, period_text = quota_path.read_text().split()
                if quota_text == "max":
                    continue
                quota, period = int(quota_text), int(period_text)
            else:
                quota = int(quota_path.read_text())
                period = int(period_path.read_text())
        except (OSError, ValueError):
            continue
        if quota > 0 and period > 0:
            return quota, period
    return None


def get_cgroup_cpu_quota_count() -> int | None:
    quota_values = get_cgroup_cpu_quota_values()
    if quota_values is None:
        return None
    quota, period = quota_values
    return max(1, math.floor(quota / period))


def get_topic_torch_thread_limit(
    process_cpu_count: int | None = None,
    cpu_quota_count: int | None = None,
    cpu_affinity_count: int | None = None,
) -> int:
    available_cpus = process_cpu_count or 1
    if cpu_affinity_count is not None:
        available_cpus = min(available_cpus, cpu_affinity_count)
    if cpu_quota_count is not None:
        available_cpus = min(available_cpus, cpu_quota_count)
    return max(1, min(available_cpus, MAX_TORCH_THREADS))


def get_cpu_affinity_count() -> int | None:
    try:
        return len(os.sched_getaffinity(0))
    except (AttributeError, OSError):
        return None


def configure_torch_threads() -> int:
    current_threads = torch.get_num_threads()
    process_cpu_count = getattr(os, "process_cpu_count", os.cpu_count)() or 1
    cpu_affinity_count = get_cpu_affinity_count()
    cpu_quota_values = get_cgroup_cpu_quota_values()
    cpu_quota_count = get_cgroup_cpu_quota_count()
    thread_limit = get_topic_torch_thread_limit(
        process_cpu_count,
        cpu_quota_count,
        cpu_affinity_count,
    )
    configured_threads = min(current_threads, thread_limit)
    if configured_threads != current_threads:
        torch.set_num_threads(configured_threads)
    os.environ["OMP_NUM_THREADS"] = str(configured_threads)
    os.environ["MKL_NUM_THREADS"] = str(configured_threads)
    if hasattr(torch, "set_num_interop_threads"):
        try:
            torch.set_num_interop_threads(1)
        except RuntimeError:
            pass
    log_model_event(
        "torch_thread_configuration",
        previousTorchNumThreads=current_threads,
        torchNumThreads=torch.get_num_threads(),
        processCpuCount=process_cpu_count,
        cpuAffinityCount=cpu_affinity_count,
        cgroupCpuQuotaCount=cpu_quota_count,
        cpuQuotaMicros=cpu_quota_values[0] if cpu_quota_values else None,
        cpuQuotaPeriodMicros=cpu_quota_values[1] if cpu_quota_values else None,
        torchThreadLimit=thread_limit,
    )
    return configured_threads


configure_torch_threads()


def get_topic_embeddings():
    global _tokenizer, _model, _topic_embeddings

    configure_torch_threads()
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
        embedding_started = perf_counter()
        log_model_event(
            "topic_embeddings_start",
            descriptionCount=len(TOPIC_E5_DESCRIPTIONS),
        )
        descriptions = [topic["description"] for topic in TOPIC_E5_DESCRIPTIONS]
        embeddings = encode_texts(descriptions, TOPIC_PREFIX, _tokenizer, _model)
        if embeddings.shape[0] != len(TOPIC_LABELS):
            raise ValueError("E5 topic embeddings do not match the 11-topic taxonomy")
        _topic_embeddings = embeddings
        log_model_event(
            "topic_embeddings_complete",
            embeddingDurationMs=round((perf_counter() - embedding_started) * 1000, 3),
            embeddingCount=embeddings.shape[0],
        )
    else:
        log_model_event("topic_embeddings_cache_reused", cached=True)

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
    inference_started = perf_counter()
    log_model_event(
        "review_inference_start",
        reviewCount=len(reviews),
        torchNumThreads=torch.get_num_threads(),
    )
    with torch.inference_mode():
        review_embeddings = encode_texts(classifier_input, REVIEW_PREFIX, tokenizer, model)
        similarities = review_embeddings @ topic_embeddings.T
    log_model_event(
        "review_inference_complete",
        inferenceDurationMs=round((perf_counter() - inference_started) * 1000, 3),
        reviewCount=len(reviews),
    )

    refinement_started = perf_counter()
    results = []
    for review_index, scores in enumerate(similarities):
        raw_scores = {
            label: float(scores[index])
            for index, label in enumerate(TOPIC_LABELS)
        }
        refined_scores = refine_topic_scores(
            classifier_input[review_index],
            raw_scores,
            TOPIC_CONFIDENCE_THRESHOLD,
        )
        selection_scores = torch.tensor(
            [refined_scores[label] for label in TOPIC_LABELS],
            dtype=scores.dtype,
        )
        selected_indices = select_top_two(selection_scores)
        assignments = [
            {
                "label": TOPIC_LABELS[index],
                "score": round(float(selection_scores[index]), 4),
            }
            for index in selected_indices
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

    log_model_event(
        "topic_refinement_complete",
        refinementDurationMs=round((perf_counter() - refinement_started) * 1000, 3),
        resultCount=len(results),
    )
    return {
        "provider": provider,
        "model": model_name,
        "threshold": threshold,
        "results": results,
    }


def score_topic_candidates(reviews: list[str]) -> dict:
    if not isinstance(reviews, list) or any(
        not isinstance(review, str) or not review.strip()
        for review in reviews
    ):
        raise ValueError("reviews must be a list of non-empty strings")
    if TOPIC_KEYWORD_BATCH_SIZE < 1:
        raise ValueError("TOPIC_KEYWORD_BATCH_SIZE must be at least 1")

    provider, model_name, _ = get_topic_configuration()
    if not reviews:
        return {
            "provider": provider,
            "model": model_name,
            "results": [],
        }

    tokenizer, model, topic_embeddings = get_topic_embeddings()
    candidates = [sanitize_unpaired_surrogates(review) for review in reviews]
    inference_started = perf_counter()
    log_model_event(
        "keyword_score_inference_start",
        candidateCount=len(candidates),
        batchSize=TOPIC_KEYWORD_BATCH_SIZE,
        torchNumThreads=torch.get_num_threads(),
    )
    with torch.inference_mode():
        candidate_embeddings = encode_texts(
            candidates,
            REVIEW_PREFIX,
            tokenizer,
            model,
            batch_size=TOPIC_KEYWORD_BATCH_SIZE,
        )
        similarities = candidate_embeddings @ topic_embeddings.T
    log_model_event(
        "keyword_score_inference_complete",
        inferenceDurationMs=round((perf_counter() - inference_started) * 1000, 3),
        candidateCount=len(candidates),
        batchSize=TOPIC_KEYWORD_BATCH_SIZE,
    )

    return {
        "provider": provider,
        "model": model_name,
        "results": [
            {
                "reviewIndex": candidate_index,
                "topicScores": [
                    {"label": label, "score": float(scores[index])}
                    for index, label in enumerate(TOPIC_LABELS)
                ],
            }
            for candidate_index, scores in enumerate(similarities)
        ],
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
