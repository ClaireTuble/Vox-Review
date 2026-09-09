"""
VoxReview NLP preprocessing - FINAL VERSION

Pipeline Order:
1. Basic Cleaning (HTML, URLs, whitespace, Unicode normalization)
2. Preserve Taglish/Code-switching (design rule - NO automatic translation)
3. Custom Normalization:
   - Abbreviations
   - Repeated Letters
   - Misspellings
   - Number Substitutions
   - Emojis / Emoticons
   - Slang / Informal Words

Output:
- raw_review: unchanged original text
- preprocessed_review: text after full pipeline

This is NOT emotion classification. Preprocessing only prepares text for future ML models.
Final emotion classification (1=Happy, 2=Sad, 3=Anger, 4=Disgust, 5=Fear, 6=Sarcastic)
is performed by separate emotion classification models.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Dict


# ==============================================================================
# NORMALIZATION DICTIONARIES - Keep separate by category
# ==============================================================================

# 1. ABBREVIATIONS - Informal abbreviations requiring expansion
# Start small. Expand only from patterns found in the real dataset.
ABBREVIATION_MAP = {
    "hnd": "hindi",
    "hndi": "hindi",
    "di": "hindi",
    "d": "hindi",
    "dko": "hindi ko",
    "ung": "yung",
    "lng": "lang",
    "lngg": "lang",
    "lngggg": "lang",
    "nmn": "naman",
    "ok": "okay",
    "oks": "okay",
    "pls": "please",
    "plz": "please",
}

# 2. NUMBER SUBSTITUTIONS - Convert known text-speak to words
# Only recognized shorthand. Do NOT rewrite ordinary numeric information.
NUMBER_SUBSTITUTION_MAP: Dict[str, str] = {
    "gr8": "great",
    "l8r": "later",
    "b4": "before",
}

# 3. MISSPELLINGS - Known misspellings in Tagalog/Taglish
# Use custom dictionary only. Do NOT use general English spell-checker.
# Preserve unknown words rather than aggressively changing them.
MISSPELLING_MAP: Dict[str, str] = {
    "panget": "pangit",
    "magndaa": "maganda",
    "hndi": "hindi",
    "gud": "good",
}

# 4. EMOTICONS - Text emoticons converted to tokens
# Preserves emoji meaning in configurable format
EMOTICON_MAP: Dict[str, str] = {
    ":)": "<EMOJI_HAPPY>",
    ":-)": "<EMOJI_HAPPY>",
    ":(": "<EMOJI_SAD>",
    ":-(": "<EMOJI_SAD>",
    "<3": "<EMOJI_LOVE>",
    ":'(": "<EMOJI_SAD>",
    ":P": "<EMOJI_TONGUE>",
    ":/": "<EMOJI_CONFUSED>",
}

# 5. EMOJIS - Unicode emoji configuration
# Maps Unicode emojis to tokens. Can be switched to preserve raw emojis.
EMOJI_MAP: Dict[str, str] = {
    "😭": "<EMOJI_CRYING>",
    "❤️": "<EMOJI_LOVE>",
    "❤": "<EMOJI_LOVE>",
    "😡": "<EMOJI_ANGRY>",
    "😒": "<EMOJI_DISGUSTED>",
    "😢": "<EMOJI_SAD>",
    "😍": "<EMOJI_LOVE>",
    "😂": "<EMOJI_HAPPY>",
    "🔥": "<EMOJI_FIRE>",
    "👍": "<EMOJI_THUMBSUP>",
    "👎": "<EMOJI_THUMBSDOWN>",
}

# 6. SLANG / INFORMAL WORDS - Informal expressions requiring expansion
# Keep separate from abbreviations, misspellings, and number substitutions.
# Do NOT create a huge dictionary from assumptions.
# Expand from actual dataset patterns found in VoxReview data.
# Note: "ganda", "sulit", "okay" are legitimate Tagalog/English words, not slang
SLANG_MAP: Dict[str, str] = {
    "badtrip": "bad experience",
}


# ==============================================================================
# HELPER FUNCTIONS - BASIC CLEANING (Stage 1)
# ==============================================================================

def normalize_unicode(text: str) -> str:
    """Normalize Unicode to NFC form."""
    return unicodedata.normalize("NFC", text)


def remove_html(text: str) -> str:
    """Remove HTML tags safely."""
    return re.sub(r"<[^>]+>", " ", text)


def remove_urls(text: str) -> str:
    """Remove URLs while preserving text structure."""
    return re.sub(r"https?://\S+|www\.\S+", " ", text, flags=re.IGNORECASE)


def normalize_whitespace(text: str) -> str:
    """Normalize multiple spaces to single space and strip edges."""
    return re.sub(r"\s+", " ", text).strip()


def normalize_case(text: str) -> str:
    """Convert to lowercase."""
    return text.lower()


# ==============================================================================
# NORMALIZATION FUNCTIONS (Stage 3) - Each category separate
# ==============================================================================

def normalize_abbreviations(text: str) -> str:
    """Expand informal abbreviations (hnd→hindi, lng→lang, etc.)."""
    for short, full in sorted(ABBREVIATION_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = rf"(?<!\w){re.escape(short)}(?!\w)"
        text = re.sub(pattern, full, text, flags=re.IGNORECASE)
    return text


def normalize_number_substitutions(text: str) -> str:
    """Convert text-speak numbers (gr8→great, b4→before)."""
    for short, full in sorted(NUMBER_SUBSTITUTION_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = rf"(?<!\w){re.escape(short)}(?!\w)"
        text = re.sub(pattern, full, text, flags=re.IGNORECASE)
    return text


def normalize_known_misspellings(text: str) -> str:
    """Normalize known Tagalog/Taglish misspellings."""
    for wrong, correct in sorted(MISSPELLING_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = rf"(?<!\w){re.escape(wrong)}(?!\w)"
        text = re.sub(pattern, correct, text, flags=re.IGNORECASE)
    return text


def reduce_repeated_letters(text: str) -> str:
    """
    Normalize excessive repeated letters (gandaaaa→ganda).
    
    Rules:
    - Only reduce 3+ consecutive copies
    - Preserve normal double letters (good, see, etc.)
    - Preserve legitimate abbreviations like 'lngggg' after abbreviation expansion
    
    Edge cases handled:
    - 'lngggg' → first abbreviation expands to 'lang', then reduces if still repeated
    - 'mm', 'ss', 'll' (normal doubles) → preserved
    - 'mmm', 'sss', 'lll' (3+ copies) → reduced to single letter
    """
    return re.sub(r"(.)\1{2,}", r"\1", text, flags=re.DOTALL)


def normalize_emoticons(text: str) -> str:
    """Convert text emoticons to tokens (:)→<EMOJI_HAPPY>, etc.)."""
    for emoticon, token in sorted(EMOTICON_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        text = text.replace(emoticon, f" {token} ")
    return text


def normalize_emojis(text: str, preserve_emojis: bool = False) -> str:
    """
    Handle Unicode emojis.
    
    Args:
        text: Input text
        preserve_emojis: If True, keep raw emojis unchanged.
                         If False, convert to tokens for consistent processing.
    
    By default, converts emojis to tokens for consistent representation.
    Can be configured to preserve raw emojis for future experiments.
    """
    if preserve_emojis:
        # Return text with raw emojis unchanged
        return text
    else:
        # Convert emojis to tokens
        for emoji, token in sorted(EMOJI_MAP.items(), key=lambda x: len(x[0]), reverse=True):
            text = text.replace(emoji, f" {token} ")
        return text


def normalize_slang(text: str) -> str:
    """Normalize slang and informal words (badtrip→bad experience, sulit→worth it)."""
    for slang, expanded in sorted(SLANG_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = rf"(?<!\w){re.escape(slang)}(?!\w)"
        text = re.sub(pattern, expanded, text, flags=re.IGNORECASE)
    return text


# ==============================================================================
# MAIN PIPELINE
# ==============================================================================

def preprocess_review(
    text: str,
    *,
    lowercase: bool = True,
    normalize_emoticons_flag: bool = True,
    preserve_emojis: bool = False,
) -> str:
    """
    Apply the complete preprocessing pipeline to a review.
    
    Pipeline order:
    1. Basic Cleaning (Unicode, HTML, URLs, whitespace)
    2. Preserve Taglish/Code-switching (design rule - no translation)
    3. Custom Normalization:
       - Abbreviations (hnd→hindi, lng→lang)
       - Repeated Letters (gandaaaa→ganda)
       - Misspellings (panget→pangit)
       - Number Substitutions (gr8→great)
       - Emoticons (:)→<EMOJI_HAPPY>)
       - Emojis (😭→<EMOJI_CRYING> or preserved)
       - Slang (badtrip→bad experience)
    
    Args:
        text: Raw review text
        lowercase: If True, convert to lowercase (default: True)
        normalize_emoticons_flag: If True, convert emoticons to tokens (default: True)
        preserve_emojis: If True, keep Unicode emojis unchanged; if False, convert to tokens
    
    Returns:
        Preprocessed review text (raw_review is NOT modified)
    """
    if not isinstance(text, str):
        raise TypeError("text must be a string")

    # Stage 1: Basic Cleaning
    processed = normalize_unicode(text)
    processed = remove_html(processed)
    processed = remove_urls(processed)

    # Stage 2: Prepare for normalization
    if lowercase:
        processed = normalize_case(processed)

    # Stage 3: Custom Normalization (order matters)
    # - Abbreviations first (may create longer words for repeated-letter reduction)
    processed = normalize_abbreviations(processed)
    # - Repeated letters
    processed = reduce_repeated_letters(processed)
    # - Misspellings
    processed = normalize_known_misspellings(processed)
    # - Number substitutions
    processed = normalize_number_substitutions(processed)
    # - Text emoticons
    if normalize_emoticons_flag:
        processed = normalize_emoticons(processed)
    # - Unicode emojis (configurable)
    processed = normalize_emojis(processed, preserve_emojis=preserve_emojis)
    # - Slang/informal words
    processed = normalize_slang(processed)

    # Final: Normalize whitespace
    return normalize_whitespace(processed)


def preprocess_review_with_metadata(
    raw_review: str,
    *,
    lowercase: bool = True,
    normalize_emoticons_flag: bool = True,
    preserve_emojis: bool = False,
) -> Dict[str, str]:
    """
    Preprocess a review while preserving the raw original.
    
    Returns a dictionary with both raw and preprocessed versions.
    Use this when you need to keep the original for reference or dataset building.
    
    Returns:
        {
            "raw_review": original text unchanged,
            "preprocessed_review": normalized text
        }
    """
    return {
        "raw_review": raw_review,
        "preprocessed_review": preprocess_review(
            raw_review,
            lowercase=lowercase,
            normalize_emoticons_flag=normalize_emoticons_flag,
            preserve_emojis=preserve_emojis,
        )
    }


if __name__ == "__main__":
    # Example reviews demonstrating the pipeline
    test_reviews = [
        "SOBRANG GANDAAAA!!! hnd ko expect na ganito kaganda 😭❤️",
        "pangittttt ng quality, di ko bet :(",
        "super nice ng product pero medyo mahal",
        "gr8 product!!! sulittt naman",
        "okay naman, nothing special :)",
        "10/10, worth it talaga ❤️",
        "₱500 lng naman, good quality",
        "badtrip ka talaga, gr8 packaging lng",
        "ok lng pero sulit na sulit",
        "Wow, ang ganda naman. Basag pagdating. :(",
    ]

    print("=" * 100)
    print("VOXREVIEW PREPROCESSING PIPELINE DEMONSTRATION")
    print("=" * 100)
    print()

    for i, review in enumerate(test_reviews, 1):
        result = preprocess_review_with_metadata(review, preserve_emojis=False)
        print(f"[{i}] RAW:         {result['raw_review']}")
        print(f"    PROCESSED:    {result['preprocessed_review']}")
        print()
