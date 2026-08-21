"""
VoxReview NLP preprocessing - Version 1

Purpose:
- Basic text cleanup
- Abbreviation normalization
- Excessive repeated-letter normalization
- Conservative number/letter substitution
- Conservative misspelling normalization
- Emoji/emoticon preservation
- Preserve Tagalog/English/Taglish code-switching

This is NOT emotion classification. Keep raw reviews separately.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Dict


# Start small. Expand only from patterns found in the real dataset.
ABBREVIATION_MAP = {
    "hnd": "hindi",
    "hndi": "hindi",
    "di": "hindi",
    "d": "hindi",
    "dko": "hindi ko",
    "ung": "yung",
    "lng": "lang",
    "nmn": "naman",
    "ok": "okay",
    "oks": "okay",
    "pls": "please",
    "plz": "please",
}

# Only convert recognized shorthand. Do NOT rewrite arbitrary numbers.
NUMBER_SUBSTITUTION_MAP: Dict[str, str] = {
    "gr8": "great",
    "l8r": "later",
    "b4": "before",
}

# Conservative starter dictionary; expand from the real dataset later.
MISSPELLING_MAP: Dict[str, str] = {
    "panget": "pangit",
    "magndaa": "maganda",
    "hndi": "hindi",
    "gud": "good",
}

# Text emoticons are converted to tokens; Unicode emojis are preserved.
EMOTICON_MAP: Dict[str, str] = {
    ":)": "<EMOJI_HAPPY>",
    ":-)": "<EMOJI_HAPPY>",
    ":(": "<EMOJI_SAD>",
    ":-(": "<EMOJI_SAD>",
    "<3": "<EMOJI_LOVE>",
    ":'(": "<EMOJI_SAD>",
}


def normalize_unicode(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def remove_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text)


def remove_urls(text: str) -> str:
    return re.sub(r"https?://\S+|www\.\S+", " ", text, flags=re.IGNORECASE)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def normalize_case(text: str) -> str:
    return text.lower()


def normalize_abbreviations(text: str) -> str:
    for short, full in sorted(ABBREVIATION_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = rf"(?<!\w){re.escape(short)}(?!\w)"
        text = re.sub(pattern, full, text, flags=re.IGNORECASE)
    return text


def normalize_number_substitutions(text: str) -> str:
    for short, full in sorted(NUMBER_SUBSTITUTION_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = rf"(?<!\w){re.escape(short)}(?!\w)"
        text = re.sub(pattern, full, text, flags=re.IGNORECASE)
    return text


def normalize_known_misspellings(text: str) -> str:
    for wrong, correct in sorted(MISSPELLING_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = rf"(?<!\w){re.escape(wrong)}(?!\w)"
        text = re.sub(pattern, correct, text, flags=re.IGNORECASE)
    return text


def reduce_repeated_letters(text: str) -> str:
    # Only reduce 3+ consecutive copies, so normal double letters are preserved.
    return re.sub(r"(.)\1{2,}", r"\1", text, flags=re.DOTALL)


def normalize_emoticons(text: str) -> str:
    for emoticon, token in sorted(EMOTICON_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        text = text.replace(emoticon, f" {token} ")
    return text


def preprocess_review(
    text: str,
    *,
    lowercase: bool = True,
    normalize_emoticons_flag: bool = True,
) -> str:
    """Apply the conservative Version 1 preprocessing pipeline."""
    if not isinstance(text, str):
        raise TypeError("text must be a string")

    processed = normalize_unicode(text)
    processed = remove_html(processed)
    processed = remove_urls(processed)

    if lowercase:
        processed = normalize_case(processed)

    processed = normalize_abbreviations(processed)
    processed = normalize_number_substitutions(processed)
    processed = normalize_known_misspellings(processed)
    processed = reduce_repeated_letters(processed)

    if normalize_emoticons_flag:
        processed = normalize_emoticons(processed)

    return normalize_whitespace(processed)


if __name__ == "__main__":
    test_reviews = [
        "SOBRANG GANDAAAA!!! hnd ko expect na ganito kaganda 😭❤️",
        "pangittttt ng quality, di ko bet :(",
        "super nice ng product pero medyo mahal",
        "gr8 product!!! sulittt",
        "okay naman, nothing special :)",
        "10/10, worth it talaga ❤️",
        "₱500 lang naman, good quality",
    ]

    for review in test_reviews:
        print("RAW:      ", review)
        print("PROCESSED:", preprocess_review(review))
        print("-" * 80)