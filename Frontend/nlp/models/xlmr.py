"""
VoxReview NLP — XLM-RoBERTa Emotion Classification Model
Re-exports core XLM-R pipeline interfaces from xlmr_pipeline.py.
"""

from xlmr_pipeline import (
    INTERNAL_ID_TO_LABEL,
    INTERNAL_LABEL_TO_ID,
    XLMRobertaEmotionClassifier,
    code_to_internal_id,
    internal_id_to_code,
    load_xlmr_model,
    predict_xlmr,
    save_xlmr_model,
    train_xlmr,
)

__all__ = [
    "INTERNAL_ID_TO_LABEL",
    "INTERNAL_LABEL_TO_ID",
    "XLMRobertaEmotionClassifier",
    "code_to_internal_id",
    "internal_id_to_code",
    "load_xlmr_model",
    "predict_xlmr",
    "save_xlmr_model",
    "train_xlmr",
]
