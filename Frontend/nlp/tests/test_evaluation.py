"""
Comprehensive Unit and Integration Tests for Common Model Evaluation and Comparison Framework.

Covers:
1. Metric correctness (Accuracy, Macro-F1, Weighted-F1, Precision, Recall bounds 0.0-1.0)
2. Class ordering consistency (Happy=1, Sad=2, Anger=3, Disgust=4, Fear=5, Sarcastic=6)
3. Confusion matrix shape (6x6) and axis alignment
4. Split reproducibility and stratification (exact same test set generated with seed)
5. Same test data guarantee across all 3 candidate models
6. Model evaluation schema uniformity for SVM, LSTM, and XLM-R
7. Development fixture evaluation workflow (clearly labeled development-only)
8. Multi-model comparison table and per-class metric aggregation
"""

import sys
import tempfile
from pathlib import Path
from typing import List, Dict, Any

import numpy as np
import pytest
from transformers import XLMRobertaConfig

# Add NLP module to path
NLP_DIR = Path(__file__).parent.parent
if str(NLP_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_DIR))
if str(NLP_DIR / "preprocessing") not in sys.path:
    sys.path.insert(0, str(NLP_DIR / "preprocessing"))

from config import (
    DEFAULT_FIXTURE_PATH,
    EMOTION_CODE_TO_LABEL,
    EMOTION_LABEL_TO_CODE,
    ORDERED_EMOTION_CODES,
    ORDERED_EMOTION_LABELS,
    VALID_EMOTION_CODES,
)
from dataset import load_dataset
from evaluation import (
    EvaluationResult,
    ModelComparison,
    compare_models,
    compute_metrics,
    evaluate_model,
    split_dataset,
)
from svm_pipeline import train_svm
from lstm_pipeline import train_lstm
from xlmr_pipeline import INTERNAL_ID_TO_LABEL, INTERNAL_LABEL_TO_ID, train_xlmr


@pytest.fixture(scope="module")
def fixture_path():
    """Returns the path to development fixture."""
    path = NLP_DIR / DEFAULT_FIXTURE_PATH
    if not path.exists():
        from fixture import create_fixture
        create_fixture(str(path))
    return str(path)


@pytest.fixture(scope="module")
def full_dataset(fixture_path):
    """Loads and preprocesses the development fixture dataset."""
    return load_dataset(fixture_path, validate=True)


@pytest.fixture(scope="module")
def train_test_split_datasets(full_dataset):
    """Generates deterministic train and test splits (24 train, 6 test / 1 per class)."""
    train_ds, test_ds = split_dataset(
        full_dataset,
        test_size=0.2,
        stratify=True,
        random_state=42,
    )
    return train_ds, test_ds


# ==============================================================================
# 1. METRICS COMPUTATION & CLASS ORDERING TESTS
# ==============================================================================

def test_compute_metrics_perfect_prediction():
    """Verify metrics calculation for perfect predictions (accuracy = 1.0, f1 = 1.0)."""
    y_true = [1, 2, 3, 4, 5, 6]
    y_pred = [1, 2, 3, 4, 5, 6]

    metrics = compute_metrics(y_true, y_pred)

    assert metrics["accuracy"] == 1.0
    assert metrics["macro_f1"] == 1.0
    assert metrics["macro_precision"] == 1.0
    assert metrics["macro_recall"] == 1.0
    assert metrics["weighted_f1"] == 1.0
    assert len(metrics["per_class"]) == 6

    # Verify confusion matrix is 6x6 identity matrix for 1 sample per class
    cm = metrics["confusion_matrix"]
    assert len(cm) == 6
    assert all(len(row) == 6 for row in cm)
    for i in range(6):
        assert cm[i][i] == 1


def test_compute_metrics_class_ordering():
    """Verify strict class ordering in per-class metrics and confusion matrix."""
    y_true = [1, 1, 2, 3, 4, 5, 6]
    y_pred = [1, 2, 2, 3, 4, 5, 6]

    metrics = compute_metrics(y_true, y_pred)

    per_class_labels = list(metrics["per_class"].keys())
    assert per_class_labels == ORDERED_EMOTION_LABELS
    assert ORDERED_EMOTION_LABELS == ["Happy", "Sad", "Anger", "Disgust", "Fear", "Sarcastic"]

    for code, label in zip(ORDERED_EMOTION_CODES, ORDERED_EMOTION_LABELS):
        assert metrics["per_class"][label]["emotion_code"] == code


def test_metrics_bound_ranges():
    """Verify all metrics fall within valid [0.0, 1.0] mathematical range."""
    y_true = [1, 2, 3, 4, 5, 6, 1, 2, 3, 4]
    y_pred = [2, 1, 3, 4, 6, 5, 1, 3, 2, 4]

    metrics = compute_metrics(y_true, y_pred)

    assert 0.0 <= metrics["accuracy"] <= 1.0
    assert 0.0 <= metrics["macro_f1"] <= 1.0
    assert 0.0 <= metrics["macro_precision"] <= 1.0
    assert 0.0 <= metrics["macro_recall"] <= 1.0
    assert 0.0 <= metrics["weighted_f1"] <= 1.0

    for label in ORDERED_EMOTION_LABELS:
        cls_data = metrics["per_class"][label]
        assert 0.0 <= cls_data["precision"] <= 1.0
        assert 0.0 <= cls_data["recall"] <= 1.0
        assert 0.0 <= cls_data["f1_score"] <= 1.0
        assert cls_data["support"] >= 0


# ==============================================================================
# 2. DATASET SPLITTING & DETERMINISM TESTS
# ==============================================================================

def test_split_dataset_determinism(full_dataset):
    """Verify identical splits are generated when using the same random seed."""
    train_a, test_a = split_dataset(full_dataset, test_size=0.2, random_state=42)
    train_b, test_b = split_dataset(full_dataset, test_size=0.2, random_state=42)

    ids_train_a = [r.review_id for r in train_a.reviews]
    ids_train_b = [r.review_id for r in train_b.reviews]
    ids_test_a = [r.review_id for r in test_a.reviews]
    ids_test_b = [r.review_id for r in test_b.reviews]

    assert ids_train_a == ids_train_b
    assert ids_test_a == ids_test_b
    assert len(train_a) == 24
    assert len(test_a) == 6


def test_split_dataset_stratification(full_dataset):
    """Verify test split contains samples from every class when stratified."""
    train_ds, test_ds = split_dataset(full_dataset, test_size=0.2, stratify=True, random_state=42)
    test_codes = {r.emotion_code for r in test_ds.reviews}
    assert test_codes == VALID_EMOTION_CODES  # exactly all 6 classes present


def test_no_train_test_overlap(full_dataset):
    """Verify no review ID leakage between train and test splits."""
    train_ds, test_ds = split_dataset(full_dataset, test_size=0.2, random_state=42)
    train_ids = {r.review_id for r in train_ds.reviews}
    test_ids = {r.review_id for r in test_ds.reviews}

    assert train_ids.isdisjoint(test_ids)
    assert len(train_ids) + len(test_ids) == len(full_dataset)


# ==============================================================================
# 3. COMMON EVALUATION ACROSS CANDIDATE MODELS
# ==============================================================================

def test_svm_evaluation(train_test_split_datasets):
    """Verify SVM evaluation produces standard EvaluationResult."""
    train_ds, test_ds = train_test_split_datasets
    model = train_svm(train_ds, random_state=42)

    result = evaluate_model(
        model,
        test_ds,
        model_type="svm",
        metadata={"is_fixture": True, "note": "DEVELOPMENT FIXTURE ONLY"},
    )

    assert isinstance(result, EvaluationResult)
    assert result.model_type == "svm"
    assert result.total_samples == len(test_ds)
    assert len(result.predictions) == len(test_ds)
    assert len(result.class_names) == 6
    assert 0.0 <= result.accuracy <= 1.0
    assert 0.0 <= result.macro_f1 <= 1.0


def test_lstm_evaluation(train_test_split_datasets):
    """Verify LSTM evaluation produces standard EvaluationResult."""
    train_ds, test_ds = train_test_split_datasets
    classifier = train_lstm(
        train_ds,
        epochs=3,
        batch_size=8,
        hidden_units=16,
        embedding_dim=16,
        random_state=42,
    )

    result = evaluate_model(
        classifier,
        test_ds,
        model_type="lstm",
        metadata={"is_fixture": True, "note": "DEVELOPMENT FIXTURE ONLY"},
    )

    assert isinstance(result, EvaluationResult)
    assert result.model_type == "lstm"
    assert result.total_samples == len(test_ds)
    assert len(result.predictions) == len(test_ds)


def test_xlmr_evaluation(train_test_split_datasets):
    """Verify XLM-R evaluation produces standard EvaluationResult."""
    train_ds, test_ds = train_test_split_datasets
    config = XLMRobertaConfig(
        vocab_size=1000,
        hidden_size=32,
        num_attention_heads=2,
        num_hidden_layers=1,
        intermediate_size=64,
        max_position_embeddings=64,
        num_labels=6,
        id2label=INTERNAL_ID_TO_LABEL,
        label2id=INTERNAL_LABEL_TO_ID,
    )

    classifier = train_xlmr(
        train_ds,
        max_sequence_length=16,
        batch_size=8,
        epochs=1,
        learning_rate=1e-3,
        random_state=42,
        device="cpu",
        pretrained_model_or_config=config,
    )

    result = evaluate_model(
        classifier,
        test_ds,
        model_type="xlmr",
        metadata={"is_fixture": True, "note": "DEVELOPMENT FIXTURE ONLY"},
    )

    assert isinstance(result, EvaluationResult)
    assert result.model_type == "xlmr"
    assert result.total_samples == len(test_ds)
    assert len(result.predictions) == len(test_ds)


# ==============================================================================
# 4. SAME HELD-OUT TEST DATA GUARANTEE
# ==============================================================================

def test_same_test_records_across_all_models(train_test_split_datasets):
    """Verify all 3 candidate models evaluate on the EXACT SAME test samples."""
    train_ds, test_ds = train_test_split_datasets

    # Train 3 models on same train split
    svm_model = train_svm(train_ds, random_state=42)
    lstm_model = train_lstm(train_ds, epochs=2, batch_size=8, random_state=42)
    xlmr_config = XLMRobertaConfig(
        vocab_size=1000,
        hidden_size=32,
        num_attention_heads=2,
        num_hidden_layers=1,
        num_labels=6,
        id2label=INTERNAL_ID_TO_LABEL,
        label2id=INTERNAL_LABEL_TO_ID,
    )
    xlmr_model = train_xlmr(
        train_ds,
        max_sequence_length=16,
        batch_size=8,
        epochs=1,
        pretrained_model_or_config=xlmr_config,
        device="cpu",
    )

    # Evaluate all 3 on same test split
    svm_res = evaluate_model(svm_model, test_ds, model_type="svm")
    lstm_res = evaluate_model(lstm_model, test_ds, model_type="lstm")
    xlmr_res = evaluate_model(xlmr_model, test_ds, model_type="xlmr")

    svm_ids = [p["review_id"] for p in svm_res.predictions]
    lstm_ids = [p["review_id"] for p in lstm_res.predictions]
    xlmr_ids = [p["review_id"] for p in xlmr_res.predictions]
    expected_ids = [r.review_id for r in test_ds.reviews]

    assert svm_ids == expected_ids
    assert lstm_ids == expected_ids
    assert xlmr_ids == expected_ids

    # True labels must match perfectly across all 3
    svm_true = [p["true_code"] for p in svm_res.predictions]
    lstm_true = [p["true_code"] for p in lstm_res.predictions]
    xlmr_true = [p["true_code"] for p in xlmr_res.predictions]
    assert svm_true == lstm_true == xlmr_true


# ==============================================================================
# 5. MODEL COMPARISON TABLE & SUMMARY
# ==============================================================================

def test_compare_models_aggregation(train_test_split_datasets):
    """Verify compare_models generates structured table and per-class comparison."""
    train_ds, test_ds = train_test_split_datasets
    svm_model = train_svm(train_ds, random_state=42)
    lstm_model = train_lstm(train_ds, epochs=2, batch_size=8, random_state=42)

    svm_res = evaluate_model(svm_model, test_ds, model_type="svm")
    lstm_res = evaluate_model(lstm_model, test_ds, model_type="lstm")

    comparison = compare_models(
        [svm_res, lstm_res],
        metadata={"note": "DEVELOPMENT FIXTURE ONLY - NOT OFFICIAL RESEARCH RESULTS"},
    )

    assert isinstance(comparison, ModelComparison)
    assert len(comparison.comparison_table) == 2
    assert comparison.comparison_table[0]["model"] == "Linear SVM"
    assert comparison.comparison_table[1]["model"] == "LSTM"

    # Verify table generation strings
    comp_text = comparison.get_comparison_table_text()
    assert "Linear SVM" in comp_text
    assert "LSTM" in comp_text
    assert "Macro-F1" in comp_text

    per_class_text = comparison.get_per_class_comparison_text()
    assert "Happy" in per_class_text
    assert "Sarcastic" in per_class_text


def test_evaluation_result_serialization(train_test_split_datasets):
    """Verify EvaluationResult can be serialized to JSON and dictionary cleanly."""
    train_ds, test_ds = train_test_split_datasets
    model = train_svm(train_ds, random_state=42)
    result = evaluate_model(model, test_ds, model_type="svm")

    res_dict = result.to_dict()
    assert isinstance(res_dict, dict)
    assert "accuracy" in res_dict
    assert "macro_f1" in res_dict
    assert "confusion_matrix" in res_dict

    res_json = result.to_json()
    assert isinstance(res_json, str)
    assert "Linear SVM" in res_json


# ==============================================================================
# RUNNER
# ==============================================================================

def run_all_tests():
    """Run test suite directly and return exit code."""
    import pytest
    return pytest.main(["-v", str(Path(__file__))])


if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
