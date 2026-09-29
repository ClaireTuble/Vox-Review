"""Integer Category prediction for the trained VoxReview Linear SVM."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from config import PREPROCESSING_HEAVY_CONFIG
from preprocessing.preprocess import normalize_unicode, preprocess_review, remove_html, remove_urls
from svm_pipeline import load_svm_model


MODEL_PATH = Path(__file__).parent / "models" / "svm_model.joblib"
VALID_CATEGORIES = {1, 2, 3, 4, 5, 6}
EXPLANATION_STOPWORDS = ENGLISH_STOP_WORDS | {
    "ako", "ang", "at", "ba", "dahil", "daw", "din", "dito", "doon", "ikaw",
    "kami", "kanila", "kayo", "ko", "kundi", "lang", "mo", "mga", "na", "naman",
    "ni", "ng", "nila", "nito", "nya", "pa", "pero", "po", "rin", "sa", "si",
    "sila", "sya", "tayo", "ito", "iyon", "yung", "really", "super",
}
GENERAL_ACTION_VERBS = {
    "arrive", "arrived", "arrives", "arriving", "bought", "buy", "buying", "buys",
    "came", "come", "comes", "coming", "deliver", "delivered", "delivers", "delivering",
    "download", "downloaded", "downloading", "downloads", "get", "gets", "getting", "got",
    "install", "installed", "installing", "installs", "make", "made", "makes", "making",
    "open", "opened", "opening", "opens", "play", "played", "playing", "plays",
    "purchase", "purchased", "purchases", "purchasing", "receive", "received", "receives",
    "receiving", "run", "ran", "running", "runs", "send", "sent", "sends", "sending",
    "ship", "shipped", "shipping", "ships", "use", "used", "uses", "using", "work",
    "worked", "working", "works", "binili", "bumili", "dumating", "ginamit", "gumamit",
    "nagdownload", "naglaro", "naglalaro", "nabili", "natanggap", "nilaro", "tinanggap",
}
GENERIC_DOMAIN_WORDS = {
    "app", "apps", "game", "games", "item", "items", "order", "orders", "product",
    "products", "purchase", "purchases", "review", "reviews", "seller", "shipping", "size", "store",
}
URL_PATTERN = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
SOURCE_TOKEN_PATTERN = re.compile(r"(?u)\b\w\w+\b")


def _is_readable_feature(feature: str) -> bool:
    tokens = feature.split()
    if not tokens or len(tokens) > 2:
        return False
    if any(not token.isalpha() for token in tokens):
        return False
    if any(token in EXPLANATION_STOPWORDS or token in GENERAL_ACTION_VERBS for token in tokens):
        return False
    if len(tokens) == 1 and tokens[0] in GENERIC_DOMAIN_WORDS:
        return False
    return not all(token in GENERIC_DOMAIN_WORDS for token in tokens)


def _source_feature_surfaces(review_text: str, word_vectorizer: Any) -> dict[str, str]:
    source = normalize_unicode(remove_urls(remove_html(review_text)))
    matches = list(SOURCE_TOKEN_PATTERN.finditer(source))
    surfaces: dict[str, str] = {}

    for index, match in enumerate(matches):
        token = match.group()
        surfaces.setdefault(token.lower(), token)
        if index:
            previous = matches[index - 1].group()
            feature = f"{previous.lower()} {token.lower()}"
            surfaces.setdefault(feature, f"{previous} {token}")

    analyzer = word_vectorizer.build_analyzer()
    vectorizer_features = set(analyzer(source))
    return {feature: surface for feature, surface in surfaces.items() if feature in vectorizer_features}


def _word_vectorizer_layout(feature_extractor: Any) -> tuple[Any, int]:
    transformers = getattr(feature_extractor, "transformer_list", None)
    if transformers is None:
        return feature_extractor, 0

    offset = 0
    for name, transformer in transformers:
        if name == "word_tfidf" or getattr(transformer, "analyzer", None) == "word":
            return transformer, offset
        offset += len(transformer.get_feature_names_out())
    raise ValueError("The fitted SVM pipeline has no word TF-IDF branch")


def _emotion_drivers(
    review_text: str,
    processed_review: str,
    category: int,
    model: Any,
) -> list[str]:
    feature_extractor = model.named_steps["tfidf"]
    classifier = model.named_steps["clf"]
    word_vectorizer, word_offset = _word_vectorizer_layout(feature_extractor)
    feature_names = word_vectorizer.get_feature_names_out()
    source_surfaces = _source_feature_surfaces(review_text, word_vectorizer)
    if not source_surfaces:
        return []

    feature_matrix = feature_extractor.transform([processed_review])
    class_scores = np.asarray(classifier.decision_function(feature_matrix))[0]
    classes = np.asarray(classifier.classes_)
    predicted_index = int(np.flatnonzero(classes == category)[0])
    competing_scores = class_scores.copy()
    competing_scores[predicted_index] = -np.inf
    competitor_index = int(np.argmax(competing_scores))
    contribution_weights = classifier.coef_[predicted_index] - classifier.coef_[competitor_index]

    row = feature_matrix.tocsr()
    scored_features = []
    for feature_index, value in zip(row.indices, row.data):
        word_index = feature_index - word_offset
        if not 0 <= word_index < len(feature_names):
            continue
        feature = str(feature_names[word_index])
        surface = source_surfaces.get(feature)
        if surface is None or not _is_readable_feature(feature):
            continue
        contribution = float(value * contribution_weights[feature_index])
        if contribution > 0:
            scored_features.append((contribution, feature, surface))

    scored_features.sort(key=lambda item: (-item[0], item[1]))
    return [surface for _, _, surface in scored_features[:5]]


def predict_category(review_text: str, model: Any = None) -> int:
    """Return the predicted Category code for one review text."""
    if not isinstance(review_text, str) or not review_text.strip():
        raise ValueError("review_text must be a non-empty string")

    fitted_model = model if model is not None else load_svm_model(MODEL_PATH)
    processed_review = preprocess_review(
        review_text,
        **PREPROCESSING_HEAVY_CONFIG,
    )
    category = int(fitted_model.predict([processed_review])[0])
    if category not in VALID_CATEGORIES:
        raise ValueError(f"Model returned an invalid Category: {category}")
    return category


def explain_category(
    review_text: str,
    model: Any = None,
) -> dict[str, Any]:
    """Return the unchanged SVM category and its strongest readable word evidence."""
    if not isinstance(review_text, str) or not review_text.strip():
        raise ValueError("review_text must be a non-empty string")

    fitted_model = model if model is not None else load_svm_model(MODEL_PATH)
    processed_review = preprocess_review(
        review_text,
        **PREPROCESSING_HEAVY_CONFIG,
    )
    category = int(fitted_model.predict([processed_review])[0])
    if category not in VALID_CATEGORIES:
        raise ValueError(f"Model returned an invalid Category: {category}")

    drivers = _emotion_drivers(review_text, processed_review, category, fitted_model)
    return {"category": category, "emotionDrivers": drivers}