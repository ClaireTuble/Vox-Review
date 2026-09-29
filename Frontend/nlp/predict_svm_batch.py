"""Read review texts from stdin and emit only predicted Category codes as JSON."""

from __future__ import annotations

import json
import sys
from collections import Counter

from svm_model import MODEL_PATH, explain_category, predict_category
from svm_pipeline import load_svm_model


def main() -> None:
    payload = json.load(sys.stdin)
    reviews = payload.get("reviews") if isinstance(payload, dict) else None
    if not isinstance(reviews, list) or any(not isinstance(review, str) for review in reviews):
        raise ValueError("reviews must be a list of strings")

    model = load_svm_model(MODEL_PATH)
    try:
        results = [explain_category(review, model=model) for review in reviews]
        predictions = [result["category"] for result in results]
        category_drivers = {}
        for category in range(1, 7):
            frequencies = Counter(
                driver.casefold()
                for result in results
                if result["category"] == category
                for driver in set(result["emotionDrivers"])
            )
            surfaces = {
                driver.casefold(): driver
                for result in results
                if result["category"] == category
                for driver in result["emotionDrivers"]
            }
            category_drivers[str(category)] = [
                surfaces[term]
                for term, _ in frequencies.most_common(5)
            ]
    except Exception as error:
        print(f"SVM explanation unavailable: {error}", file=sys.stderr)
        predictions = [predict_category(review, model=model) for review in reviews]
        results = [
            {"category": category, "emotionDrivers": []}
            for category in predictions
        ]
        category_drivers = {}
    print(json.dumps({
        "predictions": predictions,
        "results": results,
        "categoryDrivers": category_drivers,
    }))


if __name__ == "__main__":
    main()