"""Batch prediction adapter for the production hybrid emotion classifier."""

from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from hybrid_emotion_classifier import EMOTIONS, HybridEmotionClassifier


EMOTION_TO_CATEGORY = {
    emotion: index + 1
    for index, emotion in enumerate(EMOTIONS)
}
MIN_FEATURE_CONTRIBUTION = 0.1
DRIVER_STOP_WORDS = ENGLISH_STOP_WORDS | {
    "ang", "at", "ba", "dahil", "daw", "din", "ito", "ko", "mga", "na",
    "naman", "ng", "ni", "pa", "pero", "po", "sa", "si", "sila", "yung",
}


def _word_vectorizer_layout(model: HybridEmotionClassifier) -> tuple[Any, int]:
    if model.feature_union_ is None:
        raise RuntimeError("Hybrid emotion model is missing its fitted feature union")
    offset = 0
    for name, vectorizer in model.feature_union_.transformer_list:
        if name == "word_tfidf":
            return vectorizer, offset
        offset += len(vectorizer.get_feature_names_out())
    raise RuntimeError("Hybrid emotion model has no word TF-IDF branch")


def _explain_review(
    review: str,
    category: int,
    row_features: Any,
    class_scores: np.ndarray,
    model: HybridEmotionClassifier,
    word_vectorizer: Any,
    word_offset: int,
) -> list[str]:
    base_model = model.base_model_
    if base_model is None:
        raise RuntimeError("Hybrid emotion model has no fitted base classifier")
    label = EMOTIONS[category - 1]
    target_index = int(np.flatnonzero(base_model.classes_ == label)[0])
    competing_scores = class_scores.copy()
    competing_scores[target_index] = -np.inf
    competitor_index = int(np.argmax(competing_scores))
    coefficient_delta = (
        base_model.coef_[target_index] - base_model.coef_[competitor_index]
    )
    word_features = word_vectorizer.get_feature_names_out()
    review_features = set(word_vectorizer.build_analyzer()(review))
    contributions: dict[str, float] = {}
    row = row_features.tocsr()
    for index, value in zip(row.indices, row.data):
        word_index = index - word_offset
        if not 0 <= word_index < len(word_features):
            continue
        feature = str(word_features[word_index]).casefold()
        terms = feature.split()
        if (
            feature not in review_features
            or not terms
            or len(terms) > 2
            or any(not term.isalpha() or term in DRIVER_STOP_WORDS for term in terms)
        ):
            continue
        contribution = float(value * coefficient_delta[index])
        if contribution > 0:
            contributions[feature] = max(
                contributions.get(feature, 0.0),
                contribution,
            )

    ranked = sorted(contributions.items(), key=lambda item: (-item[1], item[0]))
    strong = [
        item for item in ranked if item[1] >= MIN_FEATURE_CONTRIBUTION
    ]
    selected = strong[:5] if len(strong) >= 2 else ranked[:2]
    return [feature for feature, _ in selected]


def classify_reviews(
    reviews: list[str],
    model: HybridEmotionClassifier,
) -> dict[str, Any]:
    if not isinstance(reviews, list) or not reviews:
        raise ValueError("reviews must be a non-empty list of strings")
    features = model.transform_features(reviews)
    batch = model.predict_batch_features(features)
    predictions = [
        EMOTION_TO_CATEGORY[row["dominant_emotion"]]
        for row in batch["per_review"]
    ]
    word_vectorizer, word_offset = _word_vectorizer_layout(model)
    if model.base_model_ is None:
        raise RuntimeError("Hybrid emotion model has no fitted base classifier")
    class_scores = np.asarray(model.base_model_.decision_function(features))

    results = []
    per_review = []
    for index, (review, prediction, prediction_row) in enumerate(
        zip(reviews, predictions, batch["per_review"], strict=True)
    ):
        probabilities = prediction_row["probabilities"]
        results.append(
            {
                "category": prediction,
                "emotionDrivers": _explain_review(
                    review,
                    prediction,
                    features.getrow(index),
                    class_scores[index],
                    model,
                    word_vectorizer,
                    word_offset,
                ),
            }
        )
        per_review.append(
            {
                "reviewIndex": index,
                "category": prediction,
                "dominantEmotion": prediction_row["dominant_emotion"],
                "probabilities": probabilities,
            }
        )

    category_drivers: dict[str, list[str]] = {}
    for category in range(1, len(EMOTIONS) + 1):
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

    distribution = batch["distribution"]
    predicted_counts = {
        emotion: int(distribution[emotion]["count"])
        for emotion in EMOTIONS
    }
    return {
        "predictions": predictions,
        "results": results,
        "categoryDrivers": category_drivers,
        "totalReviews": int(batch["total_reviews"]),
        "dominantEmotion": str(batch["dominant_emotion"]),
        "distribution": distribution,
        "predictedCounts": predicted_counts,
        "perReview": per_review,
    }
