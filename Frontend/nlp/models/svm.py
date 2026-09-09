"""
VoxReview NLP — Linear SVM Emotion Classification Model
Re-exports core SVM pipeline interfaces from svm_pipeline.py.
"""

from svm_pipeline import (
    build_feature_extractor,
    build_svm_pipeline,
    train_svm,
    predict_svm,
    save_svm_model,
    load_svm_model,
)

__all__ = [
    "build_feature_extractor",
    "build_svm_pipeline",
    "train_svm",
    "predict_svm",
    "save_svm_model",
    "load_svm_model",
]
