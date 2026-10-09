"""Narrow platform-aware applicability checks for selected topic assignments."""

from __future__ import annotations

import re
from typing import Any

ENVIRONMENT_LOCATION = "Environment / Location"
DELIVERY_TRANSACTION = "Delivery / Transaction"

_TRANSACTION_EVIDENCE = re.compile(
    r"\b(?:"
    r"pay(?:ments?)?|paid|paying|billing|bills?|bayad|nag[- ]?bayad|binayaran|singil|"
    r"purchases?|bought|buying|buy|checkout|transactions?|refund(?:s|ed)?|"
    r"subscriptions?|subscribed|subscribe|charges?|charged|charging|"
    r"microtransactions?|money transfer|bank transfer|fund transfer|"
    r"transfer money|our order|my order|the order|orders?|"
    r"umorder|nag[- ]?order|in[- ]app purchase|pre[- ]order"
    r")\b",
    re.IGNORECASE,
)

_PHYSICAL_PLACE_EVIDENCE = re.compile(
    r"\b(?:"
    r"physical (?:location|place|environment|surroundings?)|"
    r"real[- ]world (?:location|place|environment|surroundings?)|"
    r"located (?:at|in|near)|venue|address|branch|"
    r"parking(?: lot| space)?|restrooms?|washrooms?|toilets?|"
    r"facilit(?:y|ies)|street|road|beach|neighbou?rhood|"
    r"city|town|country|island|mountain|river|lake|park|"
    r"station|airport|mall|restaurant|shopping cent(?:er|re)|"
    r"surrounding area|outdoor seating|indoor dining area|"
    r"lugar|lokasyon|pwesto|paligid|kapaligiran|tanawin|"
    r"kalsada|baybayin|bundok|ilog|lawa|lungsod|bayan|paradahan"
    r")\b",
    re.IGNORECASE,
)
_DIGITAL_WORLD_CONTEXT = re.compile(
    r"\b(?:game world|game's world|in[- ]game|game environment|"
    r"virtual world|virtual environment|digital environment|gameplay)\b",
    re.IGNORECASE,
)
_EXPLICIT_REAL_WORLD_CUE = re.compile(
    r"\b(?:physical|real[- ]world|in real life|actual|irl)\b",
    re.IGNORECASE,
)
_NEGATED_EVIDENCE_PREFIX = re.compile(
    r"\b(?:no|not|without|lack(?:s|ing)?|does not have|doesn't have|"
    r"is not|isn't)\s+(?:any\s+|a\s+|the\s+)?$",
    re.IGNORECASE,
)


def normalize_platform(platform: str | None) -> str | None:
    """Normalize supported platform identifiers while preserving unknowns."""
    if not isinstance(platform, str) or not platform.strip():
        return None

    normalized = platform.strip().lower().replace("_", " ").replace("-", " ")
    normalized = " ".join(normalized.split())
    aliases = {
        "google": "google maps",
        "google reviews": "google maps",
        "maps": "google maps",
        "google play": "google play store",
        "googleplay": "google play store",
    }
    return aliases.get(normalized, normalized)


def has_transaction_evidence(review_text: str) -> bool:
    """Return whether review text explicitly mentions a transaction concept."""
    return bool(_TRANSACTION_EVIDENCE.search(review_text))


def has_physical_location_evidence(
    review_text: str,
    platform: str | None = None,
) -> bool:
    """Require a concrete physical-place cue; generic game atmosphere is insufficient."""
    normalized_platform = normalize_platform(platform)
    if (
        normalized_platform == "steam"
        and _DIGITAL_WORLD_CONTEXT.search(review_text)
        and not _EXPLICIT_REAL_WORLD_CUE.search(review_text)
    ):
        return False

    for match in _PHYSICAL_PLACE_EVIDENCE.finditer(review_text):
        preceding_text = review_text[max(0, match.start() - 40):match.start()]
        if not _NEGATED_EVIDENCE_PREFIX.search(preceding_text):
            return True
    return False


def is_topic_applicable_for_platform(
    topic_label: str,
    platform: str | None,
    review_text: str,
) -> bool:
    """Check only the two topics with established platform applicability rules."""
    normalized_platform = normalize_platform(platform)

    if topic_label == ENVIRONMENT_LOCATION:
        if normalized_platform == "google maps":
            return True
        if normalized_platform in {
            "shopee",
            "lazada",
            "google play store",
            "steam",
        }:
            return has_physical_location_evidence(review_text, normalized_platform)

    if topic_label == DELIVERY_TRANSACTION:
        if normalized_platform in {
            "google maps",
            "google play store",
            "steam",
        }:
            return has_transaction_evidence(review_text)

    return True


def apply_platform_applicability(
    selected_topics: list[dict[str, Any]],
    review_text: str,
    platform: str | None,
) -> list[dict[str, Any]]:
    """Suppress only inapplicable selected topics; do not rerank or backfill."""
    return [
        topic
        for topic in selected_topics
        if is_topic_applicable_for_platform(
            topic["label"],
            platform,
            review_text,
        )
    ]
