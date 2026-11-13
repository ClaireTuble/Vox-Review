import { DEFAULT_RIA_RULE_IDS, ALL_RIA_RULE_IDS } from './reviewIntegrityAssessment.js';
import { getTopicReviewSetSignature } from './topicAnalysisRequest.js';
import { sanitizeReviewText } from '../../services/privacyRedaction.js';

export const REVIEW_SCREENING_METADATA_SCHEMA_VERSION = 1;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getScreeningReviewSetSignature(reviews) {
  const sanitizedTexts = reviews.map((review) => {
    const text = typeof review === 'string'
      ? review
      : review?.text || review?.reviewText || review?.comment || review?.review || '';
    return sanitizeReviewText(text);
  });
  return getTopicReviewSetSignature(sanitizedTexts);
}

export function createReviewScreeningMetadata({
  reviews,
  emotionData,
  reviewIntegrityAssessment,
  reviewIntegrityEnabled,
  enabledRiaRuleIds,
  duplicateCheckEnabled,
  excludeDuplicatesFromAggregates,
  pageKey,
}) {
  if (!Array.isArray(reviews)) return undefined;
  const reviewSetSignature = getScreeningReviewSetSignature(reviews);
  const quotes = Array.isArray(emotionData?.quotes) ? emotionData.quotes : [];
  const duplicateResults = quotes.flatMap((quote, index) => {
    const reviewIndex = Number.isSafeInteger(quote?.sourceReviewIndex)
      ? quote.sourceReviewIndex
      : Number.isSafeInteger(quote?.topicResultIndex)
        ? quote.topicResultIndex
        : index;
    if (reviewIndex >= reviews.length || typeof quote?.suspiciousReviewLabel !== 'string') return [];
    return [{
      reviewIndex,
      label: quote.suspiciousReviewLabel,
      ...(Number.isFinite(quote.suspiciousReviewScore)
        ? { score: quote.suspiciousReviewScore }
        : {}),
      ...(typeof quote.suspiciousReviewReason === 'string'
        ? { reason: quote.suspiciousReviewReason }
        : {}),
      ...(typeof quote.aggregateEligible === 'boolean'
        ? { aggregateEligible: quote.aggregateEligible }
        : {}),
    }];
  });
  const selectedRuleIds = Array.isArray(enabledRiaRuleIds)
    ? enabledRiaRuleIds.filter((ruleId) => ALL_RIA_RULE_IDS.includes(ruleId))
    : [];
  const assessmentMatchesReviews =
    (!pageKey || reviewIntegrityAssessment?.pageKey === pageKey) &&
    reviewIntegrityAssessment?.reviewSetSignature === reviewSetSignature &&
    Array.isArray(reviewIntegrityAssessment.results) &&
    reviewIntegrityAssessment.results.length === reviews.length &&
    reviewIntegrityAssessment.results.every((result, index) => (
      result?.reviewIndex === index && Array.isArray(result.triggeredRules)
    ));

  return {
    schemaVersion: REVIEW_SCREENING_METADATA_SCHEMA_VERSION,
    reviewSetSignature,
    duplicateCheckEnabled: duplicateCheckEnabled === true,
    excludeDuplicatesFromAggregates: excludeDuplicatesFromAggregates === true,
    duplicateResults,
    ...(emotionData?.suspiciousReviewDetection
      ? { duplicateDetection: emotionData.suspiciousReviewDetection }
      : {}),
    reviewIntegrity: {
      enabled: reviewIntegrityEnabled === true,
      enabledRuleIds: selectedRuleIds.length > 0 ? selectedRuleIds : [...DEFAULT_RIA_RULE_IDS],
      ...(assessmentMatchesReviews
        ? { results: reviewIntegrityAssessment.results }
        : {}),
    },
  };
}

export function restoreReviewScreeningMetadata(metadata, reviews) {
  if (!isRecord(metadata) ||
      metadata.schemaVersion !== REVIEW_SCREENING_METADATA_SCHEMA_VERSION ||
      !Array.isArray(reviews) ||
      metadata.reviewSetSignature !== getScreeningReviewSetSignature(reviews) ||
      !isRecord(metadata.reviewIntegrity) ||
      typeof metadata.reviewIntegrity.enabled !== 'boolean' ||
      !Array.isArray(metadata.reviewIntegrity.enabledRuleIds) ||
      metadata.reviewIntegrity.enabledRuleIds.length === 0 ||
      metadata.reviewIntegrity.enabledRuleIds.some((ruleId) => !ALL_RIA_RULE_IDS.includes(ruleId)) ||
      !Array.isArray(metadata.duplicateResults)) {
    return null;
  }

  const duplicateResults = new Map();
  for (const result of metadata.duplicateResults) {
    if (!isRecord(result) ||
        !Number.isSafeInteger(result.reviewIndex) ||
        result.reviewIndex < 0 ||
        result.reviewIndex >= reviews.length ||
        typeof result.label !== 'string' ||
        duplicateResults.has(result.reviewIndex)) {
      return null;
    }
    duplicateResults.set(result.reviewIndex, result);
  }

  let reviewIntegrityResults = null;
  if (metadata.reviewIntegrity.results !== undefined) {
    if (!Array.isArray(metadata.reviewIntegrity.results) ||
        metadata.reviewIntegrity.results.length !== reviews.length ||
        metadata.reviewIntegrity.results.some((result, index) => (
          !isRecord(result) ||
          result.reviewIndex !== index ||
          !Array.isArray(result.triggeredRules)
        ))) {
      return null;
    }
    reviewIntegrityResults = metadata.reviewIntegrity.results;
  }

  return {
    reviewSetSignature: metadata.reviewSetSignature,
    duplicateCheckEnabled: metadata.duplicateCheckEnabled === true,
    excludeDuplicatesFromAggregates: metadata.excludeDuplicatesFromAggregates === true,
    duplicateDetection: isRecord(metadata.duplicateDetection)
      ? metadata.duplicateDetection
      : null,
    duplicateResults,
    reviewIntegrity: {
      enabled: metadata.reviewIntegrity.enabled,
      enabledRuleIds: [...metadata.reviewIntegrity.enabledRuleIds],
      results: reviewIntegrityResults,
    },
  };
}

export function applyReviewScreeningMetadata(quotes, metadata, {
  excludeDuplicatesFromAggregates = false,
  excludeFlaggedFromEmotion = false,
} = {}) {
  if (!Array.isArray(quotes)) return [];
  const shouldExclude = excludeDuplicatesFromAggregates || excludeFlaggedFromEmotion;
  const riaResults = Array.isArray(metadata?.reviewIntegrity?.results)
    ? metadata.reviewIntegrity.results
    : null;
  return quotes.map((quote, index) => {
    const reviewIndex = Number.isSafeInteger(quote?.sourceReviewIndex)
      ? quote.sourceReviewIndex
      : Number.isSafeInteger(quote?.topicResultIndex)
        ? quote.topicResultIndex
        : index;
    const result = metadata?.duplicateResults?.get(reviewIndex);
    const riaItem = riaResults?.[reviewIndex];
    const isRiaFlagged = riaItem?.assessmentStatus === 'Patterns Detected' ||
      (Array.isArray(riaItem?.triggeredRules) && riaItem.triggeredRules.length > 0);
    const isExactDupe = (result?.label || quote?.suspiciousReviewLabel) === 'Repeated Review';
    const aggregateEligible = typeof result?.aggregateEligible === 'boolean'
      ? result.aggregateEligible
      : typeof quote?.aggregateEligible === 'boolean'
        ? quote.aggregateEligible
        : !(shouldExclude && (isExactDupe || isRiaFlagged));
    if (!result && aggregateEligible === quote?.aggregateEligible) return quote;
    return {
      ...quote,
      ...(result ? { suspiciousReviewLabel: result.label } : {}),
      ...(Number.isFinite(result?.score) ? { suspiciousReviewScore: result.score } : {}),
      ...(typeof result?.reason === 'string' ? { suspiciousReviewReason: result.reason } : {}),
      aggregateEligible,
    };
  });
}
