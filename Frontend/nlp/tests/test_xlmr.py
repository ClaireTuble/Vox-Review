"""
Comprehensive Unit and Smoke Tests for XLM-RoBERTa Emotion Classification Pipeline.

Covers:
1. Model construction with 6 output emotion classes
2. Tokenization and sequence representation (N inputs -> N tokenized rows)
3. Sequence shape and truncation (respects max_sequence_length)
4. Central label mapping consistency (Happy=1, Sad=2, Anger=3, Disgust=4, Fear=5, Sarcastic=6)
5. Reversible label conversions (1..6 public <-> 0..5 internal Transformer ids)
6. Training smoke test on development fixture (CPU safe)
7. Single review prediction schema {"emotion": ..., "emotion_code": ...}
8. Batch prediction count (N inputs -> N outputs)
9. Model and tokenizer serialization (save and reload)
10. Invalid and edge case input handling (empty, whitespace, None, symbols)
11. Softmax probability output verification (no hardcoded/fake confidence)
12. Class-weight support ('balanced' and custom dict)
"""

import json
import sys
import tempfile
from pathlib import Path
from typing import List, Dict, Any

import numpy as np
import pytest
import torch
from transformers import AutoConfig, AutoModelForSequenceClassification, AutoTokenizer, XLMRobertaConfig

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
    VALID_EMOTION_CODES,
)
from dataset import load_dataset
from xlmr_pipeline import (
    INTERNAL_ID_TO_LABEL,
    INTERNAL_LABEL_TO_ID,
    TransformerTextDataset,
    XLMRobertaEmotionClassifier,
    code_to_internal_id,
    internal_id_to_code,
    load_xlmr_model,
    predict_xlmr,
    save_xlmr_model,
    train_xlmr,
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
def lightweight_xlmr_config():
    """Returns a lightweight Transformer config for rapid CPU smoke testing."""
    return XLMRobertaConfig(
        vocab_size=2000,
        hidden_size=64,
        num_attention_heads=2,
        num_hidden_layers=2,
        intermediate_size=128,
        max_position_embeddings=128,
        num_labels=6,
        id2label=INTERNAL_ID_TO_LABEL,
        label2id=INTERNAL_LABEL_TO_ID,
    )


@pytest.fixture(scope="module")
def test_tokenizer():
    """Returns a lightweight fast tokenizer for testing."""
    # Use standard fast tokenizer or initialize from basic tokenizer
    try:
        tok = AutoTokenizer.from_pretrained("xlm-roberta-base")
    except Exception:
        tok = AutoTokenizer.from_pretrained("bert-base-multilingual-cased")
    return tok


@pytest.fixture(scope="module")
def trained_xlmr(loaded_dataset, lightweight_xlmr_config, test_tokenizer):
    """Trains a lightweight XLM-R classifier on the development fixture on CPU."""
    return train_xlmr(
        loaded_dataset,
        max_sequence_length=32,
        batch_size=8,
        epochs=2,
        learning_rate=1e-3,
        random_state=42,
        device="cpu",
        pretrained_model_or_config=lightweight_xlmr_config,
        tokenizer_instance=test_tokenizer,
    )


# ==============================================================================
# 1. MODEL CONSTRUCTION & ARCHITECTURE
# ==============================================================================

def test_xlmr_model_construction(lightweight_xlmr_config):
    """Verify sequence classification model builds with exactly 6 outputs."""
    model = AutoModelForSequenceClassification.from_config(lightweight_xlmr_config)
    assert model.num_labels == 6

    batch_size = 2
    seq_len = 16
    dummy_input_ids = torch.randint(0, 500, (batch_size, seq_len), dtype=torch.long)
    dummy_mask = torch.ones((batch_size, seq_len), dtype=torch.long)

    outputs = model(input_ids=dummy_input_ids, attention_mask=dummy_mask)
    assert outputs.logits.shape == (batch_size, 6)


# ==============================================================================
# 2. TOKENIZATION & INPUT SHAPES
# ==============================================================================

def test_xlmr_tokenization_count_and_shape(loaded_dataset, test_tokenizer):
    """Verify tokenizer transforms N reviews into N valid encoded inputs."""
    texts = [r.preprocessed_review_light for r in loaded_dataset.reviews]
    max_len = 24

    encoded = test_tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=max_len,
        return_tensors="pt",
    )

    assert "input_ids" in encoded
    assert "attention_mask" in encoded
    assert encoded["input_ids"].shape[0] == len(texts) == 30
    assert encoded["input_ids"].shape[1] <= max_len


def test_transformer_dataset_wrapper(test_tokenizer):
    """Verify TransformerTextDataset correctly wraps encodings and converts labels."""
    texts = ["maganda ang item", "pangit sira agad"]
    labels = [1, 2]  # Happy=1, Sad=2
    encodings = test_tokenizer(texts, padding=True, return_tensors="pt")
    dataset = TransformerTextDataset(encodings, labels)

    assert len(dataset) == 2
    item0 = dataset[0]
    assert "input_ids" in item0
    assert "labels" in item0
    # Internal label conversion: 1 -> 0, 2 -> 1
    assert item0["labels"].item() == 0
    assert dataset[1]["labels"].item() == 1


# ==============================================================================
# 3. LABEL MAPPING & CONVERSION CONSISTENCY
# ==============================================================================

def test_central_label_mapping_alignment():
    """Verify alignment with Phase 2 taxonomy across all 6 classes."""
    expected_mapping = {
        "Happy": 1,
        "Sad": 2,
        "Anger": 3,
        "Disgust": 4,
        "Fear": 5,
        "Sarcastic": 6,
    }
    for label, code in expected_mapping.items():
        assert EMOTION_LABEL_TO_CODE[label] == code
        assert EMOTION_CODE_TO_LABEL[code] == label
    assert VALID_EMOTION_CODES == {1, 2, 3, 4, 5, 6}


def test_reversible_internal_label_mapping():
    """Verify 1-based project codes <-> 0-based internal IDs are perfectly reversible."""
    for code in range(1, 7):
        internal_id = code_to_internal_id(code)
        assert internal_id == code - 1
        assert 0 <= internal_id <= 5

        restored_code = internal_id_to_code(internal_id)
        assert restored_code == code

        # Label consistency
        assert INTERNAL_ID_TO_LABEL[internal_id] == EMOTION_CODE_TO_LABEL[code]
        assert INTERNAL_LABEL_TO_ID[EMOTION_CODE_TO_LABEL[code]] == internal_id


# ==============================================================================
# 4. TRAINING SMOKE TESTS (CPU SAFE)
# ==============================================================================

def test_training_smoke_on_fixture_dataset(trained_xlmr):
    """Verify training executes successfully without crashing on CPU."""
    assert isinstance(trained_xlmr, XLMRobertaEmotionClassifier)
    assert trained_xlmr.device.type == "cpu"
    assert trained_xlmr.config["num_classes"] == 6


def test_training_smoke_on_filepath(fixture_path, lightweight_xlmr_config, test_tokenizer):
    """Verify training executes from CSV filepath."""
    classifier = train_xlmr(
        fixture_path,
        max_sequence_length=16,
        batch_size=10,
        epochs=1,
        device="cpu",
        pretrained_model_or_config=lightweight_xlmr_config,
        tokenizer_instance=test_tokenizer,
    )
    assert isinstance(classifier, XLMRobertaEmotionClassifier)


def test_training_smoke_on_raw_tuple(lightweight_xlmr_config, test_tokenizer):
    """Verify training executes on a (texts, labels) tuple."""
    texts = [
        "sobrang saya ko dito!",
        "nakakalungkot naman ito",
        "nakakainis ang bastos",
        "kadiri ang dumi",
        "takot ako masira",
        "ang galing galing basag naman",
    ]
    labels = [1, 2, 3, 4, 5, 6]
    classifier = train_xlmr(
        (texts, labels),
        max_sequence_length=16,
        batch_size=2,
        epochs=1,
        device="cpu",
        pretrained_model_or_config=lightweight_xlmr_config,
        tokenizer_instance=test_tokenizer,
    )
    assert isinstance(classifier, XLMRobertaEmotionClassifier)


# ==============================================================================
# 5. PREDICTION INTERFACE TESTS
# ==============================================================================

def test_prediction_single_review(trained_xlmr):
    """
    Verify single review input produces exact output schema:
    {
      "emotion": str,
      "emotion_code": int
    }
    """
    review = "Sulit na sulit ang ganda ng item!"
    result = predict_xlmr(trained_xlmr, review)

    assert isinstance(result, dict)
    assert "emotion" in result
    assert "emotion_code" in result
    assert isinstance(result["emotion"], str)
    assert isinstance(result["emotion_code"], int)
    assert result["emotion_code"] in VALID_EMOTION_CODES
    assert result["emotion"] == EMOTION_CODE_TO_LABEL[result["emotion_code"]]


def test_prediction_batch_count(trained_xlmr):
    """Verify N inputs produce exactly N predictions."""
    reviews = [
        "Sobrang ganda naman ❤️",
        "Disappointing talaga basag agad :(",
        "Ang bastos ng delivery rider 😡",
        "Mabaho at naninikip 😒",
        "Takot ako gamitin baka sumabog 😨",
        "Wow galing 3 weeks delivery amazing 🙄",
    ]
    results = predict_xlmr(trained_xlmr, reviews)

    assert isinstance(results, list)
    assert len(results) == len(reviews)
    for res in results:
        assert isinstance(res, dict)
        assert res["emotion_code"] in VALID_EMOTION_CODES
        assert res["emotion"] == EMOTION_CODE_TO_LABEL[res["emotion_code"]]


def test_predict_with_model_and_tokenizer_args(trained_xlmr):
    """Verify predict_xlmr accepts (model, tokenizer, text) signature."""
    review = "Scam ito huwag bumili"
    result = predict_xlmr(trained_xlmr.model, trained_xlmr.tokenizer, review)
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


# ==============================================================================
# 6. SERIALIZATION TESTS (SAVE & LOAD)
# ==============================================================================

def test_xlmr_save_and_load(trained_xlmr):
    """Verify model and tokenizer save and reload with identical prediction outputs."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        model_dir = Path(tmp_dir) / "test_xlmr_saved"

        # Save model and tokenizer
        saved_dir = save_xlmr_model(trained_xlmr, directory_path=model_dir)
        assert saved_dir.exists()
        assert (saved_dir / "config.json").exists()
        assert (saved_dir / "voxreview_xlmr_meta.json").exists()

        # Load model and tokenizer
        loaded_classifier = load_xlmr_model(directory_path=model_dir, device="cpu")
        assert isinstance(loaded_classifier, XLMRobertaEmotionClassifier)

        # Test prediction matching
        test_text = "Napakasama ng serbisyo, galit na galit ako"
        orig_pred = predict_xlmr(trained_xlmr, test_text)
        loaded_pred = predict_xlmr(loaded_classifier, test_text)

        assert orig_pred == loaded_pred
        assert loaded_pred["emotion_code"] in VALID_EMOTION_CODES


# ==============================================================================
# 7. INVALID & EDGE CASE INPUT HANDLING
# ==============================================================================

def test_empty_string_input(trained_xlmr):
    """Verify empty string input does not crash inference."""
    result = predict_xlmr(trained_xlmr, "")
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


def test_whitespace_input(trained_xlmr):
    """Verify whitespace string does not crash inference."""
    result = predict_xlmr(trained_xlmr, "     \n\t  ")
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


def test_none_input(trained_xlmr):
    """Verify None input does not crash inference."""
    result = predict_xlmr(trained_xlmr, None)
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


def test_special_characters_only(trained_xlmr):
    """Verify special symbols input does not crash inference."""
    result = predict_xlmr(trained_xlmr, "??? !!! @@@ ### $$$ %%%")
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


# ==============================================================================
# 8. NO FAKE CONFIDENCE & PROBABILITY OUTPUT
# ==============================================================================

def test_probabilities_are_true_softmax(trained_xlmr):
    """Verify probability outputs sum to 1.0 and are not hardcoded fake values."""
    review = "sobrang ganda sulit na sulit ❤️"
    result = predict_xlmr(trained_xlmr, review, return_probabilities=True)

    assert "probabilities" in result
    assert "confidence" in result
    probs = result["probabilities"]

    assert len(probs) == 6
    for label in EMOTION_LABEL_TO_CODE.keys():
        assert label in probs
        assert 0.0 <= probs[label] <= 1.0

    total_prob = sum(probs.values())
    assert pytest.approx(total_prob, rel=1e-3) == 1.0
    assert result["confidence"] == probs[result["emotion"]]


# ==============================================================================
# 9. CLASS-WEIGHT SUPPORT
# ==============================================================================

def test_class_weighting_balanced(loaded_dataset, lightweight_xlmr_config, test_tokenizer):
    """Verify class_weight='balanced' executes without error."""
    classifier = train_xlmr(
        loaded_dataset,
        class_weight="balanced",
        max_sequence_length=16,
        batch_size=8,
        epochs=1,
        device="cpu",
        pretrained_model_or_config=lightweight_xlmr_config,
        tokenizer_instance=test_tokenizer,
    )
    assert isinstance(classifier, XLMRobertaEmotionClassifier)


def test_class_weighting_custom_dict(loaded_dataset, lightweight_xlmr_config, test_tokenizer):
    """Verify custom class_weight dict executes without error."""
    custom_weights = {1: 1.0, 2: 1.5, 3: 1.2, 4: 2.0, 5: 1.8, 6: 2.5}
    classifier = train_xlmr(
        loaded_dataset,
        class_weight=custom_weights,
        max_sequence_length=16,
        batch_size=8,
        epochs=1,
        device="cpu",
        pretrained_model_or_config=lightweight_xlmr_config,
        tokenizer_instance=test_tokenizer,
    )
    assert isinstance(classifier, XLMRobertaEmotionClassifier)


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
