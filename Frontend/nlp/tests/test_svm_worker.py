"""Tests for the persistent SVM worker; tests load but never train the model."""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

NLP_DIR = Path(__file__).parent.parent
if str(NLP_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_DIR))
if str(NLP_DIR / "preprocessing") not in sys.path:
    sys.path.insert(0, str(NLP_DIR / "preprocessing"))

from predict_svm_batch import classify_reviews
from svm_model import MODEL_PATH
from svm_pipeline import load_svm_model
from svm_worker import run_worker


REVIEWS = [
    "I love the quality but delivery was late. Review sample 1.",
    "Good product, pero seller sent the wrong color. Review sample 2.",
    "The app is useful, but it crashes after one hour. Review sample 3.",
    "I am worried this battery may overheat. Review sample 4.",
    "Overall sulit, although the package arrived damaged. Review sample 5.",
]


def test_worker_loads_model_once_for_multiple_sequential_batches():
    loaded_models = []
    classified_batches = []

    def model_loader(model_path):
        model = object()
        loaded_models.append((model_path, model))
        return model

    def batch_classifier(reviews, model):
        classified_batches.append((reviews, model))
        return {"predictions": [1] * len(reviews), "results": [], "categoryDrivers": {}}

    requests = "\n".join([
        json.dumps({"id": 1, "reviews": ["first"]}),
        json.dumps({"id": 2, "reviews": ["second", "third"]}),
    ]) + "\n"
    output = io.StringIO()

    run_worker(
        input_stream=io.StringIO(requests),
        output_stream=output,
        model_loader=model_loader,
        batch_classifier=batch_classifier,
    )

    messages = [json.loads(line) for line in output.getvalue().splitlines()]
    assert loaded_models == [(MODEL_PATH, loaded_models[0][1])]
    assert len(classified_batches) == 2
    assert all(model is loaded_models[0][1] for _, model in classified_batches)
    assert [message.get("type") for message in messages[:1]] == ["ready"]
    assert [message["id"] for message in messages[1:]] == [1, 2]
    assert [message["predictions"] for message in messages[1:]] == [[1], [1, 1]]


def test_worker_preserves_pre_refactor_predictions_and_explanations():
    loaded_models = []

    def model_loader(model_path):
        model = load_svm_model(model_path)
        loaded_models.append(model)
        return model

    request_lines = "\n".join(
        json.dumps({"id": index + 1, "reviews": [review]})
        for index, review in enumerate(REVIEWS)
    ) + "\n"
    output = io.StringIO()
    run_worker(
        input_stream=io.StringIO(request_lines),
        output_stream=output,
        model_loader=model_loader,
        batch_classifier=classify_reviews,
    )

    messages = [json.loads(line) for line in output.getvalue().splitlines()]
    results = messages[1:]
    assert len(loaded_models) == 1
    assert [result["predictions"][0] for result in results] == [2, 3, 2, 5, 1]
    assert [result["results"][0]["contextualResolution"]["svmCategory"] for result in results] == [1, 2, 2, 1, 1]
    assert [result["results"][0]["category"] for result in results] == [2, 3, 2, 5, 1]
    assert all(isinstance(result["results"][0]["contextualResolution"]["explanation"], str) for result in results)
    assert all(isinstance(result["results"][0]["emotionDrivers"], list) for result in results)

    batched = classify_reviews(REVIEWS, loaded_models[0])
    assert batched["predictions"] == [2, 3, 2, 5, 1]
    assert [result["contextualResolution"]["svmCategory"] for result in batched["results"]] == [1, 2, 2, 1, 1]
    assert set(batched["categoryDrivers"]["1"]) == {
        "love", "late", "delivery", "late Review", "quality",
    }
    assert set(batched["categoryDrivers"]["2"]) == {
        "sample", "wrong color", "Good product", "color", "wrong",
    }
    assert all(not batched["categoryDrivers"][str(category)] for category in range(3, 7))