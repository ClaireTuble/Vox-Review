"""Conservative, score-aware boundary refinement for zero-shot topic results."""

from __future__ import annotations

import re

_STRONG_EVIDENCE = {
    "Performance / Functionality": re.compile(
        r"\b(?:"
        r"(?:app|application|game|software|system|program|device|server|"
        r"screen|page)\b.{0,40}\b(?:crash(?:es|ed|ing)?|bugs?|buggy|"
        r"lag(?:s|ged|ging)?|freez(?:e|es|ing|en)|slow|stuck|"
        r"not\s+responding|keeps?\s+closing)|"
        r"(?:crash(?:es|ed|ing)?|bugs?|buggy|lag(?:s|ged|ging)?|"
        r"freez(?:e|es|ing|en)|stuck|not\s+responding)\b.{0,40}\b"
        r"(?:app|application|game|software|system|program|device|server|"
        r"screen|page)\b|"
        r"slow\s+performance|loading\s+(?:problem|issue|screen)|"
        r"(?:low\s+)?fps|frame\s+drops?|keeps?\s+(?:crashing|freezing|lagging|closing)"
        r")\b",
        re.IGNORECASE,
    ),
    "Service / Support": re.compile(
        r"\b(?:customer\s+support|support\s+team|customer\s+service|"
        r"seller\s+support|support\s+staff|support\s+agent|"
        r"(?:support|service)\s+ticket|ticket\s+(?:to|for)\s+support|"
        r"response\s+from\s+support)\b|"
        r"\b(?:seller|support|customer\s+service|staff|agent|ticket)\b"
        r".{0,40}\b(?:repl(?:y|ied)|respond(?:ed|s)?|response|answer(?:ed|s)?|"
        r"help(?:ed|ful)?|assist(?:ed|ance)?|ignored|unanswered)\b|"
        r"\b(?:no\s+response|unanswered\s+ticket)\b",
        re.IGNORECASE,
    ),
    "Delivery / Transaction": re.compile(
        r"\b(?:shipping|shipment|delivery|courier|parcel|package)\b"
        r".{0,35}\b(?:late|delayed|arriv(?:ed|al)|lost|tracking|"
        r"fast|slow|fee|damaged)\b|"
        r"\b(?:late|delayed|arriv(?:ed|al)|lost|tracking|fast|slow|"
        r"fee|damaged)\b.{0,35}"
        r"\b(?:shipping|shipment|delivery|courier|parcel|package)\b|"
        r"\b(?:refund(?:ed)?|payment\s+(?:failed|charged|refunded|issue))\b",
        re.IGNORECASE,
    ),
    "Accuracy / Expectations": re.compile(
        r"\bwrong\s+(?:item|size|color|colour|quantity|product)\b|"
        r"\bnot\s+as\s+described\b|"
        r"\b(?:different|doesn't\s+match|does\s+not\s+match)\s+"
        r"(?:the\s+)?(?:picture|photo|description|what\s+i\s+ordered)\b|"
        r"\breceived\s+.+\s+instead\s+of\b",
        re.IGNORECASE,
    ),
    "Features / Content": re.compile(
        r"\b(?:feature|features|content|options?)\b"
        r".{0,30}\b(?:missing|available|limited|useful|included|"
        r"includes|offers?|lacks?)\b|"
        r"\b(?:missing|available|limited|useful|included|includes|"
        r"offers?|lacks?)\b.{0,30}\b(?:feature|features|content|options?)\b|"
        r"\b(?:new|added|playable)\s+(?:characters?|maps?|modes?|levels?|"
        r"missions?|weapons?|items?|content)\b|"
        r"\b(?:characters?|maps?|modes?|levels?|missions?|weapons?)\b|"
        r"\bfeature\s+request\b",
        re.IGNORECASE,
    ),
    "Quality": re.compile(
        r"\b(?:(?:poor|great|excellent|bad|good|high|low|visual|audio|"
        r"build|overall)\s+)?quality\b|\bquality\s+of\s+(?:the\s+)?"
        r"(?:graphics|audio|sound|materials|build|visuals?)\b",
        re.IGNORECASE,
    ),
    "Usability / Experience": re.compile(
        r"\b(?:controls?|navigation|interface|menu|setup|installation)\b"
        r".{0,35}\b(?:confusing|difficult|hard|easy|intuitive|clunky|"
        r"frustrating|simple)\b|"
        r"\b(?:confusing|difficult|hard|easy|intuitive|clunky|"
        r"frustrating|simple)\b.{0,35}\b(?:to\s+use|controls?|navigation|"
        r"interface|menu|setup|installation)\b|"
        r"\b(?:easy|hard|difficult|confusing)\s+to\s+use\b",
        re.IGNORECASE,
    ),
}

_CANDIDATE_MARGIN = 0.08
_CUE_SCORE_BONUS = 0.08


def refine_topic_scores(
    review: str,
    scores: dict[str, float],
    threshold: float,
) -> dict[str, float]:
    """Give competitive E5 candidates a modest boost when explicit review cues support them."""
    refined_scores = dict(scores)
    highest_score = max(scores.values(), default=0.0)
    matched_topics = {
        topic
        for topic, pattern in _STRONG_EVIDENCE.items()
        if pattern.search(review)
    }

    for topic in matched_topics:
        score = refined_scores.get(topic, 0)
        if score >= threshold and score >= highest_score - _CANDIDATE_MARGIN:
            refined_scores[topic] = min(score + _CUE_SCORE_BONUS, 1.0)

    return refined_scores
