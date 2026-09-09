"""
VoxReview NLP — Phase 3C: XLM-RoBERTa Emotion Classification Pipeline

This module implements a reusable multilingual Transformer text classification pipeline
using XLM-RoBERTa with light Taglish preprocessing for six-class emotion detection:
  1 = Happy
  2 = Sad
  3 = Anger
  4 = Disgust
  5 = Fear
  6 = Sarcastic

Integrates with Phase 1 preprocessing and Phase 2 dataset/label mapping infrastructure.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset as TorchDataset
from transformers import (
    AutoConfig,
    AutoModelForSequenceClassification,
    AutoTokenizer,
    PreTrainedModel,
    PreTrainedTokenizerBase,
    get_linear_schedule_with_warmup,
    set_seed,
)

from config import (
    DEFAULT_XLMR_CONFIG,
    DEFAULT_XLMR_MODEL_NAME,
    DEFAULT_XLMR_MODEL_PATH,
    EMOTION_CODE_TO_LABEL,
    EMOTION_LABEL_TO_CODE,
    PREPROCESSING_LIGHT_CONFIG,
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
# CENTRALIZED ZERO-BASED LABEL MAPPING
# ==============================================================================
# Public/Project Mapping: 1=Happy, 2=Sad, 3=Anger, 4=Disgust, 5=Fear, 6=Sarcastic
# Internal Transformer Mapping: 0=Happy, 1=Sad, 2=Anger, 3=Disgust, 4=Fear, 5=Sarcastic

INTERNAL_ID_TO_LABEL: Dict[int, str] = {
    0: "Happy",
    1: "Sad",
    2: "Anger",
    3: "Disgust",
    4: "Fear",
    5: "Sarcastic",
}

INTERNAL_LABEL_TO_ID: Dict[str, int] = {v: k for k, v in INTERNAL_ID_TO_LABEL.items()}


def code_to_internal_id(emotion_code: int) -> int:
    """Convert 1-based project emotion code to 0-based internal Transformer class ID."""
    if not is_valid_emotion_code(emotion_code):
        raise ValueError(f"Invalid emotion code: {emotion_code}. Must be 1..6.")
    return int(emotion_code) - 1


def internal_id_to_code(internal_id: int) -> int:
    """Convert 0-based internal Transformer class ID to 1-based project emotion code."""
    code = int(internal_id) + 1
    if not is_valid_emotion_code(code):
        raise ValueError(f"Invalid internal ID: {internal_id}. Must map to 1..6.")
    return code


# ==============================================================================
# PYTORCH DATASET FOR TRANSFORMERS
# ==============================================================================

class TransformerTextDataset(TorchDataset):
    """PyTorch Dataset wrapper for tokenized Transformer inputs."""

    def __init__(
        self,
        encodings: Dict[str, torch.Tensor],
        labels: Optional[List[int]] = None,
    ):
        self.encodings = encodings
        if labels is not None:
            # Convert 1-based project codes (1..6) to 0-based internal IDs (0..5)
            zero_based_labels = [code_to_internal_id(l) for l in labels]
            self.labels = torch.tensor(zero_based_labels, dtype=torch.long)
        else:
            self.labels = None

    def __len__(self) -> int:
        return len(self.encodings["input_ids"])

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        item = {key: val[idx] for key, val in self.encodings.items()}
        if self.labels is not None:
            item["labels"] = self.labels[idx]
        return item


# ==============================================================================
# XLM-R PIPELINE CLASSIFIER BUNDLE
# ==============================================================================

class XLMRobertaEmotionClassifier:
    """
    Self-contained XLM-RoBERTa classification pipeline bundling the pretrained model,
    tokenizer, configuration, label mappings, and inference methods.
    """

    def __init__(
        self,
        model: PreTrainedModel,
        tokenizer: PreTrainedTokenizerBase,
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
        Compute softmax probability distribution over the 6 emotion classes.

        Returns:
            np.ndarray of shape (N, 6)
        """
        if isinstance(texts, str) or texts is None:
            raw_items = [texts]
        else:
            raw_items = list(texts)

        # Preprocess using light normalization
        processed_texts = []
        for item in raw_items:
            if preprocess:
                if item is None or not str(item).strip():
                    p = ""
                else:
                    p = preprocess_review(str(item).strip(), **PREPROCESSING_LIGHT_CONFIG)
            else:
                p = "" if item is None else str(item)
            processed_texts.append(p)

        max_len = self.config.get("max_sequence_length", 128)
        encoded = self.tokenizer(
            processed_texts,
            padding=True,
            truncation=True,
            max_length=max_len,
            return_tensors="pt",
        )

        encoded = {k: v.to(self.device) for k, v in encoded.items()}

        self.model.eval()
        with torch.no_grad():
            outputs = self.model(**encoded)
            logits = outputs.logits
            probs = torch.softmax(logits, dim=1).cpu().numpy()

        return probs

    def predict(
        self,
        texts: Union[str, List[str]],
        preprocess: bool = True,
        return_probabilities: bool = False,
    ) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Predict emotion labels and codes using fine-tuned XLM-RoBERTa.

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
            texts: Single review string or list of review strings
            preprocess: Whether to apply light Taglish preprocessing
            return_probabilities: Whether to include defensible softmax probabilities

        Returns:
            Dictionary or list of dictionaries containing emotion and emotion_code
        """
        is_single = isinstance(texts, str) or texts is None
        probs = self.predict_proba(texts, preprocess=preprocess)

        pred_indices = np.argmax(probs, axis=1)
        results: List[Dict[str, Any]] = []

        for idx, pred_idx in enumerate(pred_indices):
            code = internal_id_to_code(int(pred_idx))
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
    use_light_preprocessing: bool = True,
) -> Tuple[List[str], List[int]]:
    """
    Extract light-preprocessed review texts and emotion codes from dataset inputs.
    """
    texts: List[str] = []
    labels: List[int] = []

    # Case 1: CSV File Path
    if isinstance(dataset_input, (str, Path)):
        loader = DatasetLoader(validate=True, apply_preprocessing=True)
        dataset_obj, _ = loader.load(str(dataset_input))
        return _extract_texts_and_labels(dataset_obj, use_light_preprocessing=use_light_preprocessing)

    # Case 2: Dataset Object
    if isinstance(dataset_input, Dataset):
        for review in dataset_input.reviews:
            if not is_valid_emotion_code(review.emotion_code):
                continue
            if use_light_preprocessing:
                text = review.preprocessed_review_light
                if not text:
                    text = preprocess_review(review.raw_review, **PREPROCESSING_LIGHT_CONFIG)
            else:
                text = review.raw_review
            texts.append(text)
            labels.append(review.emotion_code)
        return texts, labels

    # Case 3: List of Reviews or Dicts
    if isinstance(dataset_input, list):
        for item in dataset_input:
            if isinstance(item, Review):
                if not is_valid_emotion_code(item.emotion_code):
                    continue
                if use_light_preprocessing:
                    text = item.preprocessed_review_light
                    if not text:
                        text = preprocess_review(item.raw_review, **PREPROCESSING_LIGHT_CONFIG)
                else:
                    text = item.raw_review
                texts.append(text)
                labels.append(item.emotion_code)
            elif isinstance(item, dict):
                code = item.get("emotion_code")
                if not is_valid_emotion_code(code):
                    continue
                raw_text = item.get("raw_review", item.get("text", ""))
                if use_light_preprocessing:
                    text = item.get("preprocessed_light") or preprocess_review(
                        raw_text, **PREPROCESSING_LIGHT_CONFIG
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
            raise ValueError(f"Mismatch: {len(raw_texts)} texts vs {len(raw_labels)} labels")
        for t, l in zip(raw_texts, raw_labels):
            if not is_valid_emotion_code(l):
                raise ValueError(f"Invalid emotion code: {l}. Must be one of {VALID_EMOTION_CODES}")
            if use_light_preprocessing:
                processed_t = preprocess_review(str(t), **PREPROCESSING_LIGHT_CONFIG)
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
    Calculate PyTorch loss class weights for handling class imbalance in XLM-R fine-tuning.
    """
    if class_weight_strategy is None:
        return None

    if isinstance(class_weight_strategy, dict):
        # Custom dictionary mapping emotion codes 1..6 to float weights
        weights = [float(class_weight_strategy.get(c, 1.0)) for c in range(1, num_classes + 1)]
        return torch.tensor(weights, dtype=torch.float)

    if class_weight_strategy == "balanced":
        zero_indexed_labels = [code_to_internal_id(l) for l in labels]
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

def train_xlmr(
    dataset: Union[Dataset, str, Path, List[Review], List[Dict[str, Any]], Tuple[List[str], List[int]]],
    *,
    model_name: str = DEFAULT_XLMR_CONFIG["model_name"],
    max_sequence_length: int = DEFAULT_XLMR_CONFIG["max_sequence_length"],
    learning_rate: float = DEFAULT_XLMR_CONFIG["learning_rate"],
    weight_decay: float = DEFAULT_XLMR_CONFIG["weight_decay"],
    batch_size: int = DEFAULT_XLMR_CONFIG["batch_size"],
    epochs: int = DEFAULT_XLMR_CONFIG["epochs"],
    warmup_ratio: float = DEFAULT_XLMR_CONFIG["warmup_ratio"],
    class_weight: Optional[Union[str, Dict[int, float]]] = DEFAULT_XLMR_CONFIG["class_weight"],
    random_state: int = DEFAULT_XLMR_CONFIG["random_state"],
    use_light_preprocessing: bool = True,
    device: Optional[Union[str, torch.device]] = None,
    pretrained_model_or_config: Optional[Union[PreTrainedModel, AutoConfig]] = None,
    tokenizer_instance: Optional[PreTrainedTokenizerBase] = None,
) -> XLMRobertaEmotionClassifier:
    """
    Fine-tune an XLM-RoBERTa multilingual model for 6-class emotion classification.

    Requirements met:
    - Accepts validated Phase 2 dataset or filepath
    - Uses light Taglish preprocessing
    - Tokenizes using official XLM-R tokenizer
    - Uses centralized 6-class emotion label mapping (1..6 public, 0..5 internal)
    - Supports configurable training hyperparameters (lr, epochs, batch_size, class_weights)
    - Fully CPU safe when GPU is unavailable
    - Independent of machine-specific absolute paths

    Args:
        dataset: Dataset object, CSV path, list of Reviews, or (texts, labels) tuple
        model_name: Hugging Face model identifier (default: 'xlm-roberta-base')
        max_sequence_length: Max sequence length for tokenizer
        learning_rate: Learning rate for AdamW optimizer
        weight_decay: Weight decay parameter
        batch_size: Batch size for training
        epochs: Number of training epochs
        warmup_ratio: Warmup ratio for linear schedule
        class_weight: Class weight strategy ('balanced', dict, or None)
        random_state: Random seed for reproducibility
        use_light_preprocessing: Apply light preprocessing to inputs
        device: Target compute device ('cpu', 'cuda', or None for auto)
        pretrained_model_or_config: Optional pre-instantiated model/config (useful for testing)
        tokenizer_instance: Optional pre-instantiated tokenizer (useful for testing)

    Returns:
        Fitted XLMRobertaEmotionClassifier bundle
    """
    # Deterministic seeding
    set_seed(random_state)
    torch.manual_seed(random_state)
    np.random.seed(random_state)

    # Device selection
    if device is None:
        selected_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    elif isinstance(device, str):
        selected_device = torch.device(device)
    else:
        selected_device = device

    # Extract texts and labels using light preprocessing
    texts, labels = _extract_texts_and_labels(
        dataset, use_light_preprocessing=use_light_preprocessing
    )

    if not texts or not labels:
        raise ValueError("Cannot train XLM-R: extracted 0 valid training samples.")

    # Initialize or use tokenizer
    if tokenizer_instance is not None:
        tokenizer = tokenizer_instance
    else:
        tokenizer = AutoTokenizer.from_pretrained(model_name)

    # Initialize or use model
    if isinstance(pretrained_model_or_config, PreTrainedModel):
        model = pretrained_model_or_config
    elif isinstance(pretrained_model_or_config, AutoConfig):
        pretrained_model_or_config.id2label = INTERNAL_ID_TO_LABEL
        pretrained_model_or_config.label2id = INTERNAL_LABEL_TO_ID
        pretrained_model_or_config.num_labels = 6
        model = AutoModelForSequenceClassification.from_config(pretrained_model_or_config)
    else:
        config = AutoConfig.from_pretrained(
            model_name,
            num_labels=6,
            id2label=INTERNAL_ID_TO_LABEL,
            label2id=INTERNAL_LABEL_TO_ID,
        )
        model = AutoModelForSequenceClassification.from_pretrained(
            model_name,
            config=config,
        )

    model.to(selected_device)

    # Tokenize dataset
    encodings = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=max_sequence_length,
        return_tensors="pt",
    )
    torch_dataset = TransformerTextDataset(encodings, labels)
    dataloader = DataLoader(torch_dataset, batch_size=batch_size, shuffle=True)

    # Loss criterion & Class weighting
    class_weights_tensor = _calculate_class_weights(
        labels, num_classes=6, class_weight_strategy=class_weight
    )
    if class_weights_tensor is not None:
        class_weights_tensor = class_weights_tensor.to(selected_device)
        loss_fn = nn.CrossEntropyLoss(weight=class_weights_tensor)
    else:
        loss_fn = nn.CrossEntropyLoss()

    # Optimizer and Scheduler
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)

    total_steps = max(len(dataloader) * epochs, 1)
    warmup_steps = int(total_steps * warmup_ratio)
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=warmup_steps, num_training_steps=total_steps
    )

    # Training Loop
    model.train()
    for epoch in range(epochs):
        for batch in dataloader:
            batch = {k: v.to(selected_device) for k, v in batch.items()}
            batch_labels = batch.pop("labels")

            optimizer.zero_grad()
            outputs = model(**batch)
            logits = outputs.logits
            loss = loss_fn(logits, batch_labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()

    model.eval()

    config_record = {
        "model_name": model_name,
        "max_sequence_length": max_sequence_length,
        "learning_rate": learning_rate,
        "weight_decay": weight_decay,
        "batch_size": batch_size,
        "epochs": epochs,
        "warmup_ratio": warmup_ratio,
        "class_weight": class_weight,
        "random_state": random_state,
        "num_classes": 6,
    }

    return XLMRobertaEmotionClassifier(
        model=model,
        tokenizer=tokenizer,
        config=config_record,
        device=selected_device,
    )


# ==============================================================================
# PREDICTION INTERFACE
# ==============================================================================

def predict_xlmr(
    model_or_classifier: Union[XLMRobertaEmotionClassifier, PreTrainedModel],
    tokenizer_or_text: Union[PreTrainedTokenizerBase, str, List[str], Any],
    text_if_tokenizer_provided: Optional[Union[str, List[str], Any]] = None,
    *,
    preprocess: bool = True,
    return_probabilities: bool = False,
) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Predict emotion using a fine-tuned XLM-RoBERTa model.

    Supports both invocation styles:
      1) predict_xlmr(classifier, text)
      2) predict_xlmr(model, tokenizer, text)

    Output format for single review:
        {
            "emotion": "Anger",
            "emotion_code": 3
        }

    Output format for list of N reviews:
        [
            {"emotion": "Happy", "emotion_code": 1},
            ...
        ]

    Args:
        model_or_classifier: XLMRobertaEmotionClassifier or PreTrainedModel
        tokenizer_or_text: PreTrainedTokenizerBase instance or input text
        text_if_tokenizer_provided: Text if (model, tokenizer, text) format was used
        preprocess: Whether to apply light Taglish preprocessing
        return_probabilities: Whether to compute and return true softmax probabilities

    Returns:
        Dictionary or list of dictionaries containing emotion and emotion_code
    """
    if isinstance(model_or_classifier, XLMRobertaEmotionClassifier):
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

    if not isinstance(tokenizer, PreTrainedTokenizerBase):
        raise TypeError("When passing raw model, second argument must be a PreTrainedTokenizer instance.")

    classifier = XLMRobertaEmotionClassifier(
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

def save_xlmr_model(
    classifier: XLMRobertaEmotionClassifier,
    directory_path: Optional[Union[str, Path]] = None,
) -> Path:
    """
    Save the fine-tuned XLM-RoBERTa model, tokenizer, and configuration to disk.

    Args:
        classifier: Fitted XLMRobertaEmotionClassifier instance
        directory_path: Target directory path (default: relative 'models/xlmr_model')

    Returns:
        Path object of the saved model directory
    """
    if not isinstance(classifier, XLMRobertaEmotionClassifier):
        raise TypeError("classifier must be an instance of XLMRobertaEmotionClassifier")

    if directory_path is None:
        base_dir = Path(__file__).parent
        target_dir = base_dir / DEFAULT_XLMR_MODEL_PATH
    else:
        target_dir = Path(directory_path)

    target_dir.mkdir(parents=True, exist_ok=True)

    # Save model and tokenizer using Hugging Face standard serialization
    classifier.model.save_pretrained(str(target_dir))
    classifier.tokenizer.save_pretrained(str(target_dir))

    # Save custom pipeline metadata & label mappings
    metadata = {
        "config": classifier.config,
        "label_mapping": {
            "EMOTION_LABEL_TO_CODE": EMOTION_LABEL_TO_CODE,
            "EMOTION_CODE_TO_LABEL": EMOTION_CODE_TO_LABEL,
            "INTERNAL_ID_TO_LABEL": INTERNAL_ID_TO_LABEL,
            "INTERNAL_LABEL_TO_ID": INTERNAL_LABEL_TO_ID,
        },
        "pipeline_version": "1.0",
    }
    with open(target_dir / "voxreview_xlmr_meta.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return target_dir


def load_xlmr_model(
    directory_path: Optional[Union[str, Path]] = None,
    device: Optional[Union[str, torch.device]] = None,
) -> XLMRobertaEmotionClassifier:
    """
    Load a saved fine-tuned XLM-RoBERTa model and tokenizer from disk.

    Args:
        directory_path: Directory where model was saved (default: relative 'models/xlmr_model')
        device: Target compute device ('cpu', 'cuda', etc.)

    Returns:
        Loaded XLMRobertaEmotionClassifier ready for inference
    """
    if directory_path is None:
        base_dir = Path(__file__).parent
        target_dir = base_dir / DEFAULT_XLMR_MODEL_PATH
    else:
        target_dir = Path(directory_path)

    if not target_dir.exists():
        raise FileNotFoundError(f"XLM-R model directory not found at: {target_dir}")

    if device is None:
        selected_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    elif isinstance(device, str):
        selected_device = torch.device(device)
    else:
        selected_device = device

    tokenizer = AutoTokenizer.from_pretrained(str(target_dir))
    model = AutoModelForSequenceClassification.from_pretrained(str(target_dir))
    model.to(selected_device)
    model.eval()

    # Load custom metadata if available
    meta_path = target_dir / "voxreview_xlmr_meta.json"
    config = {}
    if meta_path.exists():
        with open(meta_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
            config = metadata.get("config", {})

    return XLMRobertaEmotionClassifier(
        model=model,
        tokenizer=tokenizer,
        config=config,
        device=selected_device,
    )
