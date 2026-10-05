"""Long-lived JSON-lines worker for cached SVM emotion inference."""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from typing import Any, TextIO

from predict_svm_batch import classify_reviews
from svm_model import MODEL_PATH
from svm_pipeline import load_svm_model


def run_worker(
    input_stream: TextIO | None = None,
    output_stream: TextIO | None = None,
    *,
    model_loader: Callable[..., Any] = load_svm_model,
    batch_classifier: Callable[[list[str], Any], dict] = classify_reviews,
) -> None:
    source = input_stream or sys.stdin
    destination = output_stream or sys.stdout
    model = model_loader(MODEL_PATH)
    destination.write(json.dumps({"type": "ready"}) + "\n")
    destination.flush()

    for line in source:
        if not line.strip():
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            response = batch_classifier(request.get("reviews"), model)
            response.update({"id": request_id, "success": True})
        except Exception as error:
            print(
                f"SVM worker request failed: {type(error).__name__}",
                file=sys.stderr,
                flush=True,
            )
            response = {
                "id": request_id,
                "success": False,
                "error": "SVM worker failed to process this batch.",
            }
        destination.write(json.dumps(response) + "\n")
        destination.flush()


if __name__ == "__main__":
    try:
        run_worker()
    except Exception as error:
        print(f"SVM worker startup failed: {type(error).__name__}", file=sys.stderr, flush=True)
        raise