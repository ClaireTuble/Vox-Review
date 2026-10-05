"""Resolve conflicting single-review emotion predictions from review context."""

from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass
from math import isfinite


LABELS = {
    1: "Happy",
    2: "Sad",
    3: "Anger",
    4: "Disgust",
    5: "Fear",
    6: "Sarcastic",
}
DEFAULT_SCORE_MARGIN = 0.15
SCORE_MARGIN_ENV = "VOXREVIEW_CONTEXT_SCORE_MARGIN"

CLAUSE_SPLIT_RE = re.compile(
    r"[.!?;]+|\b(?:but|however|pero|kaso|although|kahit na|kahit)\b",
    re.IGNORECASE,
)
OVERALL_RE = re.compile(
    r"\b(?:all in all|overall(?: experience)?|in the end|sa huli|worth it|sulit)\b",
    re.IGNORECASE,
)
NEGATED_VERDICT_RE = re.compile(
    r"\b(?:not worth it|isn't worth it|is not worth it|hindi (?:na )?worth it|di worth it|"
    r"not happy|isn't happy|hindi (?:ako )?happy|di ako happy|not satisfied|"
    r"hindi (?:ako )?satisfied|hindi ako masaya)\b",
    re.IGNORECASE,
)
NEGATED_DEFECT_RE = re.compile(
    r"\b(?:not|isn't|wasn't|hindi|di|hnd|hndi)\s+(?:(?:really|actually|talaga|na|pa)\s+)?"
    r"(?:broken|damaged|defective|sira|basag|defect)\b",
    re.IGNORECASE,
)
NEGATION_PREFIX_RE = re.compile(
    r"\b(?:not|never|no|isn't|wasn't|aren't|don't|doesn't|didn't|can't|cannot|"
    r"hindi|di|hnd|hndi|wala)(?:\s+\w+){0,2}\s*$",
    re.IGNORECASE,
)

HAPPY_RE = re.compile(
    r"\b(?:happy|satisfied|satisfying|love|loved|great|excellent|beautiful|"
    r"maganda|maayos|okay|ok|masaya|nagustuhan|gusto ko|worth it|sulit|recommend)\b",
    re.IGNORECASE,
)
SAD_RE = re.compile(
    r"\b(?:disappointed|disappointing|sad|unhappy|nakakalungkot|nalungkot|"
    r"sayang|hassle|upset|frustrated)\b",
    re.IGNORECASE,
)
ANGER_RE = re.compile(
    r"\b(?:angry|mad|furious|galit|nakakainis|nakakagalit|inis|badtrip|"
    r"unfair|scam|cheated|fraud)\b",
    re.IGNORECASE,
)
DISGUST_RE = re.compile(
    r"\b(?:disgusting|gross|filthy|dirty|repulsive|kadiri|mabaho|nandidiri|stench)\b",
    re.IGNORECASE,
)
FEAR_RE = re.compile(
    r"\b(?:afraid|scared|fear|worried|worry|takot|natatakot|delikado|danger|"
    r"risky|risk|unsafe|explode|sumabog|baka masira|baka masunog)\b",
    re.IGNORECASE,
)
COMPLAINT_RE = re.compile(
    r"\b(?:broken|damaged|defective|sira|basag|wrong|mali|kulang|missing|"
    r"late|delayed|delay|slow delivery|not working|doesn't work|does not work|"
    r"hindi gumagana|di gumagana|hindi lumalamig|leak|cracked|poor quality|"
    r"bad quality|not good|stopped working|terrible|bad|poor)\b",
    re.IGNORECASE,
)
ACCOUNTABILITY_RE = re.compile(
    r"\b(?:fix|refund|replace|ayusin|palitan|sana nag|should have|shouldn't have|"
    r"never replied|didn't reply|did not reply|ignored my|seller|service|rider|"
    r"courier|shop|you sent|you gave|you delivered|unfair|scam|cheated)\b",
    re.IGNORECASE,
)
ACCOUNTABLE_ACTOR_RE = re.compile(r"\b(?:seller|service|rider|courier|shop|you|they)\b", re.IGNORECASE)
ACCOUNTABLE_FAILURE_RE = re.compile(
    r"\b(?:wrong|mali|missing|kulang|late|delayed|delay|ignored|never replied|"
    r"didn't reply|did not reply|sent|gave|delivered|broken|defective)\b",
    re.IGNORECASE,
)
INTENSITY_RE = re.compile(r"\b(?:sobrang|very|grabe|really|super)\b|!{2,}|\?{2,}|(.)\1{2,}", re.IGNORECASE)
EMOJI_RE = re.compile(r"[❤️❤😍😂👍😡😒😢😭😨😱🤮]")
SARCASM_PRAISE_RE = re.compile(
    r"\b(?:very good|wow|nice|great|excellent|ang ganda|maganda naman)\b", re.IGNORECASE
)
SARCASM_FAILURE_RE = re.compile(
    r"\b(?:basag pagdating|broken on arrival|sira agad|only (?:worked|lasted) for|"
    r"one hour lang gumana|one minute lang gumana|one day lang gumana|"
    r"worked for one hour|worked for an hour|stopped working after)\b",
    re.IGNORECASE,
)
SARCASM_CLOSING_PRAISE_RE = re.compile(r"\b(?:nice|great|very good|excellent)\b[.!?\s]*$", re.IGNORECASE)


@dataclass(frozen=True)
class ContextSignal:
    category: int
    strength: float
    clause_index: int
    is_overall: bool = False
    is_complaint: bool = False


def get_score_margin() -> float:
    """Return the provisional score-gap threshold, configurable per deployment."""
    raw_margin = os.environ.get(SCORE_MARGIN_ENV)
    if raw_margin is None or not raw_margin.strip():
        return DEFAULT_SCORE_MARGIN
    try:
        margin = float(raw_margin)
    except ValueError as error:
        raise ValueError(f"{SCORE_MARGIN_ENV} must be a non-negative number") from error
    if not isfinite(margin) or margin < 0:
        raise ValueError(f"{SCORE_MARGIN_ENV} must be a non-negative number")
    return margin


def _is_negated(text: str, start: int) -> bool:
    return bool(NEGATION_PREFIX_RE.search(text[max(0, start - 48):start]))


def _has_unnegated(pattern: re.Pattern[str], text: str) -> bool:
    return any(not _is_negated(text, match.start()) for match in pattern.finditer(text))


def _has_complaint(text: str) -> bool:
    without_negated_defects = NEGATED_DEFECT_RE.sub(" ", text)
    return _has_unnegated(COMPLAINT_RE, without_negated_defects)


def _intensity_bonus(text: str) -> float:
    return 0.04 if INTENSITY_RE.search(text) or EMOJI_RE.search(text) else 0.0


def _classify_clause(text: str, clause_index: int) -> ContextSignal | None:
    clause = text.strip()
    if not clause:
        return None

    is_overall = bool(OVERALL_RE.search(clause))
    complaint = _has_complaint(clause)
    negated_verdict = bool(NEGATED_VERDICT_RE.search(clause))
    accountability = bool(ACCOUNTABILITY_RE.search(clause)) or (
        complaint
        and ACCOUNTABLE_ACTOR_RE.search(clause) is not None
        and ACCOUNTABLE_FAILURE_RE.search(clause) is not None
    )
    intensity = _intensity_bonus(clause)

    if negated_verdict:
        return ContextSignal(2, 0.92 + intensity, clause_index, is_overall, complaint)
    if _has_unnegated(FEAR_RE, clause):
        return ContextSignal(5, 1.0 + intensity, clause_index, is_overall, complaint)
    if _has_unnegated(DISGUST_RE, clause):
        return ContextSignal(4, 1.0 + intensity, clause_index, is_overall, complaint)
    if _has_unnegated(ANGER_RE, clause):
        return ContextSignal(3, 0.96 + intensity, clause_index, is_overall, complaint)
    if complaint and accountability:
        return ContextSignal(3, 1.12 + intensity, clause_index, is_overall, True)
    if _has_unnegated(SAD_RE, clause):
        return ContextSignal(2, 0.86 + intensity, clause_index, is_overall, complaint)
    if complaint:
        return ContextSignal(2, 1.04 + intensity, clause_index, is_overall, True)
    if _has_unnegated(HAPPY_RE, clause):
        return ContextSignal(1, 0.86 + intensity, clause_index, is_overall, False)
    if re.search(r"\bnot bad\b", clause, re.IGNORECASE):
        return ContextSignal(1, 0.62 + intensity, clause_index, is_overall, False)
    return None


def _is_clear_sarcasm(review: str) -> bool:
    praise = SARCASM_PRAISE_RE.search(review)
    failure = SARCASM_FAILURE_RE.search(review)
    if praise is None or failure is None:
        return False
    if SARCASM_CLOSING_PRAISE_RE.search(review):
        return True
    opening_praise = review[:failure.start()]
    return bool(re.search(r"\bwow\b|\bvery good\b|\bang ganda naman\b", opening_praise, re.IGNORECASE))


def extract_context_signals(review_text: str) -> list[ContextSignal]:
    """Extract one strongest contextual signal per clause, without cue counting."""
    normalized = unicodedata.normalize("NFKC", review_text).casefold()
    clauses = [part.strip() for part in CLAUSE_SPLIT_RE.split(normalized) if part.strip()]
    signals = [
        signal
        for index, clause in enumerate(clauses)
        if (signal := _classify_clause(clause, index)) is not None
    ]
    if _is_clear_sarcasm(normalized):
        signals.append(ContextSignal(6, 1.5, max(len(clauses) - 1, 0), False, True))
    return signals


def _select_context_category(signals: list[ContextSignal]) -> tuple[int | None, str | None]:
    if not signals:
        return None, None

    overall = [signal for signal in signals if signal.is_overall]
    if overall:
        selected = max(overall, key=lambda signal: (signal.strength, signal.clause_index))
        return selected.category, f"the explicit overall verdict expresses {LABELS[selected.category].lower()}"

    sarcasm = [signal for signal in signals if signal.category == 6]
    if sarcasm:
        return 6, "clear ironic praise contradicts the described outcome"

    central_issues = [signal for signal in signals if signal.is_complaint]
    candidates = central_issues or signals
    selected = max(candidates, key=lambda signal: (signal.strength, signal.clause_index))

    strongest = max(signal.strength for signal in candidates)
    tied = [signal for signal in candidates if signal.strength == strongest]
    if len(tied) > 1:
        selected = max(tied, key=lambda signal: signal.clause_index)
        return selected.category, "the final substantive evaluative clause breaks a balanced review"

    if selected.category == 3:
        reason = "the central complaint assigns blame or asks for accountability"
    elif selected.category == 2:
        reason = "the central issue and reaction express disappointment"
    elif selected.category == 1:
        reason = "the review's central reaction is positive"
    elif selected.category == 4:
        reason = "the central reaction expresses revulsion"
    else:
        reason = "the central issue expresses worry about risk or harm"
    return selected.category, reason


def resolve_contextual_prediction(
    review_text: str,
    svm_category: int,
    decision_scores: dict[int, float],
    *,
    score_margin: float | None = None,
) -> dict[str, int | float | bool | str]:
    """Keep a clear SVM result unless close scores or review context indicate conflict."""
    if svm_category not in LABELS:
        raise ValueError(f"Invalid SVM category: {svm_category}")
    if set(decision_scores) != set(LABELS):
        raise ValueError("decision_scores must contain one score for each category 1-6")

    margin = get_score_margin() if score_margin is None else float(score_margin)
    if not isfinite(margin) or margin < 0:
        raise ValueError("score_margin must be non-negative")

    ranked_scores = sorted(decision_scores.items(), key=lambda item: item[1], reverse=True)
    top_score_gap = float(ranked_scores[0][1] - ranked_scores[1][1])
    scores_are_close = top_score_gap <= margin
    signals = extract_context_signals(review_text)
    contextual_category, reason = _select_context_category(signals)
    contextual_conflict = len({signal.category for signal in signals}) > 1
    overall_disagrees = any(
        signal.is_overall and signal.category != svm_category for signal in signals
    )
    clear_sarcasm_disagrees = any(signal.category == 6 for signal in signals) and svm_category != 6
    strong_context_disagrees = contextual_category != svm_category and any(
        signal.category == contextual_category and signal.strength >= 0.85
        for signal in signals
    )
    triggered = (
        scores_are_close
        or contextual_conflict
        or overall_disagrees
        or clear_sarcasm_disagrees
        or strong_context_disagrees
    )

    final_category = svm_category
    if triggered and contextual_category is not None:
        final_category = contextual_category

    changed = final_category != svm_category
    if changed:
        explanation = f"Contextual resolution: {LABELS[final_category]} selected because {reason}."
    elif triggered:
        explanation = f"Primary emotion: {LABELS[svm_category]} retained because contextual evidence did not support a stronger alternative."
    else:
        explanation = (
            f"Primary emotion: {LABELS[svm_category]} based on the model prediction "
            "and absence of stronger conflicting context."
        )

    trigger = "none"
    if scores_are_close:
        trigger = "close_scores"
    if contextual_conflict or overall_disagrees or clear_sarcasm_disagrees or strong_context_disagrees:
        trigger = "context_conflict" if trigger == "none" else "close_scores_and_context_conflict"

    return {
        "category": final_category,
        "svmCategory": svm_category,
        "applied": changed,
        "trigger": trigger,
        "scoreMargin": margin,
        "topScoreGap": top_score_gap,
        "explanation": explanation,
    }