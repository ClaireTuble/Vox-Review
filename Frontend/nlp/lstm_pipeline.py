"""
VoxReview NLP — Phase 3B: LSTM Emotion Classification Pipeline

This module implements a reusable multiclass LSTM neural network pipeline with
configurable tokenization, sequence preparation, embedding, and classification
for six-class emotion detection:
  1 = Happy
  2 = Sad
  3 = Anger
  4 = Disgust
  5 = Fear
  6 = Sarcastic

Integrates with Phase 1 preprocessing and Phase 2 dataset/label mapping infrastructure.
"""

from __future__ import annotations

import collections
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset as TorchDataset

from config import (
    DEFAULT_LSTM_CONFIG,
    DEFAULT_LSTM_MODEL_PATH,
    EMOTION_CODE_TO_LABEL,
    EMOTION_LABEL_TO_CODE,
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
# TOKENIZER AND SEQUENCE PREPARATION
# ==============================================================================

class LSTMTokenizer:
    """
    Deterministic word-level tokenizer with vocabulary management,
    sequence encoding, padding, and truncation support.
    """

    PAD_TOKEN = "<PAD>"
    UNK_TOKEN = "<UNK>"
    PAD_INDEX = 0
    UNK_INDEX = 1

    def __init__(
        self,
        max_vocab_size: int = 5000,
        min_freq: int = 1,
        max_sequence_length: int = 64,
    ):
        self.max_vocab_size = max_vocab_size
        self.min_freq = min_freq
        self.max_sequence_length = max_sequence_length
        self.word2idx: Dict[str, int] = {
            self.PAD_TOKEN: self.PAD_INDEX,
            self.UNK_TOKEN: self.UNK_INDEX,
        }
        self.idx2word: Dict[int, str] = {
            self.PAD_INDEX: self.PAD_TOKEN,
            self.UNK_INDEX: self.UNK_TOKEN,
        }
        self.word_counts: collections.Counter = collections.Counter()
        self.is_fitted: bool = False

    def tokenize_text(self, text: str) -> List[str]:
        """Split preprocessed text into whitespace-delimited tokens."""
        if not text or not isinstance(text, str):
            return []
        return text.strip().split()

    def fit(self, texts: List[str]) -> "LSTMTokenizer":
        """
        Build vocabulary from a list of preprocessed text strings.
        """
        self.word_counts = collections.Counter()
        for text in texts:
            tokens = self.tokenize_text(text)
            self.word_counts.update(tokens)

        # Filter by min_freq and limit to max_vocab_size
        sorted_words = [
            word for word, count in self.word_counts.most_common()
            if count >= self.min_freq and word not in (self.PAD_TOKEN, self.UNK_TOKEN)
        ]
        available_slots = self.max_vocab_size - 2
        vocab_words = sorted_words[:max(0, available_slots)]

        self.word2idx = {
            self.PAD_TOKEN: self.PAD_INDEX,
            self.UNK_TOKEN: self.UNK_INDEX,
        }
        self.idx2word = {
            self.PAD_INDEX: self.PAD_TOKEN,
            self.UNK_INDEX: self.UNK_TOKEN,
        }

        for idx, word in enumerate(vocab_words, start=2):
            self.word2idx[word] = idx
            self.idx2word[idx] = word

        self.is_fitted = True
        return self

    @property
    def vocab_size(self) -> int:
        """Total size of the vocabulary including special tokens."""
        return len(self.word2idx)

    def texts_to_sequences(self, texts: List[str]) -> List[List[int]]:
        """Convert a list of texts to lists of token integer IDs."""
        sequences = []
        for text in texts:
            tokens = self.tokenize_text(text)
            seq = [self.word2idx.get(token, self.UNK_INDEX) for token in tokens]
            sequences.append(seq)
        return sequences

    def pad_sequences(
        self,
        sequences: List[List[int]],
        max_len: Optional[int] = None,
        padding: str = "post",
        truncating: str = "post",
    ) -> np.ndarray:
        """
        Pad and/or truncate integer sequences to fixed length.

        Returns:
            np.ndarray of shape (len(sequences), max_len) with dtype np.int64
        """
        target_len = max_len if max_len is not None else self.max_sequence_length
        num_samples = len(sequences)
        padded = np.full((num_samples, target_len), self.PAD_INDEX, dtype=np.int64)

        for i, seq in enumerate(sequences):
            if not seq:
                continue

            # Truncate if longer than target_len
            if len(seq) > target_len:
                if truncating == "post":
                    trunc_seq = seq[:target_len]
                else:
                    trunc_seq = seq[-target_len:]
            else:
                trunc_seq = seq

            # Pad into matrix
            if padding == "post":
                padded[i, :len(trunc_seq)] = trunc_seq
            else:
                padded[i, -len(trunc_seq):] = trunc_seq

        return padded

    def transform(self, texts: List[str]) -> np.ndarray:
        """Transform texts directly to padded sequence array."""
        sequences = self.texts_to_sequences(texts)
        return self.pad_sequences(sequences, max_len=self.max_sequence_length)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize tokenizer state to dictionary."""
        return {
            "max_vocab_size": self.max_vocab_size,
            "min_freq": self.min_freq,
            "max_sequence_length": self.max_sequence_length,
            "word2idx": self.word2idx,
            "is_fitted": self.is_fitted,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LSTMTokenizer":
        """Deserialize tokenizer from dictionary."""
        tok = cls(
            max_vocab_size=data.get("max_vocab_size", 5000),
            min_freq=data.get("min_freq", 1),
            max_sequence_length=data.get("max_sequence_length", 64),
        )
        tok.word2idx = data.get("word2idx", {})
        tok.idx2word = {v: k for k, v in tok.word2idx.items()}
        tok.is_fitted = data.get("is_fitted", True)
        return tok


# ==============================================================================
# PYTORCH DATASET HELPER
# ==============================================================================

class TextClassificationDataset(TorchDataset):
    """PyTorch Dataset wrapper for sequence arrays and emotion labels."""

    def __init__(self, sequences: np.ndarray, labels: Optional[List[int]] = None):
        self.sequences = torch.tensor(sequences, dtype=torch.long)
        if labels is not None:
            # Internal conversion: project 1-based labels (1..6) to 0-based targets (0..5)
            zero_based = [int(l) - 1 for l in labels]
            self.labels = torch.tensor(zero_based, dtype=torch.long)
        else:
            self.labels = None

    def __len__(self) -> int:
        return len(self.sequences)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, ...]:
        if self.labels is not None:
            return self.sequences[idx], self.labels[idx]
        return (self.sequences[idx],)


# ==============================================================================
# LSTM NEURAL NETWORK ARCHITECTURE
# ==============================================================================

class EmotionLSTM(nn.Module):
    """
    Standard modular LSTM classifier for 6-class emotion classification.

    Architecture:
    Input Sequence -> Embedding (with padding_idx=0) -> LSTM -> Dropout -> Dense -> 6 Classes
    """

    def __init__(
        self,
        vocab_size: int,
        embedding_dim: int = 64,
        hidden_units: int = 64,
        num_layers: int = 1,
        num_classes: int = 6,
        bidirectional: bool = False,
        dropout: float = 0.2,
        padding_idx: int = 0,
    ):
        super().__init__()
        self.vocab_size = vocab_size
        self.embedding_dim = embedding_dim
        self.hidden_units = hidden_units
        self.num_layers = num_layers
        self.num_classes = num_classes
        self.bidirectional = bidirectional
        self.dropout_rate = dropout

        # Embedding layer
        self.embedding = nn.Embedding(
            num_embeddings=vocab_size,
            embedding_dim=embedding_dim,
            padding_idx=padding_idx,
        )

        # LSTM Layer
        lstm_dropout = dropout if num_layers > 1 else 0.0
        self.lstm = nn.LSTM(
            input_size=embedding_dim,
            hidden_size=hidden_units,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=bidirectional,
            dropout=lstm_dropout,
        )

        # Output projection
        fc_input_dim = hidden_units * (2 if bidirectional else 1)
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(fc_input_dim, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.
        Args:
            x: Tensor of shape (batch_size, sequence_length) with token IDs.
        Returns:
            logits: Tensor of shape (batch_size, num_classes)
        """
        # (batch_size, seq_len, embed_dim)
        embedded = self.embedding(x)

        # lstm_out: (batch_size, seq_len, num_directions * hidden_units)
        # hn: (num_layers * num_directions, batch_size, hidden_units)
        _, (hn, _) = self.lstm(embedded)

        if self.bidirectional:
            # Concatenate top-layer forward and backward hidden states
            forward_h = hn[-2, :, :]
            backward_h = hn[-1, :, :]
            feat = torch.cat((forward_h, backward_h), dim=1)
        else:
            feat = hn[-1, :, :]

        dropped = self.dropout(feat)
        logits = self.fc(dropped)
        return logits


# ==============================================================================
# PIPELINE WRAPPER (CLASSIFIER BUNDLE)
# ==============================================================================

class LSTMEmotionClassifier:
    """
    Self-contained LSTM classification pipeline bundling the neural network model,
    tokenizer, hyperparameters, label mappings, and inference methods.
    """

    def __init__(
        self,
        model: EmotionLSTM,
        tokenizer: LSTMTokenizer,
        config: Dict[str, Any],
        device: Optional[torch.device] = None,
    ):
        self.model = model
        self.tokenizer = tokenizer
        self.config = config
        self.device = device or torch.device("cpu")
        self.model.to(self.device)

    def predict_proba(
        self,
        texts: Union[str, List[str]],
        preprocess: bool = True,
    ) -> np.ndarray:
        """
        Compute softmax probability distribution over 6 emotion classes.

        Returns:
            np.ndarray of shape (N, 6)
        """
        if isinstance(texts, str) or texts is None:
            raw_items = [texts]
        else:
            raw_items = list(texts)

        # Preprocess safely
        processed_texts = []
        for item in raw_items:
            if preprocess:
                if item is None or not str(item).strip():
                    p = ""
                else:
                    p = preprocess_review(str(item).strip(), **PREPROCESSING_HEAVY_CONFIG)
            else:
                p = "" if item is None else str(item)
            processed_texts.append(p)

        # Transform to padded sequences
        sequences = self.tokenizer.transform(processed_texts)
        seq_tensor = torch.tensor(sequences, dtype=torch.long, device=self.device)

        self.model.eval()
        with torch.no_grad():
            logits = self.model(seq_tensor)
            probs = torch.softmax(logits, dim=1).cpu().numpy()

        return probs

    def predict(
        self,
        texts: Union[str, List[str]],
        preprocess: bool = True,
        return_probabilities: bool = False,
    ) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Predict emotion labels and codes.

        Returns:
            Dict or List of Dicts formatted as:
            {
                "emotion": "Anger",
                "emotion_code": 3
            }
        """
        is_single = isinstance(texts, str) or texts is None
        probs = self.predict_proba(texts, preprocess=preprocess)

        # 0-indexed argmax mapped back to 1-based codes (1..6)
        pred_indices = np.argmax(probs, axis=1)
        results: List[Dict[str, Any]] = []

        for idx, pred_idx in enumerate(pred_indices):
            code = int(pred_idx) + 1  # 0->1, 1->2, ..., 5->6
            label = EMOTION_CODE_TO_LABEL.get(code, "Unknown")
            res: Dict[str, Any] = {
                "emotion": label,
                "emotion_code": code,
            }
            if return_probabilities:
                res["probabilities"] = {
                    EMOTION_CODE_TO_LABEL[c]: float(probs[idx, c - 1])
                    for c in range(1, 7)
                }
                res["confidence"] = float(probs[idx, pred_idx])
            results.append(res)

        if is_single:
            return results[0]
        return results


# ==============================================================================
# DATA EXTRACTION HELPER
# ==============================================================================

def _extract_texts_and_labels(
    dataset_input: Union[Dataset, str, Path, List[Review], List[Dict[str, Any]], Tuple[List[str], List[int]]],
    use_heavy_preprocessing: bool = True,
) -> Tuple[List[str], List[int]]:
    """
    Extract normalized review texts and emotion codes from various dataset inputs.
    """
    texts: List[str] = []
    labels: List[int] = []

    # CSV File
    if isinstance(dataset_input, (str, Path)):
        loader = DatasetLoader(validate=True, apply_preprocessing=True)
        dataset_obj, _ = loader.load(str(dataset_input))
        return _extract_texts_and_labels(dataset_obj, use_heavy_preprocessing=use_heavy_preprocessing)

    # Dataset Object
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

    # List of Reviews or Dicts
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

    # Tuple of (texts, labels)
    if isinstance(dataset_input, tuple) and len(dataset_input) == 2:
        raw_texts, raw_labels = dataset_input
        if len(raw_texts) != len(raw_labels):
            raise ValueError(f"Mismatch: {len(raw_texts)} texts vs {len(raw_labels)} labels")
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
# CLASS WEIGHT COMPUTATION HELPER
# ==============================================================================

def _calculate_class_weights(
    labels: List[int],
    num_classes: int = 6,
    class_weight_strategy: Optional[Union[str, Dict[int, float]]] = None,
) -> Optional[torch.Tensor]:
    """
    Calculate PyTorch loss class weights for handling class imbalance.
    """
    if class_weight_strategy is None:
        return None

    if isinstance(class_weight_strategy, dict):
        # Explicit weights mapping code (1..6) to weight float
        weights = [float(class_weight_strategy.get(c, 1.0)) for c in range(1, num_classes + 1)]
        return torch.tensor(weights, dtype=torch.float)

    if class_weight_strategy == "balanced":
        # Scikit-learn balanced formula: n_samples / (n_classes * count_per_class)
        zero_indexed_labels = [l - 1 for l in labels]
        counts = np.bincount(zero_indexed_labels, minlength=num_classes)
        total_samples = len(labels)
        weights = np.zeros(num_classes, dtype=np.float32)
        for c in range(num_classes):
            if counts[c] > 0:
                weights[c] = total_samples / (num_classes * counts[c])
            else:
                weights[c] = 1.0
        return torch.tensor(weights, dtype=torch.float)

    raise ValueError(f"Unsupported class_weight strategy: {class_weight_strategy}")


# ==============================================================================
# TRAINING INTERFACE
# ==============================================================================

def train_lstm(
    dataset: Union[Dataset, str, Path, List[Review], List[Dict[str, Any]], Tuple[List[str], List[int]]],
    *,
    vocab_size: int = DEFAULT_LSTM_CONFIG["vocab_size"],
    max_sequence_length: int = DEFAULT_LSTM_CONFIG["max_sequence_length"],
    embedding_dim: int = DEFAULT_LSTM_CONFIG["embedding_dim"],
    hidden_units: int = DEFAULT_LSTM_CONFIG["hidden_units"],
    num_layers: int = DEFAULT_LSTM_CONFIG["num_layers"],
    bidirectional: bool = DEFAULT_LSTM_CONFIG["bidirectional"],
    dropout: float = DEFAULT_LSTM_CONFIG["dropout"],
    learning_rate: float = DEFAULT_LSTM_CONFIG["learning_rate"],
    batch_size: int = DEFAULT_LSTM_CONFIG["batch_size"],
    epochs: int = DEFAULT_LSTM_CONFIG["epochs"],
    class_weight: Optional[Union[str, Dict[int, float]]] = DEFAULT_LSTM_CONFIG["class_weight"],
    random_state: int = DEFAULT_LSTM_CONFIG["random_state"],
    use_heavy_preprocessing: bool = True,
    device: Optional[Union[str, torch.device]] = None,
) -> LSTMEmotionClassifier:
    """
    Train an LSTM emotion classification model on the provided dataset.

    Requirements met:
    - Accepts validated dataset or path
    - Uses existing heavy preprocessing
    - Deterministic tokenization and sequence generation
    - Encodes labels consistently (1..6 public, 0..5 internal)
    - Supports configurable architecture, hyperparameters, and class weighting
    - Returns fitted LSTMEmotionClassifier bundle

    Args:
        dataset: Dataset object, CSV path, list of Review items, or (texts, labels) tuple
        vocab_size: Maximum vocabulary size
        max_sequence_length: Maximum sequence length
        embedding_dim: Word embedding dimension
        hidden_units: LSTM hidden state size
        num_layers: Number of LSTM layers
        bidirectional: Whether to use bidirectional LSTM
        dropout: Dropout probability
        learning_rate: Optimizer learning rate
        batch_size: Batch size
        epochs: Number of training epochs
        class_weight: Class weighting strategy (None, 'balanced', or dict)
        random_state: Random seed for reproducibility
        use_heavy_preprocessing: Whether to apply heavy normalization
        device: Compute device ('cpu', 'cuda', or torch.device)

    Returns:
        Fitted LSTMEmotionClassifier instance
    """
    # Set reproducibility seeds
    torch.manual_seed(random_state)
    np.random.seed(random_state)

    # Set device
    if device is None:
        selected_device = torch.device("cpu")
    elif isinstance(device, str):
        selected_device = torch.device(device)
    else:
        selected_device = device

    # Extract texts and labels
    texts, labels = _extract_texts_and_labels(
        dataset, use_heavy_preprocessing=use_heavy_preprocessing
    )

    if not texts or not labels:
        raise ValueError("Cannot train LSTM: extracted 0 valid training samples.")

    # Build and fit tokenizer
    tokenizer = LSTMTokenizer(
        max_vocab_size=vocab_size,
        max_sequence_length=max_sequence_length,
    )
    tokenizer.fit(texts)

    # Encode sequences and labels
    padded_sequences = tokenizer.transform(texts)
    torch_dataset = TextClassificationDataset(padded_sequences, labels)
    dataloader = DataLoader(torch_dataset, batch_size=batch_size, shuffle=True)

    # Instantiate LSTM model
    actual_vocab_size = max(tokenizer.vocab_size, 2)
    model = EmotionLSTM(
        vocab_size=actual_vocab_size,
        embedding_dim=embedding_dim,
        hidden_units=hidden_units,
        num_layers=num_layers,
        num_classes=6,
        bidirectional=bidirectional,
        dropout=dropout,
        padding_idx=LSTMTokenizer.PAD_INDEX,
    )
    model.to(selected_device)

    # Loss and optimizer setup
    class_weights_tensor = _calculate_class_weights(
        labels, num_classes=6, class_weight_strategy=class_weight
    )
    if class_weights_tensor is not None:
        class_weights_tensor = class_weights_tensor.to(selected_device)

    criterion = nn.CrossEntropyLoss(weight=class_weights_tensor)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)

    # Training loop
    model.train()
    for epoch in range(epochs):
        for batch_seqs, batch_labels in dataloader:
            batch_seqs = batch_seqs.to(selected_device)
            batch_labels = batch_labels.to(selected_device)

            optimizer.zero_grad()
            outputs = model(batch_seqs)
            loss = criterion(outputs, batch_labels)
            loss.backward()
            optimizer.step()

    model.eval()

    config_record = {
        "vocab_size": actual_vocab_size,
        "max_sequence_length": max_sequence_length,
        "embedding_dim": embedding_dim,
        "hidden_units": hidden_units,
        "num_layers": num_layers,
        "bidirectional": bidirectional,
        "dropout": dropout,
        "learning_rate": learning_rate,
        "batch_size": batch_size,
        "epochs": epochs,
        "class_weight": class_weight,
        "random_state": random_state,
        "num_classes": 6,
    }

    return LSTMEmotionClassifier(
        model=model,
        tokenizer=tokenizer,
        config=config_record,
        device=selected_device,
    )


# ==============================================================================
# PREDICTION INTERFACE
# ==============================================================================

def predict_lstm(
    model_or_classifier: Union[LSTMEmotionClassifier, EmotionLSTM],
    tokenizer_or_text: Union[LSTMTokenizer, str, List[str], Any],
    text_if_tokenizer_provided: Optional[Union[str, List[str], Any]] = None,
    *,
    preprocess: bool = True,
    return_probabilities: bool = False,
) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Predict emotion using a fitted LSTM model.

    Supports both invocation styles:
      1) predict_lstm(classifier, text)
      2) predict_lstm(model, tokenizer, text)

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

    Args:
        model_or_classifier: LSTMEmotionClassifier wrapper or raw EmotionLSTM model
        tokenizer_or_text: LSTMTokenizer instance (if raw model passed) or input text
        text_if_tokenizer_provided: Text if (model, tokenizer, text) was provided
        preprocess: Whether to apply heavy Taglish preprocessing
        return_probabilities: Whether to include defensible softmax probabilities

    Returns:
        Dictionary or list of dictionaries containing emotion and emotion_code
    """
    if isinstance(model_or_classifier, LSTMEmotionClassifier):
        target_text = tokenizer_or_text
        return model_or_classifier.predict(
            target_text,
            preprocess=preprocess,
            return_probabilities=return_probabilities,
        )

    # Style 2: Raw model + tokenizer + text
    raw_model = model_or_classifier
    tokenizer = tokenizer_or_text
    target_text = text_if_tokenizer_provided

    if not isinstance(tokenizer, LSTMTokenizer):
        raise TypeError("When passing raw model, second argument must be an LSTMTokenizer instance.")

    classifier = LSTMEmotionClassifier(
        model=raw_model,
        tokenizer=tokenizer,
        config={},
    )
    return classifier.predict(
        target_text,
        preprocess=preprocess,
        return_probabilities=return_probabilities,
    )


# ==============================================================================
# MODEL SAVE / LOAD
# ==============================================================================

def save_lstm_model(
    classifier: LSTMEmotionClassifier,
    filepath: Optional[Union[str, Path]] = None,
) -> Path:
    """
    Save the trained LSTM model weights, tokenizer, config, and label mapping.

    Args:
        classifier: Fitted LSTMEmotionClassifier instance
        filepath: Target file path (default: relative 'models/lstm_model.pt')

    Returns:
        Path object of the saved model
    """
    if not isinstance(classifier, LSTMEmotionClassifier):
        raise TypeError("classifier must be an instance of LSTMEmotionClassifier")

    if filepath is None:
        base_dir = Path(__file__).parent
        target_path = base_dir / DEFAULT_LSTM_MODEL_PATH
    else:
        target_path = Path(filepath)

    target_path.parent.mkdir(parents=True, exist_ok=True)

    save_payload = {
        "model_state_dict": classifier.model.state_dict(),
        "tokenizer_data": classifier.tokenizer.to_dict(),
        "config": classifier.config,
        "label_mapping": {
            "EMOTION_LABEL_TO_CODE": EMOTION_LABEL_TO_CODE,
            "EMOTION_CODE_TO_LABEL": EMOTION_CODE_TO_LABEL,
        },
        "version": "1.0",
    }

    torch.save(save_payload, target_path)
    return target_path


def load_lstm_model(
    filepath: Optional[Union[str, Path]] = None,
    device: Optional[Union[str, torch.device]] = None,
) -> LSTMEmotionClassifier:
    """
    Load a saved LSTM model bundle from disk.

    Args:
        filepath: Path to saved model file (default: relative 'models/lstm_model.pt')
        device: Target compute device ('cpu', 'cuda', etc.)

    Returns:
        Loaded LSTMEmotionClassifier ready for inference
    """
    if filepath is None:
        base_dir = Path(__file__).parent
        target_path = base_dir / DEFAULT_LSTM_MODEL_PATH
    else:
        target_path = Path(filepath)

    if not target_path.exists():
        raise FileNotFoundError(f"LSTM model file not found at: {target_path}")

    if device is None:
        selected_device = torch.device("cpu")
    elif isinstance(device, str):
        selected_device = torch.device(device)
    else:
        selected_device = device

    payload = torch.load(target_path, map_location=selected_device, weights_only=False)

    tokenizer_data = payload["tokenizer_data"]
    tokenizer = LSTMTokenizer.from_dict(tokenizer_data)

    config = payload["config"]
    model = EmotionLSTM(
        vocab_size=config.get("vocab_size", tokenizer.vocab_size),
        embedding_dim=config.get("embedding_dim", 64),
        hidden_units=config.get("hidden_units", 64),
        num_layers=config.get("num_layers", 1),
        num_classes=config.get("num_classes", 6),
        bidirectional=config.get("bidirectional", False),
        dropout=config.get("dropout", 0.2),
        padding_idx=LSTMTokenizer.PAD_INDEX,
    )
    model.load_state_dict(payload["model_state_dict"])
    model.to(selected_device)
    model.eval()

    return LSTMEmotionClassifier(
        model=model,
        tokenizer=tokenizer,
        config=config,
        device=selected_device,
    )
