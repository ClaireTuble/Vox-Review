"""Focused tests for post-SVM contextual resolution; no model fitting is used."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

NLP_DIR = Path(__file__).parent.parent
if str(NLP_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_DIR))
if str(NLP_DIR / "preprocessing") not in sys.path:
    sys.path.insert(0, str(NLP_DIR / "preprocessing"))

import svm_model
from contextual_resolution import (
    DEFAULT_SCORE_MARGIN,
    SCORE_MARGIN_ENV,
    get_score_margin,
    resolve_contextual_prediction,
)


def score_vector(category: int, *, gap: float = 0.8, competitor: int = 2) -> dict[int, float]:
    if competitor == category:
        competitor = next(code for code in range(1, 7) if code != category)
    scores = {code: -1.0 for code in range(1, 7)}
    scores[category] = 0.8
    scores[competitor] = 0.8 - gap
    return scores


def resolve(review: str, category: int, *, gap: float = 0.8, competitor: int = 2) -> dict:
    return resolve_contextual_prediction(
        review,
        category,
        score_vector(category, gap=gap, competitor=competitor),
    )


def test_clear_happy_review_keeps_happy():
    result = resolve("I love this beautiful product and I'm very satisfied.", 1)

    assert result["category"] == 1
    assert result["applied"] is False
    assert "Primary emotion: Happy" in result["explanation"]


def test_clear_sad_review_keeps_sad():
    result = resolve("I was disappointed with the poor quality.", 2)

    assert result["category"] == 2
    assert result["applied"] is False


def test_mixed_happy_and_sad_uses_dominant_reaction():
    result = resolve("I love it, but I am disappointed with the quality.", 1)

    assert result["category"] == 2
    assert result["applied"] is True


def test_happy_then_strong_disappointment_selects_sad():
    result = resolve("I loved it at first, but now I'm really disappointed; it stopped working.", 1)

    assert result["category"] == 2


def test_positive_product_with_service_accountability_selects_anger():
    result = resolve("The product is great, but the seller sent the wrong item and never replied.", 1)

    assert result["category"] == 3


def test_disappointment_without_blame_selects_sad():
    result = resolve("I am disappointed that the delivery was late.", 3)

    assert result["category"] == 2


def test_blame_and_request_to_fix_select_anger():
    result = resolve("The seller sent the wrong item, ignored my message, and should refund me.", 2)

    assert result["category"] == 3


def test_local_negation_does_not_create_happy_defect_or_anger_signals():
    result = resolve("I'm not happy, hindi sira, at wala akong galit.", 1)

    assert result["category"] == 2


def test_but_and_pero_use_overall_verdict_instead_of_clause_order():
    result = resolve("It arrived late, but all in all it's worth it.", 2)

    assert result["category"] == 1


def test_taglish_clause_context_selects_sad():
    result = resolve("Ang ganda ng item pero hindi ako happy dahil sira agad.", 1)

    assert result["category"] == 2


def test_clear_contradictory_praise_selects_sarcastic():
    result = resolve("Very good, one hour lang gumana. Nice.", 1)

    assert result["category"] == 6
    assert "ironic praise" in result["explanation"]


def test_explicit_overall_verdict_outranks_earlier_ironic_praise():
    result = resolve("Very good, one hour lang gumana. Overall, hindi worth it.", 6)

    assert result["category"] == 2
    assert "overall verdict" in result["explanation"]


def test_risk_and_possible_harm_select_fear():
    result = resolve("The battery gets dangerously hot and I'm afraid it may explode.", 2)

    assert result["category"] == 5


def test_confident_model_without_conflicting_context_is_not_overridden():
    result = resolve("This is a lovely product and I am happy with it.", 1)

    assert result["category"] == 1
    assert result["trigger"] == "none"
    assert result["applied"] is False


def test_close_svm_scores_trigger_contextual_resolution():
    result = resolve(
        "I love it, but I am disappointed with the quality.",
        1,
        gap=0.05,
        competitor=2,
    )

    assert result["trigger"] == "close_scores_and_context_conflict"
    assert result["category"] == 2


def test_explicit_overall_verdict_can_override_a_confident_svm_prediction():
    result = resolve("It broke, but all in all it is still worth it.", 2)

    assert result["category"] == 1
    assert "overall verdict" in result["explanation"]


def test_final_substantive_clause_breaks_equal_context_tie():
    result = resolve("I am happy. I am disappointed.", 1)

    assert result["category"] == 2
    assert "final substantive evaluative clause" in result["explanation"]


def test_score_margin_is_configurable_and_provisional(monkeypatch):
    monkeypatch.setenv(SCORE_MARGIN_ENV, "0.22")

    assert get_score_margin() == 0.22
    assert DEFAULT_SCORE_MARGIN == 0.15


@pytest.mark.parametrize("invalid_margin", ["NaN", "inf", "-0.1", "invalid"])
def test_invalid_score_margin_is_rejected(monkeypatch, invalid_margin):
    monkeypatch.setenv(SCORE_MARGIN_ENV, invalid_margin)

    with pytest.raises(ValueError):
        get_score_margin()


def test_wrapper_returns_final_category_but_keeps_original_svm_drivers(monkeypatch):
    class FakeFittedModel:
        classes_ = np.asarray([1, 2, 3, 4, 5, 6])

        def predict(self, _texts):
            return np.asarray([1])

        def decision_function(self, _texts):
            return np.asarray([[0.8, 0.0, -0.5, -0.6, -0.7, -0.8]])

    monkeypatch.setattr(svm_model, "_emotion_drivers", lambda *_args: ["love"])
    result = svm_model.explain_category(
        "I love it, but I am disappointed with the quality.",
        model=FakeFittedModel(),
    )

    assert result["category"] == 2
    assert result["contextualResolution"]["svmCategory"] == 1
    assert result["contextualResolution"]["applied"] is True
    assert result["emotionDrivers"] == ["love"]