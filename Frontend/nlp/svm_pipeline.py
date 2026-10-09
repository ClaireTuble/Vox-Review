"""
VoxReview NLP — Phase 3A: Linear SVM Emotion Classification Pipeline

This module implements a reusable multiclass Linear SVM classification pipeline
with configurable TF-IDF feature extraction (word and character n-grams) for
six-class emotion detection:
  1 = Happy
  2 = Sad
  3 = Anger
  4 = Disgust
  5 = Fear
  6 = Sarcastic

Integrates with Phase 1 preprocessing and Phase 2 dataset/label mapping infrastructure.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC

from config import (
    DEFAULT_SVM_CONFIG,
    DEFAULT_SVM_MODEL_PATH,
    DEFAULT_TFIDF_CONFIG,
    EMOTION_CODE_TO_LABEL,
    PREPROCESSING_HEAVY_CONFIG,
    VALID_EMOTION_CODES,
    is_valid_emotion_code,
)
from dataset import Dataset, DatasetLoader, Review

try:
    from preprocessing.preprocess import preprocess_review
except ImportError:
    import sys
    sys.path.insert(0, str(Path(__file__).parent / "preprocessing"))
    from preprocess import preprocess_review


# ==============================================================================
# FEATURE EXTRACTION BUILDER
# ==============================================================================

def build_feature_extractor(
    feature_type: str = "both",
    word_ngram_range: Tuple[int, int] = (1, 2),
    char_ngram_range: Tuple[int, int] = (2, 5),
    min_df: Union[int, float] = 1,
    max_df: Union[int, float] = 1.0,
    max_features_word: Optional[int] = None,
    max_features_char: Optional[int] = None,
    sublinear_tf: bool = True,
) -> Union[TfidfVectorizer, FeatureUnion]:
    """
    Build a configurable TF-IDF feature extractor.

    Supports:
    - 'word': Word n-grams only
    - 'char': Character n-grams only (vital for Taglish & spelling variations)
    - 'both': Combined word and character n-grams via FeatureUnion

    Args:
        feature_type: "word", "char", or "both" (default: "both")
        word_ngram_range: Tuple of (min_n, max_n) for word n-grams
        char_ngram_range: Tuple of (min_n, max_n) for char n-grams
        min_df: Minimum document frequency for terms
        max_df: Maximum document frequency proportion/count
        max_features_word: Maximum vocabulary size for word features
        max_features_char: Maximum vocabulary size for char features
        sublinear_tf: Apply sublinear term frequency scaling (1 + log(tf))

    Returns:
        TfidfVectorizer or FeatureUnion instance
    """
    feature_type = feature_type.lower().strip()
    if feature_type not in ("word", "char", "both"):
        raise ValueError(
            f"Invalid feature_type: '{feature_type}'. Must be 'word', 'char', or 'both'."
        )

    word_vectorizer = TfidfVectorizer(
        analyzer="word",
        ngram_range=word_ngram_range,
        min_df=min_df,
        max_df=max_df,
        max_features=max_features_word,
        sublinear_tf=sublinear_tf,
    )

    char_vectorizer = TfidfVectorizer(
        analyzer="char",
        ngram_range=char_ngram_range,
        min_df=min_df,
        max_df=max_df,
        max_features=max_features_char,
        sublinear_tf=sublinear_tf,
    )

    if feature_type == "word":
        return word_vectorizer
    elif feature_type == "char":
        return char_vectorizer
    else:
        return FeatureUnion([
            ("word_tfidf", word_vectorizer),
            ("char_tfidf", char_vectorizer),
        ])


# ==============================================================================
# PIPELINE BUILDER
# ==============================================================================

def build_svm_pipeline(
    feature_type: str = "both",
    word_ngram_range: Tuple[int, int] = (1, 2),
    char_ngram_range: Tuple[int, int] = (2, 5),
    min_df: Union[int, float] = 1,
    max_df: Union[int, float] = 1.0,
    max_features_word: Optional[int] = None,
    max_features_char: Optional[int] = None,
    sublinear_tf: bool = True,
    c_param: float = 1.0,
    loss: str = "squared_hinge",
    penalty: str = "l2",
    dual: Union[str, bool] = "auto",
    class_weight: Optional[Union[str, Dict[int, float]]] = None,
    random_state: int = 42,
    max_iter: int = 2000,
    tol: float = 1e-4,
) -> Pipeline:
    """
    Construct an end-to-end scikit-learn Pipeline linking TF-IDF and Linear SVM.

    Args:
        feature_type: "word", "char", or "both"
        word_ngram_range: (min_n, max_n) for word n-grams
        char_ngram_range: (min_n, max_n) for character n-grams
        min_df: Minimum document frequency
        max_df: Maximum document frequency
        max_features_word: Max word features
        max_features_char: Max char features
        sublinear_tf: Apply sublinear tf scaling
        c_param: Regularization parameter C for LinearSVC
        loss: Loss function ('hinge' or 'squared_hinge')
        penalty: Regularization norm ('l1' or 'l2')
        dual: Dual or primal formulation ('auto', True, False)
        class_weight: Class weight strategy (None, 'balanced', or dict)
        random_state: Seed for reproducibility
        max_iter: Maximum solver iterations
        tol: Tolerance for stopping criterion

    Returns:
        Configured, un-fitted scikit-learn Pipeline
    """
    feature_extractor = build_feature_extractor(
        feature_type=feature_type,
        word_ngram_range=word_ngram_range,
        char_ngram_range=char_ngram_range,
        min_df=min_df,
        max_df=max_df,
        max_features_word=max_features_word,
        max_features_char=max_features_char,
        sublinear_tf=sublinear_tf,
    )

    classifier = LinearSVC(
        C=c_param,
        loss=loss,
        penalty=penalty,
        dual=dual,
        class_weight=class_weight,
        random_state=random_state,
        max_iter=max_iter,
        tol=tol,
    )

    return Pipeline([
        ("tfidf", feature_extractor),
        ("clf", classifier),
    ])


# ==============================================================================
# DATA EXTRACTION HELPER
# ==============================================================================

def _extract_texts_and_labels(
    dataset_input: Union[Dataset, str, Path, List[Review], List[Dict[str, Any]], Tuple[List[str], List[int]]],
    use_heavy_preprocessing: bool = True,
) -> Tuple[List[str], List[int]]:
    """
    Extract normalized review texts and emotion codes from various dataset formats.

    Args:
        dataset_input: Dataset instance, CSV file path, list of Reviews, or (texts, labels) tuple
        use_heavy_preprocessing: Whether to apply or use heavy preprocessed text

    Returns:
        (texts, labels) tuple where labels are valid emotion codes (1-6)
    """
    texts: List[str] = []
    labels: List[int] = []

    # Case 1: CSV file path
    if isinstance(dataset_input, (str, Path)):
        loader = DatasetLoader(validate=True, apply_preprocessing=True)
        dataset_obj, _ = loader.load(str(dataset_input))
        return _extract_texts_and_labels(dataset_obj, use_heavy_preprocessing=use_heavy_preprocessing)

    # Case 2: Dataset object
    if isinstance(dataset_input, Dataset):
        for review in dataset_input.reviews:
            if not is_valid_emotion_code(review.emotion_code):
                continue
            if use_heavy_preprocessing:
                text = review.preprocessed_review_heavy
                if not text:
                    text = preprocess_review(review.raw_review, **PREPROCESSING_HEAVY_CONFIG)
            else:
                text = review.raw_review
            texts.append(text)
            labels.append(review.emotion_code)
        return texts, labels

    # Case 3: List of Review objects or dicts
    if isinstance(dataset_input, list):
        for item in dataset_input:
            if isinstance(item, Review):
                if not is_valid_emotion_code(item.emotion_code):
                    continue
                if use_heavy_preprocessing:
                    text = item.preprocessed_review_heavy
                    if not text:
                        text = preprocess_review(item.raw_review, **PREPROCESSING_HEAVY_CONFIG)
                else:
                    text = item.raw_review
                texts.append(text)
                labels.append(item.emotion_code)
            elif isinstance(item, dict):
                code = item.get("emotion_code")
                if not is_valid_emotion_code(code):
                    continue
                raw_text = item.get("raw_review", item.get("text", ""))
                if use_heavy_preprocessing:
                    text = item.get("preprocessed_heavy") or preprocess_review(
                        raw_text, **PREPROCESSING_HEAVY_CONFIG
                    )
                else:
                    text = raw_text
                texts.append(text)
                labels.append(code)
            else:
                raise TypeError(f"Unsupported item type in list: {type(item)}")
        return texts, labels

    # Case 4: Tuple of (texts, labels)
    if isinstance(dataset_input, tuple) and len(dataset_input) == 2:
        raw_texts, raw_labels = dataset_input
        if len(raw_texts) != len(raw_labels):
            raise ValueError(
                f"Mismatch: {len(raw_texts)} texts vs {len(raw_labels)} labels"
            )
        for t, l in zip(raw_texts, raw_labels):
            if not is_valid_emotion_code(l):
                raise ValueError(f"Invalid emotion code: {l}. Must be one of {VALID_EMOTION_CODES}")
            if use_heavy_preprocessing:
                processed_t = preprocess_review(str(t), **PREPROCESSING_HEAVY_CONFIG)
            else:
                processed_t = str(t)
            texts.append(processed_t)
            labels.append(int(l))
        return texts, labels

    raise TypeError(f"Unsupported dataset input type: {type(dataset_input)}")


# ==============================================================================
# TRAINING INTERFACE
# ==============================================================================

def train_svm(
    dataset: Union[Dataset, str, Path, List[Review], List[Dict[str, Any]], Tuple[List[str], List[int]]],
    *,
    feature_type: str = DEFAULT_TFIDF_CONFIG["feature_type"],
    word_ngram_range: Tuple[int, int] = DEFAULT_TFIDF_CONFIG["word_ngram_range"],
    char_ngram_range: Tuple[int, int] = DEFAULT_TFIDF_CONFIG["char_ngram_range"],
    min_df: Union[int, float] = DEFAULT_TFIDF_CONFIG["min_df"],
    max_df: Union[int, float] = 1.0,
    max_features_word: Optional[int] = DEFAULT_TFIDF_CONFIG["max_features_word"],
    max_features_char: Optional[int] = DEFAULT_TFIDF_CONFIG["max_features_char"],
    sublinear_tf: bool = DEFAULT_TFIDF_CONFIG["sublinear_tf"],
    c_param: float = DEFAULT_SVM_CONFIG["c_param"],
    loss: str = DEFAULT_SVM_CONFIG["loss"],
    penalty: str = DEFAULT_SVM_CONFIG["penalty"],
    dual: Union[str, bool] = DEFAULT_SVM_CONFIG["dual"],
    class_weight: Optional[Union[str, Dict[int, float]]] = DEFAULT_SVM_CONFIG["class_weight"],
    random_state: int = DEFAULT_SVM_CONFIG["random_state"],
    max_iter: int = DEFAULT_SVM_CONFIG["max_iter"],
    tol: float = DEFAULT_SVM_CONFIG["tol"],
    use_heavy_preprocessing: bool = True,
) -> Pipeline:
    """
    Train a Linear SVM emotion classifier on the provided dataset.

    Requirements met:
    - Accepts validated dataset or path
    - Uses existing heavy preprocessing
    - Generates configurable TF-IDF features (word and character n-grams)
    - Trains Linear SVM classifier
    - Returns fitted scikit-learn Pipeline
    - Independent of absolute paths

    Args:
        dataset: Dataset object, CSV filepath, list of Review items, or (texts, labels) tuple
        feature_type: "word", "char", or "both"
        word_ngram_range: Word n-gram range
        char_ngram_range: Character n-gram range
        min_df: Minimum document frequency
        max_df: Maximum document frequency
        max_features_word: Max word features
        max_features_char: Max char features
        sublinear_tf: Sublinear TF scaling
        c_param: LinearSVC regularization strength C
        loss: Loss function ('squared_hinge' or 'hinge')
        penalty: Regularization norm ('l2' or 'l1')
        dual: 'auto', True, or False
        class_weight: Class weighting ('balanced', None, or dict)
        random_state: Random seed for reproducibility
        max_iter: Maximum iterations
        tol: Tolerance for stopping criterion
        use_heavy_preprocessing: Use heavy preprocessing text

    Returns:
        Fitted scikit-learn Pipeline (TF-IDF + LinearSVC)
    """
    texts, labels = _extract_texts_and_labels(
        dataset, use_heavy_preprocessing=use_heavy_preprocessing
    )

    if not texts or not labels:
        raise ValueError("Cannot train SVM: extracted 0 valid training samples.")

    # Verify that labels are non-empty and have valid codes
    unique_labels = set(labels)
    for code in unique_labels:
        if not is_valid_emotion_code(code):
            raise ValueError(f"Encountered invalid emotion code during training: {code}")

    # Build pipeline
    pipeline = build_svm_pipeline(
        feature_type=feature_type,
        word_ngram_range=word_ngram_range,
        char_ngram_range=char_ngram_range,
        min_df=min_df,
        max_df=max_df,
        max_features_word=max_features_word,
        max_features_char=max_features_char,
        sublinear_tf=sublinear_tf,
        c_param=c_param,
        loss=loss,
        penalty=penalty,
        dual=dual,
        class_weight=class_weight,
        random_state=random_state,
        max_iter=max_iter,
        tol=tol,
    )

    # Fit pipeline
    pipeline.fit(texts, labels)
    return pipeline


# ==============================================================================
# PREDICTION INTERFACE
# ==============================================================================

def _safe_preprocess_input(text: Any) -> str:
    """Safely preprocess input text without throwing exceptions for edge cases."""
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    cleaned = text.strip()
    if not cleaned:
        return ""
    return preprocess_review(cleaned, **PREPROCESSING_HEAVY_CONFIG)


def predict_svm(
    model: Pipeline,
    text: Union[str, List[str], Any],
    *,
    preprocess: bool = True,
) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Predict emotion using a fitted Linear SVM pipeline.

    Output format for single input:
        {
            "emotion": "Anger",
            "emotion_code": 3
        }

    Output format for list of N inputs:
        [
            {"emotion": "Happy", "emotion_code": 1},
            ...
        ]

    Note on confidence:
    No fake or arbitrary confidence values are fabricated.

    Args:
        model: Fitted scikit-learn Pipeline (TF-IDF + LinearSVC)
        text: Single review string or list of review strings
        preprocess: Whether to apply heavy Taglish preprocessing to raw text

    Returns:
        Dictionary or list of dictionaries containing emotion and emotion_code
    """
    if model is None:
        raise ValueError("Model pipeline cannot be None.")

    # Check if single string or batch
    is_single = isinstance(text, str) or text is None

    if is_single:
        raw_items = [text]
    elif isinstance(text, (list, tuple)):
        raw_items = list(text)
    else:
        raw_items = [str(text)]

    # Process inputs safely
    processed_texts: List[str] = []
    for item in raw_items:
        if preprocess:
            processed = _safe_preprocess_input(item)
        else:
            processed = "" if item is None else str(item)
        processed_texts.append(processed)

    # Perform predictions
    predictions = model.predict(processed_texts)

    results: List[Dict[str, Any]] = []
    for pred_code in predictions:
        code_int = int(pred_code)
        label_str = EMOTION_CODE_TO_LABEL.get(code_int, "Unknown")
        results.append({
            "emotion": label_str,
            "emotion_code": code_int,
        })

    if is_single:
        return results[0]
    return results


# ==============================================================================
# MODEL SAVE / LOAD
# ==============================================================================

def save_svm_model(
    model: Pipeline,
    filepath: Optional[Union[str, Path]] = None,
) -> Path:
    """
    Save the fitted SVM pipeline (TF-IDF vectorizer + Linear SVM classifier) to disk.

    Args:
        model: Fitted scikit-learn Pipeline
        filepath: Target file path (default: relative 'models/svm_model.joblib')

    Returns:
        Path object of the saved model
    """
    if model is None:
        raise ValueError("Cannot save None model.")

    if filepath is None:
        base_dir = Path(__file__).parent
        target_path = base_dir / DEFAULT_SVM_MODEL_PATH
    else:
        target_path = Path(filepath)

    target_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, target_path)
    return target_path


def load_svm_model(
    filepath: Optional[Union[str, Path]] = None,
) -> Pipeline:
    """
    Load a saved SVM pipeline from disk.

    Args:
        filepath: Path to saved model file (default: relative 'models/svm_model.joblib')

    Returns:
        Loaded scikit-learn Pipeline ready for inference
    """
    if filepath is None:
        base_dir = Path(__file__).parent
        target_path = base_dir / DEFAULT_SVM_MODEL_PATH
    else:
        target_path = Path(filepath)

    if not target_path.exists():
        raise FileNotFoundError(f"SVM model file not found at: {target_path}")

    model = joblib.load(target_path)
    if not hasattr(model, "predict"):
        raise ValueError(f"Loaded object from {target_path} is not a valid predictor pipeline.")

    return model
