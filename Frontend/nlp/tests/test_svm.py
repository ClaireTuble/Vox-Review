"""
Comprehensive Unit and Integration Tests for Linear SVM Emotion Classification Pipeline.

Covers:
1. Training on development fixture
2. Single prediction structure {"emotion": ..., "emotion_code": ...}
3. Batch prediction count (N inputs -> N outputs)
4. Centralized label mapping compliance (1..6)
5. TF-IDF feature extraction shapes (word, char, both)
6. Configurable parameters (n-gram ranges, min_df, max_features, class_weight, C)
7. Pipeline serialization (save and reload)
8. Edge cases and invalid input safety (empty strings, whitespace, None, etc.)
"""

import sys
import tempfile
from pathlib import Path
from typing import List, Dict, Any

import pytest
from sklearn.pipeline import Pipeline

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
from svm_pipeline import (
    build_feature_extractor,
    build_svm_pipeline,
    train_svm,
    predict_svm,
    save_svm_model,
    load_svm_model,
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
def trained_model(loaded_dataset):
    """Trains a baseline SVM model on the development fixture."""
    return train_svm(loaded_dataset, random_state=42)


# ==============================================================================
# 1. LABEL MAPPING VERIFICATION
# ==============================================================================

def test_central_label_mapping_alignment():
    """Verify exact alignment with centralized Phase 2 taxonomy."""
    expected_mapping = {
        "Happy": 1,
        "Sad": 2,
        "Anger": 3,
        "Disgust": 4,
        "Fear": 5,
        "Sarcastic": 6,
    }
    for label, code in expected_mapping.items():
        assert EMOTION_LABEL_TO_CODE[label] == code, f"Label {label} must map to {code}"
        assert EMOTION_CODE_TO_LABEL[code] == label, f"Code {code} must map to {label}"
    assert set(expected_mapping.values()) == VALID_EMOTION_CODES


# ==============================================================================
# 2. TF-IDF FEATURE EXTRACTION TESTS
# ==============================================================================

def test_tfidf_word_features_shape(loaded_dataset):
    """Verify word n-gram feature matrix has valid shape (rows = N, cols > 0)."""
    extractor = build_feature_extractor(
        feature_type="word",
        word_ngram_range=(1, 2),
        min_df=1,
    )
    texts = [r.preprocessed_review_heavy for r in loaded_dataset.reviews]
    matrix = extractor.fit_transform(texts)
    
    assert matrix.shape[0] == len(texts)
    assert matrix.shape[1] > 0
    assert matrix.shape[0] == 30


def test_tfidf_char_features_shape(loaded_dataset):
    """Verify char n-gram feature matrix has valid shape (rows = N, cols > 0)."""
    extractor = build_feature_extractor(
        feature_type="char",
        char_ngram_range=(2, 5),
        min_df=1,
    )
    texts = [r.preprocessed_review_heavy for r in loaded_dataset.reviews]
    matrix = extractor.fit_transform(texts)
    
    assert matrix.shape[0] == len(texts)
    assert matrix.shape[1] > 0
    assert matrix.shape[0] == 30


def test_tfidf_combined_features_shape(loaded_dataset):
    """Verify combined word + char features via FeatureUnion."""
    extractor = build_feature_extractor(
        feature_type="both",
        word_ngram_range=(1, 2),
        char_ngram_range=(2, 5),
        min_df=1,
    )
    texts = [r.preprocessed_review_heavy for r in loaded_dataset.reviews]
    matrix = extractor.fit_transform(texts)
    
    word_ext = build_feature_extractor(feature_type="word", word_ngram_range=(1, 2), min_df=1)
    char_ext = build_feature_extractor(feature_type="char", char_ngram_range=(2, 5), min_df=1)
    word_cols = word_ext.fit_transform(texts).shape[1]
    char_cols = char_ext.fit_transform(texts).shape[1]
    
    assert matrix.shape[0] == len(texts)
    assert matrix.shape[1] == word_cols + char_cols


def test_tfidf_max_features_constraint(loaded_dataset):
    """Verify max_features parameter limits vocabulary size appropriately."""
    extractor = build_feature_extractor(
        feature_type="word",
        word_ngram_range=(1, 1),
        max_features_word=15,
        min_df=1,
    )
    texts = [r.preprocessed_review_heavy for r in loaded_dataset.reviews]
    matrix = extractor.fit_transform(texts)
    assert matrix.shape[1] <= 15


# ==============================================================================
# 3. TRAINING INTERFACE TESTS
# ==============================================================================

def test_training_on_dataset_object(loaded_dataset):
    """Verify training executes successfully from a Dataset object."""
    pipeline = train_svm(loaded_dataset, random_state=42)
    assert isinstance(pipeline, Pipeline)
    assert "tfidf" in pipeline.named_steps
    assert "clf" in pipeline.named_steps


def test_training_on_filepath(fixture_path):
    """Verify training executes successfully when given a file path."""
    pipeline = train_svm(fixture_path, random_state=42)
    assert isinstance(pipeline, Pipeline)


def test_training_on_raw_tuple():
    """Verify training executes on a tuple of (texts, labels)."""
    texts = [
        "sobrang saya ko dito!",
        "nakakalungkot naman ito",
        "nakakainis ang bastos",
        "kadiri ang dumi",
        "takot ako masira",
        "ang galing galing basag naman",
    ]
    labels = [1, 2, 3, 4, 5, 6]
    pipeline = train_svm((texts, labels), min_df=1, random_state=42)
    assert isinstance(pipeline, Pipeline)


def test_training_configurable_hyperparameters(loaded_dataset):
    """Verify training accepts configurable parameters without failure."""
    pipeline = train_svm(
        loaded_dataset,
        feature_type="both",
        word_ngram_range=(1, 3),
        char_ngram_range=(3, 5),
        c_param=0.5,
        class_weight="balanced",
        random_state=123,
        max_iter=3000,
    )
    clf = pipeline.named_steps["clf"]
    assert clf.C == 0.5
    assert clf.class_weight == "balanced"
    assert clf.max_iter == 3000


# ==============================================================================
# 4. PREDICTION INTERFACE TESTS
# ==============================================================================

def test_prediction_single_review(trained_model):
    """
    Verify single review input produces exact output schema:
    {
      "emotion": str,
      "emotion_code": int
    }
    """
    review = "sobrang saya ko sulit na sulit purchase na ito!"
    result = predict_svm(trained_model, review)
    
    assert isinstance(result, dict)
    assert "emotion" in result
    assert "emotion_code" in result
    assert isinstance(result["emotion"], str)
    assert isinstance(result["emotion_code"], int)
    assert result["emotion_code"] in VALID_EMOTION_CODES
    assert result["emotion"] == EMOTION_CODE_TO_LABEL[result["emotion_code"]]


def test_prediction_batch_count(trained_model):
    """Verify N inputs produce exactly N predictions."""
    reviews = [
        "Ang ganda sobra!",
        "Bakit ganito sira agad",
        "Napakabastos ng delivery rider",
        "Kadiri may ipis sa loob",
        "Nakakatakot baka sumabog",
    ]
    results = predict_svm(trained_model, reviews)
    
    assert isinstance(results, list)
    assert len(results) == len(reviews)
    for res in results:
        assert isinstance(res, dict)
        assert res["emotion_code"] in VALID_EMOTION_CODES
        assert res["emotion"] == EMOTION_CODE_TO_LABEL[res["emotion_code"]]


def test_prediction_all_six_classes_recognized(loaded_dataset):
    """Verify all 6 classes can be predicted from the fitted model."""
    pipeline = train_svm(loaded_dataset, random_state=42)
    raw_samples = [r.raw_review for r in loaded_dataset.reviews]
    results = predict_svm(pipeline, raw_samples)
    
    predicted_codes = {r["emotion_code"] for r in results}
    # Development fixture samples should allow all 6 classes to be present
    assert len(predicted_codes) == 6


# ==============================================================================
# 5. MODEL SERIALIZATION (SAVE / LOAD)
# ==============================================================================

def test_model_save_and_load(trained_model):
    """Verify safe model saving and reloading preserves prediction capability."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        model_path = Path(tmp_dir) / "test_svm_model.joblib"
        
        # Save model
        saved_path = save_svm_model(trained_model, filepath=model_path)
        assert saved_path.exists()
        
        # Load model
        loaded_model = load_svm_model(filepath=model_path)
        assert isinstance(loaded_model, Pipeline)
        
        # Verify predictions match between original and reloaded model
        test_text = "Napakasama ng experience ko dito, galit na galit ako"
        orig_pred = predict_svm(trained_model, test_text)
        loaded_pred = predict_svm(loaded_model, test_text)
        
        assert orig_pred == loaded_pred
        assert loaded_pred["emotion_code"] in VALID_EMOTION_CODES


# ==============================================================================
# 6. EDGE CASES AND INVALID INPUT HANDLING
# ==============================================================================

def test_empty_input_handling(trained_model):
    """Verify empty string does not crash inference."""
    result = predict_svm(trained_model, "")
    assert isinstance(result, dict)
    assert "emotion" in result
    assert "emotion_code" in result
    assert result["emotion_code"] in VALID_EMOTION_CODES


def test_whitespace_input_handling(trained_model):
    """Verify whitespace string does not crash inference."""
    result = predict_svm(trained_model, "     ")
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


def test_none_input_handling(trained_model):
    """Verify None input does not crash inference."""
    result = predict_svm(trained_model, None)
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


def test_special_characters_only(trained_model):
    """Verify string of symbols/emojis only does not crash inference."""
    result = predict_svm(trained_model, "??? !!! @@@ ### $$$")
    assert isinstance(result, dict)
    assert result["emotion_code"] in VALID_EMOTION_CODES


# ==============================================================================
# RUNNER
# ==============================================================================

def run_all_tests():
    """Run test suite directly and return status."""
    import pytest
    return pytest.main(["-v", str(Path(__file__))])


if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
