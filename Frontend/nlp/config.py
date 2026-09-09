"""
VoxReview NLP Configuration - Central Label Mapping & Constants

This module provides centralized configuration for the NLP system,
ensuring all components (dataset loader, validators, models) use
the exact same emotion labels and codes.
"""

# ==============================================================================
# CENTRAL EMOTION LABEL MAPPING (Six-class taxonomy)
# ==============================================================================
# This mapping is used across:
# - Dataset loader
# - Validation system
# - ML models (SVM, LSTM, XLM-R)
# - Evaluation metrics
# DO NOT change without updating all downstream components

# Label to numeric code
EMOTION_LABEL_TO_CODE = {
    "Happy": 1,
    "Sad": 2,
    "Anger": 3,
    "Disgust": 4,
    "Fear": 5,
    "Sarcastic": 6,
}

# Numeric code to label (reverse mapping)
EMOTION_CODE_TO_LABEL = {v: k for k, v in EMOTION_LABEL_TO_CODE.items()}

# Set of valid emotion codes
VALID_EMOTION_CODES = set(EMOTION_LABEL_TO_CODE.values())

# Set of valid emotion labels
VALID_EMOTION_LABELS = set(EMOTION_LABEL_TO_CODE.keys())

# Standard fixed order for metrics, tables, and confusion matrices (1 to 6)
ORDERED_EMOTION_LABELS = ["Happy", "Sad", "Anger", "Disgust", "Fear", "Sarcastic"]
ORDERED_EMOTION_CODES = [1, 2, 3, 4, 5, 6]

# String representation of valid codes for error messages
VALID_CODES_STR = ", ".join(str(code) for code in sorted(VALID_EMOTION_CODES))

# ==============================================================================
# INVALID EMOTION VALUES (Explicitly rejected)
# ==============================================================================
# These are common incorrect values that should be rejected:
INVALID_EMOTION_VALUES = {
    0, 7, 8, 9, 10,  # Out-of-range numeric codes
    "Positive", "Negative", "Neutral",  # Incorrect categorical labels
    "Angry", "Envy", "Surprise", "Disgust_explicit",  # Misnamed labels
    "Happy_positive", "Sad_negative",  # Over-qualified labels
}

# ==============================================================================
# REQUIRED DATASET COLUMNS
# ==============================================================================
# These columns MUST exist in the loaded dataset
REQUIRED_COLUMNS = {
    "review_id",
    "raw_review",
    "emotion_code",
}

# These columns are strongly recommended but may be empty
RECOMMENDED_COLUMNS = {
    "emotion",
    "evaluator_notes",
}

# ==============================================================================
# PREPROCESSING CONFIGURATION
# ==============================================================================
# Controls how preprocessing is applied during dataset loading

# Heavy preprocessing: full normalization
PREPROCESSING_HEAVY_CONFIG = {
    "lowercase": True,
    "normalize_emoticons_flag": True,
    "preserve_emojis": False,
}

# Light preprocessing: minimal normalization (preserve more original form)
PREPROCESSING_LIGHT_CONFIG = {
    "lowercase": False,
    "normalize_emoticons_flag": False,
    "preserve_emojis": True,
}

# ==============================================================================
# DATASET VALIDATION THRESHOLDS
# ==============================================================================

# Maximum allowed proportion of missing values per column (0.0 = none, 1.0 = all)
MAX_MISSING_PROPORTION = 0.1  # 10% tolerance

# Minimum number of reviews per class for balanced dataset warning
MIN_REVIEWS_PER_CLASS = 50

# Similarity threshold for near-duplicate detection (0.0 to 1.0)
# Higher = more strict (more similar required to flag)
DUPLICATE_SIMILARITY_THRESHOLD = 0.85

# ==============================================================================
# FILE PATHS & DEFAULTS
# ==============================================================================

# Default fixture location
DEFAULT_FIXTURE_PATH = "data/development_fixture.csv"

# Expected annotation template location
ANNOTATION_TEMPLATE_PATH = "data/annotation_template.csv"

# Default model artifacts directory
DEFAULT_MODEL_DIR = "models"
DEFAULT_SVM_MODEL_PATH = "models/svm_model.joblib"
DEFAULT_LSTM_MODEL_PATH = "models/lstm_model.pt"
DEFAULT_XLMR_MODEL_PATH = "models/xlmr_model"
DEFAULT_XLMR_MODEL_NAME = "xlm-roberta-base"

# ==============================================================================
# SVM & TF-IDF CONFIGURATION DEFAULTS
# ==============================================================================
# Default TF-IDF vectorization settings
DEFAULT_TFIDF_CONFIG = {
    "feature_type": "both",       # "word", "char", or "both"
    "word_ngram_range": (1, 2),   # Word unigrams and bigrams
    "char_ngram_range": (2, 5),   # Character n-grams from 2 to 5 chars
    "min_df": 1,                  # Minimum document frequency
    "max_features_word": None,    # Max word features (None = unlimited)
    "max_features_char": None,    # Max char features (None = unlimited)
    "sublinear_tf": True,         # Apply sublinear scaling: 1 + log(tf)
}

# Default Linear SVM classifier settings
DEFAULT_SVM_CONFIG = {
    "c_param": 1.0,               # Regularization parameter C
    "loss": "squared_hinge",      # Standard SVM loss
    "penalty": "l2",              # L2 regularization
    "dual": "auto",               # Automatically select dual or primal
    "class_weight": None,         # Default unweighted, configurable for imbalance
    "random_state": 42,           # Reproducibility seed
    "max_iter": 2000,             # Max iterations for solver convergence
    "tol": 1e-4,                  # Tolerance for stopping criterion
}

# ==============================================================================
# LSTM CONFIGURATION DEFAULTS
# ==============================================================================
DEFAULT_LSTM_CONFIG = {
    "vocab_size": 5000,           # Maximum vocabulary size
    "max_sequence_length": 64,    # Sequence truncation/padding length
    "embedding_dim": 64,          # Word embedding vector dimension
    "hidden_units": 64,           # LSTM hidden state dimension
    "num_layers": 1,              # Number of stacked LSTM layers
    "bidirectional": False,       # Unidirectional or bidirectional LSTM
    "dropout": 0.2,               # Dropout rate
    "learning_rate": 0.001,       # Optimizer learning rate
    "batch_size": 16,             # Training batch size
    "epochs": 10,                 # Training epochs (smoke/default)
    "class_weight": None,         # Class weighting strategy ('balanced', dict, or None)
    "random_state": 42,           # Deterministic initialization seed
}

# ==============================================================================
# XLM-RoBERTa CONFIGURATION DEFAULTS
# ==============================================================================
DEFAULT_XLMR_CONFIG = {
    "model_name": "xlm-roberta-base",  # Pretrained Hugging Face model identifier
    "max_sequence_length": 128,        # Max sequence token length
    "learning_rate": 2e-5,             # Fine-tuning learning rate (AdamW)
    "weight_decay": 0.01,              # L2 weight decay
    "batch_size": 8,                   # Batch size for fine-tuning
    "epochs": 3,                       # Default epochs
    "warmup_ratio": 0.1,               # Warmup schedule ratio
    "class_weight": None,              # Class weighting ('balanced', dict, or None)
    "random_state": 42,                # Deterministic random seed
}

# ==============================================================================
# UTILITY FUNCTIONS
# ==============================================================================

def is_valid_emotion_code(code):
    """Check if a value is a valid emotion code."""
    return code in VALID_EMOTION_CODES


def is_valid_emotion_label(label):
    """Check if a value is a valid emotion label."""
    return label in VALID_EMOTION_LABELS


def get_emotion_label(code):
    """Get emotion label from code. Returns None if invalid."""
    return EMOTION_CODE_TO_LABEL.get(code)


def get_emotion_code(label):
    """Get emotion code from label. Returns None if invalid."""
    return EMOTION_LABEL_TO_CODE.get(label)


def normalize_emotion_code(value):
    """
    Normalize emotion code value.
    
    Handles:
    - String to int conversion ("1" → 1)
    - Label to code conversion ("Happy" → 1)
    - Invalid values → None
    """
    if value is None or value == "":
        return None
    
    # Try to convert string to int
    if isinstance(value, str):
        # Check if it's already a label
        if value in EMOTION_LABEL_TO_CODE:
            return EMOTION_LABEL_TO_CODE[value]
        
        # Try to parse as integer
        try:
            value = int(value)
        except (ValueError, TypeError):
            return None
    
    # Validate numeric code
    if isinstance(value, (int, float)):
        code = int(value)
        if is_valid_emotion_code(code):
            return code
    
    return None


if __name__ == "__main__":
    print("VoxReview NLP Configuration")
    print("=" * 60)
    print("\nEmotion Label to Code Mapping:")
    for label, code in sorted(EMOTION_LABEL_TO_CODE.items()):
        print(f"  {label:12} → {code}")
    print("\nValid Codes:", VALID_CODES_STR)
    print("\nRequired Columns:", ", ".join(sorted(REQUIRED_COLUMNS)))
    print("Recommended Columns:", ", ".join(sorted(RECOMMENDED_COLUMNS)))
