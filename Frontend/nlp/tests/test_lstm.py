"""
Comprehensive Unit and Smoke Tests for LSTM Emotion Classification Pipeline.

Covers:
A. Model construction with 6 output classes
B. Tokenization (sequence count = review count)
C. Sequence shape (all padded sequences match max_sequence_length)
D. Label mapping consistency with Phase 2 central taxonomy (1..6)
E. Training smoke test on development fixture
F. Prediction on single review (correct format {"emotion": ..., "emotion_code": ...})
G. Batch prediction (N inputs -> N outputs)
H. Model and tokenizer serialization (save and reload)
I. Invalid and edge case input handling (empty, whitespace, None, special characters)
J. Probability/confidence computation (defensible softmax, no fake confidence)
K. Class-weight support (configurable for imbalance)
"""

import sys
import tempfile
from pathlib import Path
from typing import List, Dict, Any

import numpy as np
import pytest
import torch

# Add NLP module to path
NLP_DIR = Path(__file__).parent.parent
if str(NLP_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_DIR))
if str(NLP_DIR / "preprocessing") not in sys.path:
    sys.path.insert(0, str(NLP_DIR / "preprocessing"))

from config import (
    EMOTION_CODE_TO_LABEL,
    EMOTION_LABEL_TO_CODE,
    VALID_EMOTION_CODES,
    DEFAULT_FIXTURE_PATH,
)
from dataset import load_dataset
from lstm_pipeline import (
    EmotionLSTM,
    LSTMEmotionClassifier,
    LSTMTokenizer,
    load_lstm_model,
    predict_lstm,
    save_lstm_model,
    train_lstm,
)


@pytest.fixture(scope="module")
def fixture_path():
    """Returns the path to development fixture."""
    path = NLP_DIR / DEFAULT_FIXTURE_PATH
    if not path.exists():
        from fixture import create_fixture
        create_fixture(str(path))
    return str(path)


@pytest.fixture(scope="module")
def loaded_dataset(fixture_path):
    """Loads and preprocesses the development fixture dataset."""
    return load_dataset(fixture_path, validate=True)


@pytest.fixture(scope="module")
def trained_lstm(loaded_dataset):
    """Trains a baseline LSTM model on the development fixture."""
    return train_lstm(
        loaded_dataset,
        epochs=5,
        hidden_units=32,
        embedding_dim=32,
        random_state=42,
    )


# ==============================================================================
# A. MODEL CONSTRUCTION TESTS
# ==============================================================================

def test_lstm_model_construction():
    """Verify EmotionLSTM model builds with 6 output classes and correct shapes."""
    vocab_size = 100
    embedding_dim = 32
    hidden_units = 64
    model = EmotionLSTM(
        vocab_size=vocab_size,
        embedding_dim=embedding_dim,
        hidden_units=hidden_units,
        num_layers=1,
        num_classes=6,
        bidirectional=False,
    )

    batch_size = 4
    seq_len = 16
    dummy_input = torch.zeros((batch_size, seq_len), dtype=torch.long)
    output = model(dummy_input)

    assert output.shape == (batch_size, 6), f"Expected shape (4, 6), got {output.shape}"


def test_bidirectional_lstm_model_construction():
    """Verify bidirectional LSTM model builds and produces (batch, 6) output."""
    model = EmotionLSTM(
        vocab_size=50,
        embedding_dim=16,
        hidden_units=32,
        num_layers=2,
        num_classes=6,
        bidirectional=True,
    )
    dummy_input = torch.zeros((2, 10), dtype=torch.long)
    output = model(dummy_input)
    assert output.shape == (2, 6)


# ==============================================================================
# B & C. TOKENIZATION & SEQUENCE SHAPE TESTS
# ==============================================================================

def test_tokenizer_sequence_count_and_shape(loaded_dataset):
    """Verify tokenizer transforms N texts into N sequences of fixed max_sequence_length."""
    texts = [r.preprocessed_review_heavy for r in loaded_dataset.reviews]
    max_len = 24
    tokenizer = LSTMTokenizer(max_vocab_size=1000, max_sequence_length=max_len)
    tokenizer.fit(texts)

    sequences = tokenizer.texts_to_sequences(texts)
    assert len(sequences) == len(texts) == 30

    padded = tokenizer.pad_sequences(sequences, max_len=max_len)
    assert isinstance(padded, np.ndarray)
    assert padded.shape == (30, max_len)
    assert padded.dtype == np.int64


def test_tokenizer_serialization():
    """Verify tokenizer state can be converted to dict and restored accurately."""
    texts = ["sobrang ganda naman nito", "hindi ko nagustuhan ang item", "scam talaga"]
    tokenizer = LSTMTokenizer(max_vocab_size=500, max_sequence_length=32)
    tokenizer.fit(texts)

    tok_dict = tokenizer.to_dict()
    restored = LSTMTokenizer.from_dict(tok_dict)

    assert restored.vocab_size == tokenizer.vocab_size
    assert restored.max_sequence_length == tokenizer.max_sequence_length

    orig_encoded = tokenizer.transform(texts)
    restored_encoded = restored.transform(texts)
    np.testing.assert_array_equal(orig_encoded, restored_encoded)


# ==============================================================================
# D. LABEL MAPPING ALIGNMENT TESTS
# ==============================================================================

def test_label_mapping_alignment():
    """Verify exact alignment with centralized Phase 2 emotion codes (1..6)."""
    expected = {
        "Happy": 1,
        "Sad": 2,
        "Anger": 3,
        "Disgust": 4,
        "Fear": 5,
        "Sarcastic": 6,
    }
    for label, code in expected.items():
        assert EMOTION_LABEL_TO_CODE[label] == code
        assert EMOTION_CODE_TO_LABEL[code] == label
    assert VALID_EMOTION_CODES == {1, 2, 3, 4, 5, 6}


# ==============================================================================
# E. TRAINING SMOKE TESTS
# ==============================================================================

def test_training_smoke_on_fixture_dataset(loaded_dataset):
    """Verify training executes successfully on Dataset object."""
    classifier = train_lstm(
        loaded_dataset,
        epochs=3,
        batch_size=8,
        hidden_units=16,
        embedding_dim=16,
        random_state=42,
    )
    assert isinstance(classifier, LSTMEmotionClassifier)
    assert isinstance(classifier.model, EmotionLSTM)
    assert classifier.tokenizer.is_fitted


def test_training_smoke_on_filepath(fixture_path):
    """Verify training executes successfully from a CSV filepath."""
    classifier = train_lstm(
        fixture_path,
        epochs=2,
        batch_size=10,
        random_state=42,
    )
    assert isinstance(classifier, LSTMEmotionClassifier)


def test_training_smoke_on_raw_tuples():
    """Verify training executes on a tuple of (texts, labels)."""
    texts = [
        "sobrang ganda",
        "nakakalungkot",
        "galit na galit ako",
        "kadiri mabaho",
        "takot ako masira",
        "wow ang galing basag naman",
    ]
    labels = [1, 2, 3, 4, 5, 6]
    classifier = train_lstm((texts, labels), epochs=2, batch_size=2, random_state=42)
    assert isinstance(classifier, LSTMEmotionClassifier)


# ==============================================================================
# F & G. PREDICTION TESTS (SINGLE & BATCH)
# ==============================================================================

def test_prediction_single_review(trained_lstm):
    """
    Verify single review input produces exact output schema:
    {
      "emotion": str,
      "emotion_code": int
    }
    """
    review = "Sulit na sulit ang bayad dito, tuwang tuwa ako!"
    result = predict_lstm(trained_lstm, review)

    assert isinstance(result, dict)
    assert "emotion" in result
    assert "emotion_code" in result
    assert isinstance(result["emotion"], str)
    assert isinstance(result["emotion_code"], int)
    assert result["emotion_code"] in VALID_EMOTION_CODES
    assert result["emotion"] == EMOTION_CODE_TO_LABEL[result["emotion_code"]]


def test_prediction_batch_count(trained_lstm):
    """Verify N inputs produce exactly N predictions."""
    reviews = [
        "sobrang ganda!",
        "nakakalungkot sira agad",
        "ang bastos ng seller",
        "kadiri ang dumi",
        "baka sumabog takot ako",
        "amazing basag naman lol",
    ]
    results = predict_lstm(trained_lstm, reviews)

    assert isinstance(results, list)
    assert len(results) == len(reviews)
    for res in results:
        assert isinstance(res, dict)
        assert res["emotion_code"] in VALID_EMOTION_CODES
        assert res["emotion"] == EMOTION_CODE_TO_LABEL[res["emotion_code"]]


def test_predict_with_model_and_tokenizer_args(trained_lstm):
    """Verify predict_lstm works when passing (model, tokenizer, text)."""
    review = "Napakasama ng serbisyo ninyo"
    result = predict_lstm(trained_lstm.model, trained_lstm.tokenizer, review)
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


# ==============================================================================
# H. SERIALIZATION TESTS (SAVE & LOAD)
# ==============================================================================

def test_lstm_save_and_load(trained_lstm):
    """Verify safe model saving and reloading preserves exact predictions."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        model_path = Path(tmp_dir) / "test_lstm_model.pt"

        # Save model
        saved_path = save_lstm_model(trained_lstm, filepath=model_path)
        assert saved_path.exists()

        # Load model
        loaded_classifier = load_lstm_model(filepath=model_path)
        assert isinstance(loaded_classifier, LSTMEmotionClassifier)

        # Verify predictions match
        sample_text = "Galit na galit ako sa seller na ito!"
        orig_pred = predict_lstm(trained_lstm, sample_text)
        loaded_pred = predict_lstm(loaded_classifier, sample_text)

        assert orig_pred == loaded_pred
        assert loaded_pred["emotion_code"] in VALID_EMOTION_CODES


# ==============================================================================
# I. INVALID & EDGE CASE INPUT HANDLING
# ==============================================================================

def test_empty_string_input(trained_lstm):
    """Verify empty string does not crash inference."""
    result = predict_lstm(trained_lstm, "")
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


def test_whitespace_input(trained_lstm):
    """Verify whitespace string does not crash inference."""
    result = predict_lstm(trained_lstm, "      \t\n  ")
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


def test_none_input(trained_lstm):
    """Verify None input does not crash inference."""
    result = predict_lstm(trained_lstm, None)
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


def test_special_characters_input(trained_lstm):
    """Verify special symbols only do not crash inference."""
    result = predict_lstm(trained_lstm, "??? !!! @@ ### $$$ %%%")
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


# ==============================================================================
# J. NO FAKE CONFIDENCE & PROBABILITY CALIBRATION
# ==============================================================================

def test_probabilities_are_true_softmax(trained_lstm):
    """Verify probability outputs sum to 1.0 and are not hardcoded fake values."""
    review = "super happy with the quality"
    result = predict_lstm(trained_lstm, review, return_probabilities=True)

    assert "probabilities" in result
    assert "confidence" in result
    probs_dict = result["probabilities"]

    assert len(probs_dict) == 6
    for label in EMOTION_LABEL_TO_CODE.keys():
        assert label in probs_dict
        assert 0.0 <= probs_dict[label] <= 1.0

    total_prob = sum(probs_dict.values())
    assert pytest.approx(total_prob, rel=1e-3) == 1.0
    assert result["confidence"] == probs_dict[result["emotion"]]


# ==============================================================================
# K. CLASS WEIGHT SUPPORT
# ==============================================================================

def test_class_weighting_balanced(loaded_dataset):
    """Verify class_weight='balanced' executes without error."""
    classifier = train_lstm(
        loaded_dataset,
        class_weight="balanced",
        epochs=2,
        batch_size=8,
        random_state=42,
    )
    assert isinstance(classifier, LSTMEmotionClassifier)


def test_class_weighting_custom_dict(loaded_dataset):
    """Verify custom class_weight dict executes without error."""
    custom_weights = {1: 1.0, 2: 1.5, 3: 1.2, 4: 2.0, 5: 1.8, 6: 2.5}
    classifier = train_lstm(
        loaded_dataset,
        class_weight=custom_weights,
        epochs=2,
        batch_size=8,
        random_state=42,
    )
    assert isinstance(classifier, LSTMEmotionClassifier)


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
