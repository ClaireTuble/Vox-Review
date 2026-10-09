"""
VoxReview NLP Models package.
"""

import sys
from pathlib import Path

NLP_DIR = Path(__file__).parent.parent
if str(NLP_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_DIR))

from svm_pipeline import (
    build_feature_extractor,
    build_svm_pipeline,
    train_svm,
    predict_svm,
    save_svm_model,
    load_svm_model,
)

from lstm_pipeline import (
    EmotionLSTM,
    LSTMEmotionClassifier,
    LSTMTokenizer,
    train_lstm,
    predict_lstm,
    save_lstm_model,
    load_lstm_model,
)

from xlmr_pipeline import (
    INTERNAL_ID_TO_LABEL,
    INTERNAL_LABEL_TO_ID,
    XLMRobertaEmotionClassifier,
    code_to_internal_id,
    internal_id_to_code,
    train_xlmr,
    predict_xlmr,
    save_xlmr_model,
    load_xlmr_model,
)

__all__ = [
    # Candidate 1: Linear SVM
    "build_feature_extractor",
    "build_svm_pipeline",
    "train_svm",
    "predict_svm",
    "save_svm_model",
    "load_svm_model",
    # Candidate 2: LSTM
    "EmotionLSTM",
    "LSTMEmotionClassifier",
    "LSTMTokenizer",
    "train_lstm",
    "predict_lstm",
    "save_lstm_model",
    "load_lstm_model",
    # Candidate 3: XLM-RoBERTa
    "INTERNAL_ID_TO_LABEL",
    "INTERNAL_LABEL_TO_ID",
    "XLMRobertaEmotionClassifier",
    "code_to_internal_id",
    "internal_id_to_code",
    "train_xlmr",
    "predict_xlmr",
    "save_xlmr_model",
    "load_xlmr_model",
]
