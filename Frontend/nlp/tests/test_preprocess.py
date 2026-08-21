import sys
from pathlib import Path

# Find the nlp/preprocessing folder
PREPROCESSING_DIR = Path(__file__).resolve().parents[1] / "preprocessing"
sys.path.insert(0, str(PREPROCESSING_DIR))

from preprocess import preprocess_review


def check(raw: str, expected: str) -> None:
    actual = preprocess_review(raw)

    if actual != expected:
        raise AssertionError(
            f"\nRAW:      {raw!r}"
            f"\nEXPECTED: {expected!r}"
            f"\nACTUAL:   {actual!r}\n"
        )


def test_repeated_letters():
    check("gandaaaa", "ganda")
    check("sulittttt", "sulit")
    check("veryyy good", "very good")


def test_abbreviations():
    check("hnd ko bet", "hindi ko bet")
    check("ung item", "yung item")
    check("lng naman", "lang naman")


def test_taglish_is_preserved():
    check(
        "super nice ng product pero medyo mahal",
        "super nice ng product pero medyo mahal"
    )


def test_emojis_are_preserved():
    check(
        "sobrang ganda 😭❤️",
        "sobrang ganda 😭❤️"
    )


def test_text_emoticons_are_handled():
    check(
        "okay naman :)",
        "okay naman <EMOJI_HAPPY>"
    )

    check(
        "pangit :(",
        "pangit <EMOJI_SAD>"
    )


def test_number_information_is_preserved():
    check(
        "10/10 worth it",
        "10/10 worth it"
    )

    check(
        "₱500 lang",
        "₱500 lang"
    )


def test_known_number_substitutions():
    check(
        "gr8 product",
        "great product"
    )

    check(
        "l8r",
        "later"
    )

    check(
        "b4",
        "before"
    )


def test_known_misspellings():
    check(
        "panget",
        "pangit"
    )

    check(
        "hndi",
        "hindi"
    )


def test_mixed_example():
    check(
        "SOBRANG GANDAAAA!!! hnd ko expect na ganito kaganda 😭❤️",
        "sobrang ganda! hindi ko expect na ganito kaganda 😭❤️"
    )


def run_all():
    tests = [
        test_repeated_letters,
        test_abbreviations,
        test_taglish_is_preserved,
        test_emojis_are_preserved,
        test_text_emoticons_are_handled,
        test_number_information_is_preserved,
        test_known_number_substitutions,
        test_known_misspellings,
        test_mixed_example,
    ]

    for test in tests:
        test()
        print(f"PASS: {test.__name__}")

    print(f"\nAll {len(tests)} preprocessing tests passed.")


if __name__ == "__main__":
    run_all()
    