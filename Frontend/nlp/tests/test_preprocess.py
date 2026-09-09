"""
Comprehensive test suite for VoxReview preprocessing pipeline.

Tests ensure:
- All normalization categories work correctly
- Taglish/code-switching is preserved
- Raw reviews remain unchanged
- Edge cases are handled safely
- Combinations of phenomena work together
- Emotion-bearing information (emojis) is not lost
"""

import sys
from pathlib import Path

# Find the nlp/preprocessing folder
PREPROCESSING_DIR = Path(__file__).resolve().parents[1] / "preprocessing"
sys.path.insert(0, str(PREPROCESSING_DIR))

from preprocess import preprocess_review, preprocess_review_with_metadata


def check(raw: str, expected: str) -> None:
    """Test helper: verify preprocessing output matches expected result."""
    actual = preprocess_review(raw)

    if actual != expected:
        raise AssertionError(
            f"\nRAW:      {raw!r}"
            f"\nEXPECTED: {expected!r}"
            f"\nACTUAL:   {actual!r}\n"
        )


def check_raw_preserved(raw: str) -> None:
    """Test helper: verify raw_review is preserved in metadata."""
    result = preprocess_review_with_metadata(raw)
    if result["raw_review"] != raw:
        raise AssertionError(
            f"Raw review was modified!"
            f"\nORIGINAL: {raw!r}"
            f"\nGOT:      {result['raw_review']!r}\n"
        )


# ==============================================================================
# SECTION 1: BASIC CLEANING
# ==============================================================================

def test_basic_cleaning_html_removal():
    """HTML tags should be removed and replaced with spaces."""
    check(
        "sobrang ganda <b>talaga</b>",
        "sobrang ganda talaga"
    )


def test_basic_cleaning_url_removal():
    """URLs should be removed."""
    check(
        "check this https://example.com amazing product",
        "check this amazing product"
    )


def test_basic_cleaning_whitespace_normalization():
    """Multiple spaces should normalize to single space."""
    check(
        "sobrang   ganda    talaga",
        "sobrang ganda talaga"
    )


def test_basic_cleaning_unicode_normalization():
    """Unicode should normalize to NFC form."""
    # This test verifies Unicode normalization occurs (hard to see visually)
    check(
        "café",
        "café"
    )


# ==============================================================================
# SECTION 2: TAGLISH / CODE-SWITCHING PRESERVATION
# ==============================================================================

def test_taglish_mixed_language_preserved():
    """Taglish (English + Tagalog) should remain unchanged after preprocessing."""
    check(
        "super nice ng product pero medyo mahal",
        "super nice ng product pero medyo mahal"
    )


def test_taglish_with_abbreviations():
    """Taglish should be preserved even when abbreviations are expanded."""
    check(
        "nice ng product hnd lng ang price",
        "nice ng product hindi lang ang price"
    )


def test_taglish_complex():
    """Complex Taglish with multiple languages should stay mixed."""
    check(
        "ang quality talaga ay very good, sobrang satisfied",
        "ang quality talaga ay very good, sobrang satisfied"
    )


# ==============================================================================
# SECTION 3: ABBREVIATION NORMALIZATION
# ==============================================================================

def test_abbreviations_basic():
    """Basic abbreviations should expand."""
    check("hnd ko bet", "hindi ko bet")
    check("ung item", "yung item")
    check("lng naman", "lang naman")


def test_abbreviations_word_boundaries():
    """Abbreviations should only match at word boundaries."""
    check(
        "hlng ng product",  # "hlng" should NOT be interpreted as "h" + "lng"
        "hlng ng product"  # Should remain unchanged (not a recognized word)
    )


def test_abbreviations_repeated_letter_variant():
    """Repeated-letter variants of abbreviations should expand."""
    check("lngg naman", "lang naman")
    check("lngggg talaga", "lang talaga")


def test_abbreviations_mixed_case():
    """Abbreviations in various cases should normalize."""
    check("HND ko", "hindi ko")
    check("Hnd ko", "hindi ko")


# ==============================================================================
# SECTION 4: REPEATED LETTER NORMALIZATION
# ==============================================================================

def test_repeated_letters_basic():
    """Excessive repeated letters should reduce to single letter."""
    check("gandaaaa", "ganda")
    check("sulittttt", "sulit")
    check("veryyy good", "very good")


def test_repeated_letters_preserves_doubles():
    """Normal double letters (good, see, etc.) should be preserved."""
    check("good product", "good product")
    check("see this", "see this")
    check("happy", "happy")


def test_repeated_letters_edge_cases():
    """Edge case: abbreviations that become repeated after expansion should reduce."""
    # First "lng" expands to "lang" (with 'n')
    # Then repeated reduction would occur if the input was "lnggggg"
    check("lngggg", "lang")
    check("nggggg", "ng")


def test_repeated_letters_preserves_legitimate():
    """Three+ repeated letters get reduced even for slang/informal words."""
    # "badtripppp" → reduce to "badtrip" → expand via slang → "bad experience"
    check("mmm", "m")
    check("sss", "s")
    check("badtripppp", "bad experience")


# ==============================================================================
# SECTION 5: MISSPELLING NORMALIZATION
# ==============================================================================

def test_misspellings_known():
    """Known misspellings should be corrected."""
    check("panget", "pangit")
    check("hndi", "hindi")
    check("gud", "good")


def test_misspellings_unknown_preserved():
    """Unknown or questionable words should NOT be changed."""
    check(
        "sira ng product",
        "sira ng product"  # "sira" is valid Tagalog, not in misspellings
    )


def test_misspellings_word_boundaries():
    """Misspellings should only match at word boundaries."""
    check(
        "magndaa ng damit",
        "maganda ng damit"
    )


# ==============================================================================
# SECTION 6: NUMBER SUBSTITUTION NORMALIZATION
# ==============================================================================

def test_number_substitutions_known():
    """Known text-speak should convert."""
    check("gr8 product", "great product")
    check("l8r", "later")
    check("b4", "before")


def test_number_substitutions_ordinary_numbers_preserved():
    """Ordinary numeric information should NOT be changed."""
    check(
        "10/10 worth it",
        "10/10 worth it"
    )

    check(
        "₱500 lang",
        "₱500 lang"
    )

    check(
        "3 days delivery",
        "3 days delivery"
    )

    check(
        "5 stars",
        "5 stars"
    )


# ==============================================================================
# SECTION 7: EMOTICON NORMALIZATION
# ==============================================================================

def test_emoticons_basic():
    """Text emoticons should convert to tokens."""
    check(
        "okay naman :)",
        "okay naman <EMOJI_HAPPY>"
    )

    check(
        "pangit :(",
        "pangit <EMOJI_SAD>"
    )


def test_emoticons_multiple():
    """Multiple emoticons should all be converted."""
    check(
        "happy :) but also sad :(",
        "happy <EMOJI_HAPPY> but also sad <EMOJI_SAD>"
    )


def test_emoticons_love():
    """Heart emoticon should convert."""
    check(
        "love it <3",
        "love it <EMOJI_LOVE>"
    )


# ==============================================================================
# SECTION 8: EMOJI HANDLING
# ==============================================================================

def test_emojis_preserved_when_configured():
    """Unicode emojis should be preserved when preserve_emojis=True."""
    result = preprocess_review(
        "sobrang ganda 😭❤️",
        preserve_emojis=True
    )
    assert "😭" in result
    assert "❤️" in result


def test_emojis_converted_default():
    """Unicode emojis should convert to tokens by default."""
    result = preprocess_review(
        "sobrang ganda 😭❤️",
        preserve_emojis=False
    )
    assert "<emoji_crying>" in result.lower()
    assert "<emoji_love>" in result.lower()


def test_emojis_emotion_preserved():
    """Emoji tokens should preserve emotion meaning (not completely removed)."""
    result = preprocess_review(
        "wow ang ganda naman basag pagdating 😭",
        preserve_emojis=False
    )
    # The crying emoji token should be present to indicate sadness
    assert "<EMOJI_" in result


# ==============================================================================
# SECTION 9: SLANG / INFORMAL WORD NORMALIZATION
# ==============================================================================

def test_slang_basic():
    """Basic slang should expand."""
    check(
        "badtrip ka talaga",
        "bad experience ka talaga"
    )


def test_slang_multiple():
    """Multiple slang words in one review."""
    check(
        "badtrip ang experience pero sulit naman",
        "bad experience ang experience pero sulit naman"
    )


# ==============================================================================
# SECTION 10: COMBINATION TESTS (Multiple phenomena together)
# ==============================================================================

def test_combination_taglish_with_abbreviations_and_emojis():
    """Test Taglish with abbreviations and emojis together."""
    check(
        "nice product pero lng ang problem hnd ko ma enjoy :(",
        "nice product pero lang ang problem hindi ko ma enjoy <EMOJI_SAD>"
    )


def test_combination_abbreviations_repeated_letters_emoticons():
    """Test abbreviation expansion + repeated letters + emoticons."""
    check(
        "ung quality naman sukkk lng :)",
        "yung quality naman suk lang <EMOJI_HAPPY>"
    )


def test_combination_complex_realistic():
    """Complex realistic review with multiple phenomena."""
    check(
        "SOBRANG GANDAAAA!!! hnd ko expect na ganito kaganda 😭",
        "sobrang ganda! hindi ko expect na ganito kaganda <EMOJI_CRYING>"
    )


def test_combination_slang_and_repeated_letters():
    """Slang with repeated letters."""
    check(
        "badtripppp experience",
        "bad experience experience"
    )


def test_combination_number_substitution_with_abbreviation():
    """Number substitution combined with abbreviation."""
    check(
        "gr8 product lng naman",
        "great product lang naman"
    )


def test_combination_misspelling_with_slang():
    """Misspelling and slang in same review."""
    check(
        "panget pero badtrip",
        "pangit pero bad experience"
    )


def test_combination_all_phenomena():
    """
    Test everything together:
    - Taglish (english + tagalog)
    - Abbreviations (lng→lang, hnd→hindi)
    - Repeated letters (gandaaaa→ganda)
    - Misspellings (panget→pangit)
    - Number substitutions (gr8→great)
    - Emoticons (:)→<EMOJI_HAPPY>)
    - Slang (badtrip→bad experience)
    """
    check(
        "Sobrang gandaaaa!!! hnd ko expect na gr8 quality pero lng ang delivery :)",
        "sobrang ganda! hindi ko expect na great quality pero lang ang delivery <EMOJI_HAPPY>"
    )


# ==============================================================================
# SECTION 11: RAW REVIEW PRESERVATION
# ==============================================================================

def test_raw_review_preserved_basic():
    """Raw review must NOT be modified."""
    check_raw_preserved("sobrang ganda")
    check_raw_preserved("GANDAAAA!!!")
    check_raw_preserved("hnd ko bet :)")


def test_raw_review_preserved_complex():
    """Complex reviews with all phenomena must have raw preserved."""
    check_raw_preserved(
        "SOBRANG GANDAAAA!!! hnd ko expect na gr8 quality pero lng 😭"
    )


def test_metadata_returns_both_versions():
    """preprocess_review_with_metadata should return both raw and preprocessed."""
    raw = "Sobrang gandaaaa hnd ko :)"
    result = preprocess_review_with_metadata(raw)

    assert result["raw_review"] == raw
    assert result["preprocessed_review"] != raw
    assert "ganda" in result["preprocessed_review"]
    assert "hindi" in result["preprocessed_review"]


# ==============================================================================
# SECTION 12: EDGE CASES AND SAFETY
# ==============================================================================

def test_edge_case_empty_string():
    """Empty string should be handled safely."""
    check("", "")


def test_edge_case_only_whitespace():
    """Only whitespace should normalize to empty."""
    check("   ", "")


def test_edge_case_only_emojis():
    """Only emojis should convert."""
    result = preprocess_review("😭❤️", preserve_emojis=False)
    assert len(result) > 0
    assert "<emoji_" in result.lower()


def test_edge_case_mixed_repeated_letters():
    """Different repeated letters in same text."""
    check(
        "gandaaaa sulitttt",
        "ganda sulit"
    )


def test_edge_case_nested_transformations():
    """Abbreviation→word that might be a misspelling."""
    # "dko" → "hindi ko"
    # The resulting "ko" should not be further processed
    check("dko panget", "hindi ko pangit")


def test_type_error_on_non_string():
    """Non-string input should raise TypeError."""
    try:
        preprocess_review(123)
        raise AssertionError("Should have raised TypeError")
    except TypeError:
        pass  # Expected


# ==============================================================================
# SECTION 13: CASE SENSITIVITY
# ==============================================================================

def test_case_insensitive_abbreviations():
    """Abbreviations should work regardless of case."""
    check("HND ko", "hindi ko")
    check("Hnd ko", "hindi ko")
    check("GANDAAAA", "ganda")


def test_lowercase_conversion():
    """Text should convert to lowercase by default."""
    check("HELLO WORLD", "hello world")
    check("HeLLo WoRLd", "hello world")


# ==============================================================================
# TEST RUNNER
# ==============================================================================

def run_all():
    """Run all tests and report results."""
    tests = [
        # Basic cleaning
        test_basic_cleaning_html_removal,
        test_basic_cleaning_url_removal,
        test_basic_cleaning_whitespace_normalization,
        test_basic_cleaning_unicode_normalization,
        # Taglish preservation
        test_taglish_mixed_language_preserved,
        test_taglish_with_abbreviations,
        test_taglish_complex,
        # Abbreviations
        test_abbreviations_basic,
        test_abbreviations_word_boundaries,
        test_abbreviations_repeated_letter_variant,
        test_abbreviations_mixed_case,
        # Repeated letters
        test_repeated_letters_basic,
        test_repeated_letters_preserves_doubles,
        test_repeated_letters_edge_cases,
        test_repeated_letters_preserves_legitimate,
        # Misspellings
        test_misspellings_known,
        test_misspellings_unknown_preserved,
        test_misspellings_word_boundaries,
        # Number substitutions
        test_number_substitutions_known,
        test_number_substitutions_ordinary_numbers_preserved,
        # Emoticons
        test_emoticons_basic,
        test_emoticons_multiple,
        test_emoticons_love,
        # Emojis
        test_emojis_preserved_when_configured,
        test_emojis_converted_default,
        test_emojis_emotion_preserved,
        # Slang
        test_slang_basic,
        test_slang_multiple,
        # Combinations
        test_combination_taglish_with_abbreviations_and_emojis,
        test_combination_abbreviations_repeated_letters_emoticons,
        test_combination_complex_realistic,
        test_combination_slang_and_repeated_letters,
        test_combination_number_substitution_with_abbreviation,
        test_combination_misspelling_with_slang,
        test_combination_all_phenomena,
        # Raw preservation
        test_raw_review_preserved_basic,
        test_raw_review_preserved_complex,
        test_metadata_returns_both_versions,
        # Edge cases
        test_edge_case_empty_string,
        test_edge_case_only_whitespace,
        test_edge_case_only_emojis,
        test_edge_case_mixed_repeated_letters,
        test_edge_case_nested_transformations,
        test_type_error_on_non_string,
        # Case sensitivity
        test_case_insensitive_abbreviations,
        test_lowercase_conversion,
    ]

    passed = 0
    failed = 0
    errors = []

    for test in tests:
        try:
            test()
            passed += 1
            print(f"✓ {test.__name__}")
        except AssertionError as e:
            failed += 1
            errors.append((test.__name__, str(e)))
            print(f"✗ {test.__name__}")
        except Exception as e:
            failed += 1
            errors.append((test.__name__, f"Unexpected error: {str(e)}"))
            print(f"✗ {test.__name__} (ERROR)")

    print(f"\n{'=' * 80}")
    print(f"RESULTS: {passed} passed, {failed} failed out of {len(tests)} tests")
    print(f"{'=' * 80}")

    if errors:
        print("\nFAILURES:")
        for test_name, error_msg in errors:
            print(f"\n{test_name}:")
            print(error_msg)
        return False

    return True


if __name__ == "__main__":
    success = run_all()
    sys.exit(0 if success else 1)

    