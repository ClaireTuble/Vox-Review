import { filterPriorityReviews, filterReviewEntriesByEmotion } from './priorityEngine.js';

export function getReviewIntegrityState(
  originalIndex,
  quote,
  reviewIntegrityAssessment,
  isRiaEnabled,
  suspiciousDetection,
  isQualityCheckComplete,
) {
  const reviewIndex = Number.isSafeInteger(quote?.sourceReviewIndex)
    ? quote.sourceReviewIndex
    : originalIndex;
  const duplicateResult = Array.isArray(suspiciousDetection?.results)
    ? suspiciousDetection.results.find((result) => (
        (result.reviewIndex ?? result.index) === reviewIndex
      )) || suspiciousDetection.results[reviewIndex]
    : null;
  const isExactDupe = Boolean(
    isQualityCheckComplete &&
    (duplicateResult?.label === 'Repeated Review' ||
      quote?.suspiciousReviewLabel === 'Repeated Review')
  );

  const riaResult = Array.isArray(reviewIntegrityAssessment)
    ? reviewIntegrityAssessment.find((result) => (
        (result.reviewIndex ?? result.index) === reviewIndex
      )) || reviewIntegrityAssessment[reviewIndex]
    : null;
  const isRiaEvaluated = Boolean(
    isRiaEnabled &&
    Array.isArray(reviewIntegrityAssessment) &&
    reviewIntegrityAssessment.length > 0 &&
    riaResult != null
  );
  const isPatternFlagged = Boolean(
    isRiaEvaluated &&
    (
      riaResult?.assessmentStatus === 'Patterns Detected' ||
      (Array.isArray(riaResult?.triggeredRules) && riaResult.triggeredRules.length > 0)
    ) &&
    riaResult?.assessmentStatus !== 'Unable to Assess'
  );
  const isUnableToAssess = Boolean(
    isRiaEvaluated && riaResult?.assessmentStatus === 'Unable to Assess'
  );
  const isNoPatternDetected = Boolean(
    isRiaEvaluated &&
    !isPatternFlagged &&
    !isUnableToAssess &&
    (
      riaResult?.assessmentStatus === 'No Selected Patterns Detected' ||
      riaResult?.assessmentStatus === 'No Patterns Detected' ||
      riaResult?.assessmentStatus === 'Clear' ||
      (Array.isArray(riaResult?.triggeredRules) && riaResult.triggeredRules.length === 0)
    )
  );
  const isNotAssessed = !isRiaEvaluated && !isQualityCheckComplete;
  const triggeredRuleIds = isPatternFlagged && Array.isArray(riaResult?.triggeredRules)
    ? riaResult.triggeredRules.map((rule) => rule.id).filter(Boolean)
    : [];
  const triggeredRuleDescriptions = isPatternFlagged && Array.isArray(riaResult?.triggeredRules)
    ? riaResult.triggeredRules
      .map((rule) => `${rule.id}: ${rule.plainName || rule.explanation || ''}`)
      .join('\n')
    : '';

  return {
    isExactDupe,
    isPatternFlagged,
    isNoPatternDetected,
    isUnableToAssess,
    isNotAssessed,
    triggeredRuleIds,
    triggeredRuleDescriptions,
    assessmentReason: riaResult?.assessmentReason || null,
  };
}

export function filterReviewEvidenceEntries(
  entries,
  { emotion = 'all', priority = 'all', integrity = 'all' } = {},
  getIntegrity = () => ({}),
) {
  const emotionFilteredEntries = filterReviewEntriesByEmotion(
    filterPriorityReviews(entries, priority),
    emotion,
  );
  if (integrity === 'all') return emotionFilteredEntries;

  return emotionFilteredEntries.filter((entry) => {
    const state = getIntegrity(entry);
    if (integrity === 'flagged') {
      return state.isPatternFlagged || state.isExactDupe;
    }
    if (integrity === 'not_flagged') {
      return state.isNoPatternDetected && !state.isExactDupe;
    }
    if (integrity === 'unable') {
      return state.isUnableToAssess;
    }
    return false;
  });
}
