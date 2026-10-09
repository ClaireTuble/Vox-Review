"""
VoxReview NLP — Phase 4: Common Model Evaluation and Comparison Infrastructure

This module provides a unified, standardized evaluation and comparison framework
for all candidate emotion classification models:
  1. Linear SVM
  2. LSTM
  3. XLM-RoBERTa

Guarantees:
- Same 6-class emotion task & taxonomy (1=Happy, 2=Sad, 3=Anger, 4=Disgust, 5=Fear, 6=Sarcastic)
- Same dataset and exact same held-out test split across all candidates
- Same metrics (Accuracy, Macro-F1, Weighted-F1, Macro-Precision, Macro-Recall, Per-Class F1, Confusion Matrix)
- Standardized schema, clean tabular summaries, and reproducible execution
- Completely agnostic to whether input is the development fixture or official research data
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

from config import (
    EMOTION_CODE_TO_LABEL,
    ORDERED_EMOTION_CODES,
    ORDERED_EMOTION_LABELS,
    VALID_EMOTION_CODES,
    is_valid_emotion_code,
)
from dataset import Dataset, DatasetLoader, Review

# Model prediction imports
from svm_pipeline import predict_svm
from lstm_pipeline import LSTMEmotionClassifier, predict_lstm
from xlmr_pipeline import XLMRobertaEmotionClassifier, predict_xlmr


# ==============================================================================
# DATASET SPLITTING INFRASTRUCTURE
# ==============================================================================

def split_dataset(
    dataset: Union[Dataset, str, Path],
    test_size: float = 0.2,
    val_size: float = 0.0,
    stratify: bool = True,
    random_state: int = 42,
) -> Union[Tuple[Dataset, Dataset], Tuple[Dataset, Dataset, Dataset]]:
    """
    Split a dataset into deterministic, reproducible train and test (and optional validation) subsets.

    Guarantees:
    - Stratified splitting by emotion_code where possible
    - Same held-out test samples are used for evaluating all candidate models
    - Preserves Review objects and metadata

    Args:
        dataset: Dataset instance or path to CSV file
        test_size: Proportion of the dataset to allocate to the test split (default: 0.2)
        val_size: Optional proportion for validation split (default: 0.0)
        stratify: Whether to perform stratified sampling based on emotion labels
        random_state: Deterministic random seed for reproducibility

    Returns:
        (train_dataset, test_dataset) if val_size == 0.0
        (train_dataset, val_dataset, test_dataset) if val_size > 0.0
    """
    if isinstance(dataset, (str, Path)):
        loader = DatasetLoader(validate=True, apply_preprocessing=True)
        dataset_obj, _ = loader.load(str(dataset))
    elif isinstance(dataset, Dataset):
        dataset_obj = dataset
    else:
        raise TypeError(f"Unsupported dataset type for splitting: {type(dataset)}")

    reviews = [r for r in dataset_obj.reviews if is_valid_emotion_code(r.emotion_code)]
    if not reviews:
        raise ValueError("Cannot split dataset: 0 valid review samples found.")

    labels = [r.emotion_code for r in reviews]
    stratify_labels = labels if stratify else None

    # Check if any class has fewer than 2 items for stratification
    if stratify:
        counts = np.bincount(labels)
        min_class_count = min(counts[c] for c in VALID_EMOTION_CODES if c < len(counts))
        if min_class_count < 2:
            stratify_labels = None  # Fallback to non-stratified if counts too small

    if val_size <= 0.0:
        train_revs, test_revs = train_test_split(
            reviews,
            test_size=test_size,
            random_state=random_state,
            stratify=stratify_labels,
        )
        train_ds = Dataset(
            reviews=train_revs,
            metadata={
                "split": "train",
                "random_state": random_state,
                "total": len(train_revs),
                "source": dataset_obj.metadata.get("source_file", "unknown"),
            },
        )
        test_ds = Dataset(
            reviews=test_revs,
            metadata={
                "split": "test",
                "random_state": random_state,
                "total": len(test_revs),
                "source": dataset_obj.metadata.get("source_file", "unknown"),
            },
        )
        return train_ds, test_ds
    else:
        # Train / Val / Test split
        combined_val_test = test_size + val_size
        train_revs, temp_revs = train_test_split(
            reviews,
            test_size=combined_val_test,
            random_state=random_state,
            stratify=stratify_labels,
        )
        temp_labels = [r.emotion_code for r in temp_revs] if stratify else None
        relative_test_ratio = test_size / combined_val_test

        val_revs, test_revs = train_test_split(
            temp_revs,
            test_size=relative_test_ratio,
            random_state=random_state,
            stratify=temp_labels,
        )

        train_ds = Dataset(reviews=train_revs, metadata={"split": "train", "total": len(train_revs)})
        val_ds = Dataset(reviews=val_revs, metadata={"split": "validation", "total": len(val_revs)})
        test_ds = Dataset(reviews=test_revs, metadata={"split": "test", "total": len(test_revs)})
        return train_ds, val_ds, test_ds


# ==============================================================================
# METRICS COMPUTATION ENGINE
# ==============================================================================

def compute_metrics(
    y_true: List[int],
    y_pred: List[int],
    class_codes: List[int] = ORDERED_EMOTION_CODES,
    class_labels: List[str] = ORDERED_EMOTION_LABELS,
) -> Dict[str, Any]:
    """
    Compute standard classification evaluation metrics for 6-class emotion detection.

    Required Metrics:
    - Accuracy
    - Precision (Macro & Weighted)
    - Recall (Macro & Weighted)
    - Macro-F1 & Weighted-F1
    - Per-class Precision, Recall, F1, and Support
    - Confusion Matrix (6x6)

    Args:
        y_true: Ground-truth integer emotion codes (1..6)
        y_pred: Predicted integer emotion codes (1..6)
        class_codes: List of ordered class codes [1, 2, 3, 4, 5, 6]
        class_labels: List of ordered class names ["Happy", "Sad", "Anger", "Disgust", "Fear", "Sarcastic"]

    Returns:
        Dictionary of calculated metric values
    """
    if len(y_true) != len(y_pred):
        raise ValueError(f"Length mismatch: {len(y_true)} true vs {len(y_pred)} pred")

    acc = float(accuracy_score(y_true, y_pred))
    macro_p = float(precision_score(y_true, y_pred, labels=class_codes, average="macro", zero_division=0))
    macro_r = float(recall_score(y_true, y_pred, labels=class_codes, average="macro", zero_division=0))
    macro_f1 = float(f1_score(y_true, y_pred, labels=class_codes, average="macro", zero_division=0))
    weighted_f1 = float(f1_score(y_true, y_pred, labels=class_codes, average="weighted", zero_division=0))

    # Per-class metrics
    per_class_p = precision_score(y_true, y_pred, labels=class_codes, average=None, zero_division=0)
    per_class_r = recall_score(y_true, y_pred, labels=class_codes, average=None, zero_division=0)
    per_class_f1 = f1_score(y_true, y_pred, labels=class_codes, average=None, zero_division=0)

    # Support counts per class
    y_true_counts = np.bincount(y_true, minlength=max(class_codes) + 1)

    per_class_dict: Dict[str, Dict[str, Any]] = {}
    for idx, (code, label) in enumerate(zip(class_codes, class_labels)):
        support_count = int(y_true_counts[code]) if code < len(y_true_counts) else 0
        per_class_dict[label] = {
            "emotion_code": code,
            "precision": float(per_class_p[idx]),
            "recall": float(per_class_r[idx]),
            "f1_score": float(per_class_f1[idx]),
            "support": support_count,
        }

    # 6x6 Confusion matrix (rows = true, columns = pred)
    cm = confusion_matrix(y_true, y_pred, labels=class_codes).tolist()

    return {
        "accuracy": acc,
        "macro_f1": macro_f1,
        "macro_precision": macro_p,
        "macro_recall": macro_r,
        "weighted_f1": weighted_f1,
        "per_class": per_class_dict,
        "confusion_matrix": cm,
        "class_labels": list(class_labels),
        "class_codes": list(class_codes),
        "total_samples": len(y_true),
    }


# ==============================================================================
# EVALUATION RESULT OBJECTS
# ==============================================================================

@dataclass
class EvaluationResult:
    """Standardized result container for a single evaluated model."""

    model_name: str
    model_type: str
    accuracy: float
    macro_f1: float
    macro_precision: float
    macro_recall: float
    weighted_f1: float
    per_class: Dict[str, Dict[str, Any]]
    confusion_matrix: List[List[int]]
    class_names: List[str]
    total_samples: int
    predictions: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert evaluation result to JSON-serializable dictionary."""
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        """Convert evaluation result to formatted JSON string."""
        return json.dumps(self.to_dict(), indent=indent)

    def get_summary_text(self) -> str:
        """Format a human-readable summary of model performance."""
        lines = [
            f"Model: {self.model_name} ({self.model_type})",
            f"Total Test Samples: {self.total_samples}",
            f"Accuracy:        {self.accuracy * 100:6.2f}%",
            f"Macro-F1:        {self.macro_f1 * 100:6.2f}%",
            f"Macro-Precision: {self.macro_precision * 100:6.2f}%",
            f"Macro-Recall:    {self.macro_recall * 100:6.2f}%",
            f"Weighted-F1:     {self.weighted_f1 * 100:6.2f}%",
        ]
        return "\n".join(lines)

    def get_per_class_table_text(self) -> str:
        """Format per-class precision, recall, and F1 into a clean text table."""
        header = f"{'Class':<12} {'Code':<6} {'Precision':<11} {'Recall':<11} {'F1-Score':<11} {'Support':<8}"
        separator = "-" * len(header)
        rows = [header, separator]

        for label in self.class_names:
            metrics = self.per_class.get(label, {})
            code = metrics.get("emotion_code", "-")
            p = metrics.get("precision", 0.0) * 100
            r = metrics.get("recall", 0.0) * 100
            f1 = metrics.get("f1_score", 0.0) * 100
            sup = metrics.get("support", 0)
            rows.append(
                f"{label:<12} {code:<6} {p:>8.2f}%   {r:>8.2f}%   {f1:>8.2f}%   {sup:>6}"
            )

        return "\n".join(rows)

    def get_confusion_matrix_text(self) -> str:
        """Format confusion matrix with class header rows and columns."""
        short_labels = [label[:3].upper() for label in self.class_names]
        header = f"{'True \\ Pred':<12} " + " ".join(f"{lbl:>5}" for lbl in short_labels)
        separator = "-" * len(header)
        rows = [header, separator]

        for idx, label in enumerate(self.class_names):
            cm_row = self.confusion_matrix[idx]
            row_str = f"{label:<12} " + " ".join(f"{val:>5}" for val in cm_row)
            rows.append(row_str)

        return "\n".join(rows)


@dataclass
class ModelComparison:
    """Standardized multi-model comparison container."""

    results: List[EvaluationResult]
    comparison_table: List[Dict[str, Any]]
    per_class_comparison: Dict[str, Dict[str, Dict[str, float]]]
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert comparison to dictionary."""
        return {
            "comparison_table": self.comparison_table,
            "per_class_comparison": self.per_class_comparison,
            "results": [r.to_dict() for r in self.results],
            "metadata": self.metadata,
        }

    def to_json(self, indent: int = 2) -> str:
        """Convert comparison to formatted JSON string."""
        return json.dumps(self.to_dict(), indent=indent)

    def get_comparison_table_text(self) -> str:
        """Generate a formatted comparison table for all candidate models."""
        header = f"{'Model':<16} {'Accuracy':<12} {'Macro-F1':<12} {'Weighted-F1':<13} {'Macro-Prec':<12} {'Macro-Rec':<12}"
        separator = "=" * len(header)
        rows = [separator, header, separator]

        for row in self.comparison_table:
            model = row.get("model", "Unknown")
            acc = row.get("accuracy", 0.0) * 100
            f1 = row.get("macro_f1", 0.0) * 100
            wf1 = row.get("weighted_f1", 0.0) * 100
            p = row.get("macro_precision", 0.0) * 100
            r = row.get("macro_recall", 0.0) * 100
            rows.append(
                f"{model:<16} {acc:>9.2f}%   {f1:>9.2f}%   {wf1:>10.2f}%   {p:>9.2f}%   {r:>9.2f}%"
            )

        rows.append(separator)
        return "\n".join(rows)

    def get_per_class_comparison_text(self) -> str:
        """Generate a comparative per-class F1 breakdown across models."""
        models = [r.model_name for r in self.results]
        col_width = max(max((len(m) for m in models), default=10), 10) + 2

        header = f"{'Emotion':<12}" + "".join(f"{m:>{col_width}}" for m in models)
        separator = "-" * len(header)
        rows = [separator, header, separator]

        for label in ORDERED_EMOTION_LABELS:
            row_items = [f"{label:<12}"]
            for r in self.results:
                f1_val = r.per_class.get(label, {}).get("f1_score", 0.0) * 100
                row_items.append(f"{f1_val:>{col_width - 1}.2f}%")
            rows.append("".join(row_items))

        rows.append(separator)
        return "\n".join(rows)


# ==============================================================================
# COMMON MODEL EVALUATION INTERFACE
# ==============================================================================

def evaluate_model(
    model: Any,
    test_dataset: Union[Dataset, str, Path, List[Review]],
    *,
    model_type: Optional[str] = None,
    model_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    tokenizer: Optional[Any] = None,
) -> EvaluationResult:
    """
    Evaluate a candidate model on a test dataset.

    Automatically handles model-specific input representation:
    - SVM: Uses heavy preprocessed text / predict_svm
    - LSTM: Uses LSTM sequence representation / predict_lstm
    - XLM-RoBERTa: Uses light preprocessed text / predict_xlmr

    Guarantees:
    - Evaluated on exact same ground truth
    - Metrics calculated identically
    - Schema is uniform and comparable

    Args:
        model: Fitted model object (Pipeline, LSTMEmotionClassifier, XLMRobertaEmotionClassifier, or nn.Module)
        test_dataset: Dataset object, path to CSV, or list of Review items
        model_type: 'svm', 'lstm', or 'xlmr' (inferred automatically if None)
        model_name: Custom display name for model
        metadata: Optional metadata dictionary to attach
        tokenizer: Optional tokenizer (for raw models)

    Returns:
        EvaluationResult object containing all calculated metrics
    """
    # 1. Ingest test dataset
    if isinstance(test_dataset, (str, Path)):
        loader = DatasetLoader(validate=True, apply_preprocessing=True)
        test_ds, _ = loader.load(str(test_dataset))
        reviews = test_ds.reviews
    elif isinstance(test_dataset, Dataset):
        reviews = test_dataset.reviews
    elif isinstance(test_dataset, list):
        reviews = test_dataset
    else:
        raise TypeError(f"Unsupported test_dataset type: {type(test_dataset)}")

    valid_reviews = [r for r in reviews if is_valid_emotion_code(r.emotion_code)]
    if not valid_reviews:
        raise ValueError("Cannot evaluate model: 0 valid test reviews found.")

    # 2. Identify model type and generate predictions
    detected_type = model_type.lower() if model_type else _infer_model_type(model)
    display_name = model_name or _get_default_model_name(detected_type)

    raw_reviews = [r.raw_review for r in valid_reviews]
    true_codes = [r.emotion_code for r in valid_reviews]
    review_ids = [r.review_id for r in valid_reviews]

    # Model-specific prediction routing
    if detected_type == "svm":
        preds = predict_svm(model, raw_reviews)
    elif detected_type == "lstm":
        if tokenizer is not None:
            preds = predict_lstm(model, tokenizer, raw_reviews)
        else:
            preds = predict_lstm(model, raw_reviews)
    elif detected_type == "xlmr":
        if tokenizer is not None:
            preds = predict_xlmr(model, tokenizer, raw_reviews)
        else:
            preds = predict_xlmr(model, raw_reviews)
    else:
        raise ValueError(f"Unknown or unsupported model_type: '{detected_type}'")

    if not isinstance(preds, list):
        preds = [preds]

    pred_codes = [p["emotion_code"] for p in preds]

    # 3. Compute common metrics
    metric_results = compute_metrics(
        y_true=true_codes,
        y_pred=pred_codes,
        class_codes=ORDERED_EMOTION_CODES,
        class_labels=ORDERED_EMOTION_LABELS,
    )

    # 4. Assemble prediction records
    prediction_records = []
    for r_id, true_c, pred_c in zip(review_ids, true_codes, pred_codes):
        prediction_records.append({
            "review_id": r_id,
            "true_code": true_c,
            "true_emotion": EMOTION_CODE_TO_LABEL.get(true_c, "Unknown"),
            "pred_code": pred_c,
            "pred_emotion": EMOTION_CODE_TO_LABEL.get(pred_c, "Unknown"),
            "correct": (true_c == pred_c),
        })

    # 5. Metadata compilation
    res_metadata = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "total_test_reviews": len(valid_reviews),
        "model_type": detected_type,
    }
    if metadata:
        res_metadata.update(metadata)

    return EvaluationResult(
        model_name=display_name,
        model_type=detected_type,
        accuracy=metric_results["accuracy"],
        macro_f1=metric_results["macro_f1"],
        macro_precision=metric_results["macro_precision"],
        macro_recall=metric_results["macro_recall"],
        weighted_f1=metric_results["weighted_f1"],
        per_class=metric_results["per_class"],
        confusion_matrix=metric_results["confusion_matrix"],
        class_names=ORDERED_EMOTION_LABELS,
        total_samples=len(valid_reviews),
        predictions=prediction_records,
        metadata=res_metadata,
    )


# ==============================================================================
# MODEL COMPARISON INTERFACE
# ==============================================================================

def compare_models(
    results: List[EvaluationResult],
    metadata: Optional[Dict[str, Any]] = None,
) -> ModelComparison:
    """
    Generate unified comparison tables and reports across multiple candidate models.

    Args:
        results: List of EvaluationResult instances from evaluate_model()
        metadata: Optional metadata dictionary to attach

    Returns:
        ModelComparison container
    """
    if not results:
        raise ValueError("Cannot compare models: results list is empty.")

    comparison_table = []
    per_class_comparison: Dict[str, Dict[str, Dict[str, float]]] = {}

    for r in results:
        comparison_table.append({
            "model": r.model_name,
            "model_type": r.model_type,
            "accuracy": r.accuracy,
            "macro_f1": r.macro_f1,
            "macro_precision": r.macro_precision,
            "macro_recall": r.macro_recall,
            "weighted_f1": r.weighted_f1,
            "total_samples": r.total_samples,
        })

    for label in ORDERED_EMOTION_LABELS:
        per_class_comparison[label] = {}
        for r in results:
            per_class_comparison[label][r.model_name] = r.per_class.get(label, {})

    comp_metadata = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "num_models_compared": len(results),
        "models": [r.model_name for r in results],
    }
    if metadata:
        comp_metadata.update(metadata)

    return ModelComparison(
        results=results,
        comparison_table=comparison_table,
        per_class_comparison=per_class_comparison,
        metadata=comp_metadata,
    )


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def _infer_model_type(model: Any) -> str:
    """Infer candidate model type from class instance."""
    if isinstance(model, LSTMEmotionClassifier):
        return "lstm"
    if isinstance(model, XLMRobertaEmotionClassifier):
        return "xlmr"

    type_str = str(type(model)).lower()
    if "pipeline" in type_str or "svm" in type_str or "linearsvc" in type_str:
        return "svm"
    if "lstm" in type_str:
        return "lstm"
    if "roberta" in type_str or "xlm" in type_str or "transformer" in type_str:
        return "xlmr"

    return "svm"


def _get_default_model_name(model_type: str) -> str:
    """Return friendly display name for model type."""
    names = {
        "svm": "Linear SVM",
        "lstm": "LSTM",
        "xlmr": "XLM-RoBERTa",
    }
    return names.get(model_type.lower(), model_type.upper())
