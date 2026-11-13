"""Probability-stacked six-class Logistic Regression with minority specialists."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Self

import joblib
import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import FeatureUnion


EMOTIONS = ("Happy", "Sad", "Anger", "Disgust", "Fear", "Sarcastic")
SPECIALIST_EMOTIONS = ("Disgust", "Fear", "Sarcastic")
MIN_SPECIALIST_EXAMPLES = 5
WORD_MAX_FEATURES = 8000
CHAR_MAX_FEATURES = 8000
META_CLASS_WEIGHT_EXPONENT = 0.55
PROBABILITY_FLOOR = 0.01
SPECIALIST_THRESHOLD_MIN = 0.30
SPECIALIST_THRESHOLD_MAX = 0.90
SPECIALIST_THRESHOLD_STEP = 0.01
SPECIALIST_MAX_FPR = 0.025
SPECIALIST_MIN_PREDICTIONS = 2
SPECIALIST_MIN_PREDICTIONS_BY_EMOTION = {
    "Disgust": 2,
    "Fear": 1,
    "Sarcastic": 2,
}
SPECIALIST_FALLBACK_THRESHOLD = 1.01
OOF_FOLDS = 5


def _compute_power_smoothed_class_weights(
    y_labels: list[str],
    exponent: float = META_CLASS_WEIGHT_EXPONENT,
) -> dict[str, float]:
    counts = Counter(y_labels)
    if any(counts[emotion] == 0 for emotion in EMOTIONS):
        raise ValueError("Class weights require examples from all six emotions")
    if not np.isfinite(exponent) or exponent <= 0:
        raise ValueError("class-weight exponent must be finite and positive")
    total = len(y_labels)
    return {
        emotion: float((total / (len(EMOTIONS) * counts[emotion])) ** exponent)
        for emotion in EMOTIONS
    }


def _build_feature_union() -> FeatureUnion:
    return FeatureUnion(
        [
            (
                "word_tfidf",
                TfidfVectorizer(
                    ngram_range=(1, 2),
                    max_features=WORD_MAX_FEATURES,
                    sublinear_tf=True,
                ),
            ),
            (
                "char_wb_tfidf",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    max_features=CHAR_MAX_FEATURES,
                    sublinear_tf=True,
                ),
            ),
        ]
    )


def _validate_feature_matrix(
    features: sparse.spmatrix,
    expected_rows: int | None = None,
) -> sparse.csr_matrix:
    values = sparse.csr_matrix(features, dtype=np.float32)
    if values.ndim != 2 or values.shape[0] == 0 or values.shape[1] == 0:
        raise ValueError("features must be a non-empty two-dimensional matrix")
    if expected_rows is not None and values.shape[0] != expected_rows:
        raise ValueError("feature rows must align with the associated texts or labels")
    if not np.all(np.isfinite(values.data)):
        raise ValueError("features must contain only finite values")
    return values


def _order_probability_columns(
    probabilities: np.ndarray,
    source_classes: list[str] | np.ndarray,
    target_classes: tuple[str, ...],
) -> np.ndarray:
    column_by_class = {
        str(label): index for index, label in enumerate(source_classes)
    }
    return probabilities[:, [column_by_class[label] for label in target_classes]]


def _apply_zero_free_smoothing(
    probs: np.ndarray,
    min_floor: float = PROBABILITY_FLOOR,
) -> np.ndarray:
    """Floor six-class probabilities, normalize rows, and preserve the winner."""
    values = np.asarray(probs, dtype=float)
    if values.ndim not in (1, 2) or values.shape[-1] != len(EMOTIONS):
        raise ValueError("probs must have six emotion probabilities per row")
    if not np.all(np.isfinite(values)) or np.any(values < 0):
        raise ValueError("probs must contain finite, non-negative values")
    if not np.isfinite(min_floor) or min_floor <= 0 or min_floor >= 1 / len(EMOTIONS):
        raise ValueError("min_floor must be finite and strictly between 0 and 1/6")
    totals = values.sum(axis=-1, keepdims=True)
    if np.any(totals <= 0):
        raise ValueError("each probability row must have a positive sum")

    normalized = values / totals
    dominant_before = np.argmax(normalized, axis=-1)
    smoothed = np.maximum(normalized, min_floor)
    smoothed /= smoothed.sum(axis=-1, keepdims=True)
    if not np.array_equal(np.argmax(smoothed, axis=-1), dominant_before):
        raise ArithmeticError("Probability smoothing changed the dominant emotion")
    return smoothed


def _apply_aggregate_floor(probs: np.ndarray) -> np.ndarray:
    """Enforce a 1% minimum while preserving the original probability order."""
    values = np.asarray(probs, dtype=float)
    if values.ndim != 1 or values.shape[0] != len(EMOTIONS):
        raise ValueError("aggregate probabilities must contain six values")
    normalized = _apply_zero_free_smoothing(values)
    fixed = normalized < PROBABILITY_FLOOR
    result = np.zeros_like(normalized)
    while True:
        result[fixed] = PROBABILITY_FLOOR
        available = ~fixed
        remaining_mass = 1.0 - PROBABILITY_FLOOR * int(fixed.sum())
        available_weights = normalized[available]
        if not np.any(available) or available_weights.sum() <= 0:
            raise ArithmeticError("Could not preserve the aggregate probability distribution")
        result[available] = available_weights * (remaining_mass / available_weights.sum())
        newly_fixed = available & (result < PROBABILITY_FLOOR)
        if not np.any(newly_fixed):
            return result
        fixed |= newly_fixed


def _select_specialist_threshold(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    *,
    max_fpr: float = SPECIALIST_MAX_FPR,
    minimum_predictions: int = SPECIALIST_MIN_PREDICTIONS,
) -> dict[str, float | int | str]:
    truth = np.asarray(y_true, dtype=bool)
    scores = np.asarray(probabilities, dtype=float)
    if truth.ndim != 1 or scores.shape != truth.shape or not len(truth):
        raise ValueError("specialist labels and probabilities must be non-empty vectors")
    if not np.all(np.isfinite(scores)) or np.any(scores < 0) or np.any(scores > 1):
        raise ValueError("specialist probabilities must be finite values in [0, 1]")
    if not np.isfinite(max_fpr) or not 0 <= max_fpr <= 1:
        raise ValueError("max_fpr must be between zero and one")
    if not isinstance(minimum_predictions, int) or minimum_predictions < 1:
        raise ValueError("minimum_predictions must be a positive integer")
    negatives = int((~truth).sum())
    positives = int(truth.sum())
    if negatives == 0 or positives == 0:
        raise ValueError("threshold tuning requires both positive and negative examples")

    candidates = np.round(
        np.linspace(
            SPECIALIST_THRESHOLD_MIN,
            SPECIALIST_THRESHOLD_MAX,
            int(
                round(
                    (SPECIALIST_THRESHOLD_MAX - SPECIALIST_THRESHOLD_MIN)
                    / SPECIALIST_THRESHOLD_STEP
                )
            )
            + 1,
        ),
        2,
    )
    feasible: list[tuple[float, float, int, int, int]] = []
    nonzero_recall_candidates: list[tuple[float, float, int, int, int]] = []
    for threshold in candidates:
        predicted = scores >= threshold
        predicted_count = int(predicted.sum())
        true_positive = int(np.count_nonzero(predicted & truth))
        false_positive = predicted_count - true_positive
        false_positive_rate = false_positive / negatives
        if true_positive:
            false_negative = positives - true_positive
            f1 = 2 * true_positive / (
                2 * true_positive + false_positive + false_negative
            )
            nonzero_recall_candidates.append(
                (
                    float(false_positive_rate),
                    float(threshold),
                    true_positive,
                    false_positive,
                    predicted_count,
                )
            )
        if predicted_count < minimum_predictions or true_positive == 0:
            continue
        if false_positive_rate > max_fpr:
            continue
        false_negative = positives - true_positive
        f1 = (
            2 * true_positive / (2 * true_positive + false_positive + false_negative)
            if true_positive or false_positive or false_negative
            else 0.0
        )
        feasible.append(
            (float(f1), float(threshold), true_positive, false_positive, predicted_count)
        )
    if not feasible:
        best_candidate = min(
            nonzero_recall_candidates,
            key=lambda item: (item[0], -item[2], -item[1]),
            default=None,
        )
        diagnostic = (
            (
                "; best nonzero-recall candidate: "
                f"threshold={best_candidate[1]:.2f}, "
                f"FPR={best_candidate[0]:.6f}, "
                f"true positives={best_candidate[2]}, "
                f"predictions={best_candidate[4]}"
            )
            if best_candidate is not None
            else "; no threshold produced a true positive"
        )
        raise RuntimeError(
            "No specialist threshold in "
            f"[{SPECIALIST_THRESHOLD_MIN:.2f}, {SPECIALIST_THRESHOLD_MAX:.2f}] "
            f"satisfies FPR <= {max_fpr:.3f}, at least "
            f"{minimum_predictions} predicted positives, and non-zero recall "
            f"(positive support={positives}, negative support={negatives}, "
            f"maximum score={float(scores.max()):.6f}{diagnostic})"
        )

    best_f1, threshold, true_positive, false_positive, predicted_count = max(
        feasible,
        key=lambda item: (item[0], item[1]),
    )
    return {
        "status": "selected",
        "threshold": threshold,
        "f1": best_f1,
        "true_positives": true_positive,
        "false_positives": false_positive,
        "predicted_positives": predicted_count,
        "recall": true_positive / positives,
        "false_positive_rate": false_positive / negatives,
    }


def _redistribute_with_floor(
    probabilities: np.ndarray,
    total_mass: float,
    min_floor: float,
) -> np.ndarray:
    values = np.asarray(probabilities, dtype=float)
    if total_mass < len(values) * min_floor - 1e-12:
        raise ValueError("total probability mass cannot satisfy the requested floor")
    fixed = np.zeros(len(values), dtype=bool)
    result = np.zeros_like(values)
    while True:
        result[fixed] = min_floor
        available = ~fixed
        remaining = total_mass - min_floor * int(fixed.sum())
        weights = values[available]
        if not np.any(available):
            return result
        if weights.sum() <= 0:
            result[available] = remaining / int(available.sum())
        else:
            result[available] = weights * (remaining / weights.sum())
        newly_fixed = available & (result < min_floor)
        if not np.any(newly_fixed):
            return result
        fixed |= newly_fixed


def _boost_specialist_probability(
    probabilities: np.ndarray,
    emotion_index: int,
) -> np.ndarray:
    values = np.asarray(probabilities, dtype=float)
    if values.shape != (len(EMOTIONS),):
        raise ValueError("probabilities must contain six emotion scores")
    if not 0 <= emotion_index < len(EMOTIONS):
        raise ValueError("emotion_index is outside the six supported classes")
    if not np.all(np.isfinite(values)) or np.any(values < 0):
        raise ValueError("probabilities must be finite and non-negative")
    if not np.isclose(values.sum(), 1.0, atol=1e-8):
        raise ValueError("probabilities must sum to one before specialist arbitration")
    if int(np.argmax(values)) == emotion_index:
        return values.copy()

    other_indices = np.asarray(
        [index for index in range(len(EMOTIONS)) if index != emotion_index],
        dtype=int,
    )
    highest_other = float(values[other_indices].max())
    target_probability = min(
        1.0 - (len(EMOTIONS) - 1) * PROBABILITY_FLOOR,
        max(float(values[emotion_index]), highest_other + 1e-6),
    )
    result = np.empty_like(values)
    result[emotion_index] = target_probability
    result[other_indices] = _redistribute_with_floor(
        values[other_indices],
        1.0 - target_probability,
        PROBABILITY_FLOOR,
    )
    if int(np.argmax(result)) != emotion_index:
        raise ArithmeticError("Specialist arbitration failed to promote its target class")
    return result


class HybridEmotionClassifier:
    """Stack word/character TF-IDF through six base and three specialist LRs."""

    emotions = EMOTIONS
    specialist_emotions = SPECIALIST_EMOTIONS

    def __init__(self) -> None:
        self.feature_union_: FeatureUnion | None = None
        self.text_feature_dimension_: int | None = None
        self.feature_count_: int | None = None
        self.base_model_: LogisticRegression | None = None
        self.specialists_: dict[str, LogisticRegression] = {}
        self.meta_classifier_: LogisticRegression | None = None
        self.meta_class_weights_: dict[str, float] | None = None
        self.specialist_thresholds_: dict[str, dict[str, float | int | str]] | None = None

    @staticmethod
    def _validate_texts(texts: list[str], name: str) -> None:
        if not isinstance(texts, list) or not texts:
            raise ValueError(f"{name} must be a non-empty list of strings")
        if any(not isinstance(text, str) or not text.strip() for text in texts):
            raise ValueError(f"{name} must contain only non-empty strings")

    @staticmethod
    def _validate_labels(y_labels: list[str], expected_rows: int) -> Counter[str]:
        if not isinstance(y_labels, list) or len(y_labels) != expected_rows:
            raise ValueError("y_labels must align with the training examples")
        if any(not isinstance(label, str) or label not in EMOTIONS for label in y_labels):
            raise ValueError(f"y_labels must use only {list(EMOTIONS)}")
        label_counts = Counter(y_labels)
        missing_labels = [label for label in EMOTIONS if label_counts[label] == 0]
        if missing_labels:
            raise ValueError(f"Training data is missing emotion labels: {missing_labels}")
        under_supported = {
            label: label_counts[label]
            for label in SPECIALIST_EMOTIONS
            if label_counts[label] < MIN_SPECIALIST_EXAMPLES
        }
        if under_supported:
            raise ValueError(
                "Each specialist needs at least five positive examples for cv=5: "
                f"{under_supported}"
            )
        return label_counts

    @staticmethod
    def _new_base_model() -> LogisticRegression:
        return LogisticRegression(
            solver="lbfgs",
            max_iter=1000,
            class_weight="balanced",
            C=1.0,
        )

    @staticmethod
    def _new_specialist_model() -> LogisticRegression:
        return LogisticRegression(
            solver="lbfgs",
            max_iter=1000,
            class_weight="balanced",
            C=1.0,
        )

    @staticmethod
    def _cross_fitted_probabilities(
        texts: list[str],
        labels: np.ndarray,
        *,
        report_progress: bool = False,
    ) -> tuple[np.ndarray, np.ndarray]:
        row_count = len(labels)
        stacked = np.empty((row_count, len(EMOTIONS) + len(SPECIALIST_EMOTIONS)))
        specialist_oof = np.empty((row_count, len(SPECIALIST_EMOTIONS)))
        splitter = StratifiedKFold(
            n_splits=OOF_FOLDS,
            shuffle=True,
            random_state=42,
        )
        for fold, (train_indices, validation_indices) in enumerate(
            splitter.split(np.zeros(row_count), labels),
            start=1,
        ):
            vectorizer = _build_feature_union()
            train_tfidf = vectorizer.fit_transform(
                [texts[index] for index in train_indices]
            )
            validation_tfidf = vectorizer.transform(
                [texts[index] for index in validation_indices]
            )
            train_features = _validate_feature_matrix(train_tfidf)
            validation_features = _validate_feature_matrix(validation_tfidf)

            base_model = HybridEmotionClassifier._new_base_model()
            base_model.fit(train_features, labels[train_indices])
            stacked[validation_indices, :len(EMOTIONS)] = _order_probability_columns(
                base_model.predict_proba(validation_features),
                base_model.classes_,
                EMOTIONS,
            )
            for specialist_index, emotion in enumerate(SPECIALIST_EMOTIONS):
                binary_labels = (labels[train_indices] == emotion).astype(int)
                specialist_model = HybridEmotionClassifier._new_specialist_model()
                specialist_model.fit(train_features, binary_labels)
                specialist_scores = specialist_model.predict_proba(
                    validation_features
                )[:, 1]
                specialist_oof[validation_indices, specialist_index] = specialist_scores
                stacked[
                    validation_indices,
                    len(EMOTIONS) + specialist_index,
                ] = specialist_scores
            if report_progress:
                print(f"OOF stacking fold {fold}/{OOF_FOLDS} complete", flush=True)
        if not np.all(np.isfinite(stacked)):
            raise RuntimeError("Cross-fitting did not produce all finite stack features")
        return stacked, specialist_oof

    @staticmethod
    def _tune_specialist_thresholds(
        labels: np.ndarray,
        oof_specialist_probabilities: np.ndarray,
    ) -> dict[str, dict[str, float | int | str]]:
        thresholds: dict[str, dict[str, float | int | str]] = {}
        for column, emotion in enumerate(SPECIALIST_EMOTIONS):
            try:
                thresholds[emotion] = _select_specialist_threshold(
                    labels == emotion,
                    oof_specialist_probabilities[:, column],
                    minimum_predictions=(
                        SPECIALIST_MIN_PREDICTIONS_BY_EMOTION[emotion]
                    ),
                )
            except RuntimeError as error:
                thresholds[emotion] = {
                    "status": "disabled_fallback",
                    "threshold": SPECIALIST_FALLBACK_THRESHOLD,
                    "f1": 0.0,
                    "true_positives": 0,
                    "false_positives": 0,
                    "predicted_positives": 0,
                    "recall": 0.0,
                    "false_positive_rate": 0.0,
                    "reason": str(error),
                }
        return thresholds

    def fit(
        self,
        X_texts: list[str],
        y_labels: list[str],
    ) -> Self:
        self._validate_texts(X_texts, "X_texts")
        self._validate_labels(y_labels, len(X_texts))
        labels = np.asarray(y_labels, dtype=object)
        oof_stack, oof_specialists = self._cross_fitted_probabilities(
            X_texts,
            labels,
        )
        return self.fit_precomputed_oof(
            X_texts,
            y_labels,
            oof_stack,
            oof_specialists,
        )

    def fit_precomputed_oof(
        self,
        X_texts: list[str],
        y_labels: list[str],
        oof_stack: np.ndarray,
        oof_specialist_probabilities: np.ndarray,
    ) -> Self:
        self._validate_texts(X_texts, "X_texts")
        self._validate_labels(y_labels, len(X_texts))
        stack_values = np.asarray(oof_stack, dtype=float)
        specialist_values = np.asarray(oof_specialist_probabilities, dtype=float)
        expected_stack_shape = (
            len(X_texts),
            len(EMOTIONS) + len(SPECIALIST_EMOTIONS),
        )
        if stack_values.shape != expected_stack_shape:
            raise ValueError(f"oof_stack must have shape {expected_stack_shape}")
        if specialist_values.shape != (len(X_texts), len(SPECIALIST_EMOTIONS)):
            raise ValueError("OOF specialist probabilities have an unexpected shape")
        if (
            not np.all(np.isfinite(stack_values))
            or not np.all(np.isfinite(specialist_values))
            or np.any(specialist_values < 0)
            or np.any(specialist_values > 1)
            or not np.allclose(
                stack_values[:, len(EMOTIONS):],
                specialist_values,
            )
        ):
            raise ValueError("OOF stack features must contain the supplied specialist scores")

        labels = np.asarray(y_labels, dtype=object)
        thresholds = self._tune_specialist_thresholds(
            labels,
            specialist_values,
        )
        meta_weights = _compute_power_smoothed_class_weights(y_labels)
        meta_classifier = LogisticRegression(
            solver="lbfgs",
            max_iter=1000,
            C=1.0,
            class_weight=meta_weights,
        )
        meta_classifier.fit(stack_values, labels)

        self.feature_union_ = _build_feature_union()
        tfidf_features = self.feature_union_.fit_transform(X_texts)
        features = _validate_feature_matrix(tfidf_features, expected_rows=len(X_texts))
        base_model = self._new_base_model()
        base_model.fit(features, labels)
        specialists: dict[str, LogisticRegression] = {}
        for emotion in SPECIALIST_EMOTIONS:
            specialist_model = self._new_specialist_model()
            specialist_model.fit(features, (labels == emotion).astype(int))
            specialists[emotion] = specialist_model

        self.text_feature_dimension_ = int(tfidf_features.shape[1])
        self.feature_count_ = int(features.shape[1])
        self.base_model_ = base_model
        self.specialists_ = specialists
        self.meta_classifier_ = meta_classifier
        self.meta_class_weights_ = meta_weights
        self.specialist_thresholds_ = thresholds
        return self

    def _require_fitted(self) -> tuple[LogisticRegression, LogisticRegression]:
        if (
            self.base_model_ is None
            or self.meta_classifier_ is None
            or self.meta_class_weights_ is None
            or self.specialist_thresholds_ is None
            or self.feature_count_ is None
            or set(self.specialists_) != set(SPECIALIST_EMOTIONS)
        ):
            raise RuntimeError("HybridEmotionClassifier must be fitted before prediction")
        return self.base_model_, self.meta_classifier_

    def transform_features(
        self,
        texts: list[str],
    ) -> sparse.csr_matrix:
        self._validate_texts(texts, "texts")
        if self.feature_union_ is None:
            raise RuntimeError("HybridEmotionClassifier has no fitted TF-IDF feature union")
        tfidf_features = self.feature_union_.transform(texts)
        values = _validate_feature_matrix(tfidf_features, expected_rows=len(texts))
        if self.feature_count_ is not None and values.shape[1] != self.feature_count_:
            raise ValueError(
                f"Expected {self.feature_count_} text features, received {values.shape[1]}"
            )
        return values

    def _predict_probabilities_from_features(
        self,
        features: sparse.spmatrix,
    ) -> np.ndarray:
        values = _validate_feature_matrix(features)
        base_model, meta_classifier = self._require_fitted()
        if values.shape[1] != self.feature_count_:
            raise ValueError(
                f"Expected {self.feature_count_} text features, received {values.shape[1]}"
            )
        base_probabilities = _order_probability_columns(
            base_model.predict_proba(values),
            base_model.classes_,
            EMOTIONS,
        )
        specialist_probabilities = np.column_stack(
            [
                self.specialists_[emotion].predict_proba(values)[:, 1]
                for emotion in SPECIALIST_EMOTIONS
            ]
        )
        meta_features = np.column_stack(
            (base_probabilities, specialist_probabilities)
        )
        raw_probabilities = np.asarray(
            meta_classifier.predict_proba(meta_features),
            dtype=float,
        )
        ordered_probabilities = _order_probability_columns(
            raw_probabilities,
            meta_classifier.classes_,
            EMOTIONS,
        )
        probabilities = _apply_zero_free_smoothing(ordered_probabilities)
        for row_index in range(len(probabilities)):
            eligible = [
                (specialist_index, emotion)
                for specialist_index, emotion in enumerate(SPECIALIST_EMOTIONS)
                if specialist_probabilities[row_index, specialist_index]
                >= float(self.specialist_thresholds_[emotion]["threshold"])
            ]
            if not eligible:
                continue
            _, best_emotion = max(
                eligible,
                key=lambda item: (
                    (
                        specialist_probabilities[row_index, item[0]]
                        - float(self.specialist_thresholds_[item[1]]["threshold"])
                    )
                    / (
                        1.0
                        - float(self.specialist_thresholds_[item[1]]["threshold"])
                    )
                ),
            )
            probabilities[row_index] = _boost_specialist_probability(
                probabilities[row_index],
                EMOTIONS.index(best_emotion),
            )
        return probabilities

    @staticmethod
    def _probability_percentages(probabilities: np.ndarray) -> dict[str, float]:
        percentages = probabilities * 100.0
        rounded = np.round(percentages, 2)
        dominant_index = int(np.argmax(probabilities))
        rounded[dominant_index] += 100.0 - float(rounded.sum())
        if np.any(rounded <= 0):
            raise ArithmeticError("Rounded emotion percentages must remain positive")
        return {
            emotion: float(rounded[index])
            for index, emotion in enumerate(EMOTIONS)
        }

    def predict_batch_features(
        self,
        features: sparse.spmatrix,
    ) -> dict[str, object]:
        probabilities = self._predict_probabilities_from_features(features)
        return self._format_batch_predictions(probabilities)

    def predict_batch(self, texts: list[str]) -> dict[str, object]:
        self._validate_texts(texts, "texts")
        return self.predict_batch_features(self.transform_features(texts))

    def predict_review(self, text: str) -> dict[str, object]:
        return self.predict_batch([text])["per_review"][0]

    def _format_batch_predictions(
        self,
        probabilities: np.ndarray,
    ) -> dict[str, object]:
        if probabilities.ndim != 2 or probabilities.shape[1] != len(EMOTIONS):
            raise ValueError("probabilities must contain one six-class row per review")
        if probabilities.shape[0] == 0:
            raise ValueError("probabilities must contain at least one review")
        predicted_indices = np.argmax(probabilities, axis=1)
        counts = np.bincount(predicted_indices, minlength=len(EMOTIONS))
        dominant_index = int(np.argmax(counts))
        smoothed_distribution = _apply_aggregate_floor(counts / len(probabilities))
        distribution_percentages = self._probability_percentages(smoothed_distribution)
        distribution = {
            emotion: {
                "percentage": distribution_percentages[emotion],
                "count": int(counts[index]),
            }
            for index, emotion in enumerate(EMOTIONS)
        }
        per_review = [
            {
                "dominant_emotion": EMOTIONS[int(predicted_indices[index])],
                "probabilities": self._probability_percentages(probabilities[index]),
            }
            for index in range(len(probabilities))
        ]
        return {
            "total_reviews": len(probabilities),
            "dominant_emotion": EMOTIONS[dominant_index],
            "distribution": distribution,
            "per_review": per_review,
        }

    def save(self, filepath: str) -> None:
        self._require_fitted()
        target = Path(filepath)
        target.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, target)

    @classmethod
    def load(cls, filepath: str) -> Self:
        loaded = joblib.load(Path(filepath))
        if not isinstance(loaded, cls):
            raise TypeError(f"Artifact at {filepath!r} is not a {cls.__name__}")
        loaded._require_fitted()
        if loaded.feature_union_ is None:
            raise RuntimeError("Artifact is missing its fitted TF-IDF feature union")
        if loaded.feature_union_.transformer_list[0][1].max_features != WORD_MAX_FEATURES:
            raise RuntimeError("Artifact uses an unexpected word TF-IDF feature limit")
        if loaded.feature_union_.transformer_list[1][1].max_features != CHAR_MAX_FEATURES:
            raise RuntimeError("Artifact uses an unexpected character TF-IDF feature limit")
        return loaded


__all__ = [
    "EMOTIONS",
    "WORD_MAX_FEATURES",
    "CHAR_MAX_FEATURES",
    "META_CLASS_WEIGHT_EXPONENT",
    "PROBABILITY_FLOOR",
    "SPECIALIST_EMOTIONS",
    "SPECIALIST_THRESHOLD_MIN",
    "SPECIALIST_THRESHOLD_MAX",
    "SPECIALIST_THRESHOLD_STEP",
    "SPECIALIST_MAX_FPR",
    "SPECIALIST_MIN_PREDICTIONS_BY_EMOTION",
    "SPECIALIST_FALLBACK_THRESHOLD",
    "OOF_FOLDS",
    "HybridEmotionClassifier",
    "_apply_aggregate_floor",
    "_apply_zero_free_smoothing",
    "_build_feature_union",
    "_compute_power_smoothed_class_weights",
    "_select_specialist_threshold",
]
