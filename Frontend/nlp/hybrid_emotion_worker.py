"""Long-lived JSON-lines worker for pinned hybrid emotion inference."""

from __future__ import annotations

import hashlib
import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any, TextIO

from hybrid_emotion_classifier import HybridEmotionClassifier
from predict_hybrid_emotion_batch import classify_reviews


MODEL_PATH = Path(__file__).parent / "models" / "hybrid_emotion_model.joblib"
EXPECTED_ARTIFACT_SHA256 = (
    "7bb99751451f878083d2c8da615dc4f0f230f7684dc92fd82f9e71806d6d2861"
)


def run_worker(
    input_stream: TextIO | None = None,
    output_stream: TextIO | None = None,
    *,
    model_loader: Callable[..., Any] = HybridEmotionClassifier.load,
    batch_classifier: Callable[..., dict[str, Any]] = classify_reviews,
) -> None:
    source = input_stream or sys.stdin
    destination = output_stream or sys.stdout
    artifact_sha256 = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    if artifact_sha256 != EXPECTED_ARTIFACT_SHA256:
        raise RuntimeError("Hybrid emotion artifact SHA-256 does not match the pinned value")
    model = model_loader(MODEL_PATH)
    model_provenance = {
        "modelIdentifier": "hybrid_oof_stacking",
        "inferencePolicy": "hybrid_oof_stacking",
        "artifactSha256": artifact_sha256,
        "architecture": "word_char_tfidf_oof_stacking",
        "specialistThresholds": {
            emotion: {
                "status": row["status"],
                "threshold": row["threshold"],
            }
            for emotion, row in model.specialist_thresholds_.items()
        },
    }
    destination.write(json.dumps({"type": "ready"}) + "\n")
    destination.flush()

    for line in source:
        if not line.strip():
            continue
        request_id = None
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("worker request must be a JSON object")
            request_id = request.get("id")
            response = batch_classifier(request.get("reviews"), model)
            response.update(
                {
                    "id": request_id,
                    "success": True,
                    "modelProvenance": model_provenance,
                }
            )
        except Exception as error:
            print(
                f"Hybrid emotion worker request failed: {type(error).__name__}",
                file=sys.stderr,
                flush=True,
            )
            response = {
                "id": request_id,
                "success": False,
                "error": "Hybrid emotion worker failed to process this batch.",
            }
        destination.write(json.dumps(response) + "\n")
        destination.flush()


if __name__ == "__main__":
    try:
        run_worker()
    except Exception as error:
        print(
            f"Hybrid emotion worker startup failed: {type(error).__name__}",
            file=sys.stderr,
            flush=True,
        )
        raise
