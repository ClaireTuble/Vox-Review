import { getReviewText } from './reviewTopics.js';
import { sanitizeReviewText } from '../../services/privacyRedaction.js';
export {
  filterEligibleReviewEntries,
  isReviewEligibleForAggregates,
} from './reviewAggregateEligibility.js';

export const REPEATED_REVIEW_LABEL = 'Repeated Review';
export const LEGACY_SUSPICIOUS_LABEL = 'Potentially Suspicious Review';

export const SUSPICIOUS_REVIEW_LABELS = Object.freeze([
  'Likely Authentic',
  REPEATED_REVIEW_LABEL,
  LEGACY_SUSPICIOUS_LABEL,
  'Needs Manual Review',
]);

const VALID_LABELS = new Set(SUSPICIOUS_REVIEW_LABELS);
const RESULT_STATUS = 'classified';
const DEFAULT_TIMEOUT_MS = 10_000;
const DUPLICATE_REVIEW_REASON = 'This exact review text appears more than once in this analysis.';

function normalizeReviewText(text) {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

export async function detectRepeatedReviewText(indexedReviews, { signal } = {}) {
  if (!Array.isArray(indexedReviews)) {
    throw new TypeError('Detector input must be an array.');
  }

  const counts = new Map();
  for (const review of indexedReviews) {
    if (signal?.aborted) {
      throw Object.assign(new Error('Detector was cancelled.'), { name: 'AbortError' });
    }
    if (!Number.isInteger(review?.reviewIndex) || typeof review.text !== 'string') {
      throw new TypeError('Detector input contains an invalid review.');
    }
    const normalizedText = normalizeReviewText(review.text);
    counts.set(normalizedText, (counts.get(normalizedText) || 0) + 1);
  }

  return {
    status: 'complete',
    results: indexedReviews.map(({ reviewIndex, text }) => {
      const repeated = counts.get(normalizeReviewText(text)) > 1;
      return {
        reviewIndex,
        label: repeated ? REPEATED_REVIEW_LABEL : 'Likely Authentic',
        score: repeated ? 0.95 : 0.5,
        status: RESULT_STATUS,
        ...(repeated ? { reason: DUPLICATE_REVIEW_REASON } : {}),
      };
    }),
  };
}

function unavailableResult(status, reason) {
  return {
    status,
    reason,
    evaluatedCount: 0,
    results: [],
  };
}

export function validateSuspiciousReviewResponse(response, expectedReviewCount) {
  if (!response || response.status !== 'complete' || !Array.isArray(response.results) ||
      response.results.length !== expectedReviewCount) {
    throw new Error('Detector returned an incomplete or invalid response.');
  }

  const resultsByIndex = new Map();
  for (const result of response.results) {
    if (!Number.isInteger(result?.reviewIndex) ||
        result.reviewIndex < 0 ||
        result.reviewIndex >= expectedReviewCount ||
        resultsByIndex.has(result.reviewIndex) ||
        result.status !== RESULT_STATUS ||
        !VALID_LABELS.has(result.label) ||
        typeof result.score !== 'number' ||
        !Number.isFinite(result.score) ||
        result.score < 0 ||
        result.score > 1 ||
        (result.reason !== undefined &&
          (typeof result.reason !== 'string' || !result.reason.trim() || result.reason.length > 200))) {
      throw new Error('Detector returned a misaligned or invalid review result.');
    }
    resultsByIndex.set(result.reviewIndex, {
      reviewIndex: result.reviewIndex,
      label: result.label,
      score: result.score,
      status: result.status,
      ...(result.reason === undefined ? {} : { reason: result.reason }),
    });
  }

  if (resultsByIndex.size !== expectedReviewCount) {
    throw new Error('Detector did not return one result for every review.');
  }

  return {
    status: 'complete',
    reason: null,
    evaluatedCount: expectedReviewCount,
    results: Array.from({ length: expectedReviewCount }, (_, reviewIndex) => (
      resultsByIndex.get(reviewIndex)
    )),
  };
}

export async function runSuspiciousReviewCheck(reviews, {
  enabled = false,
  detector = detectRepeatedReviewText,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
} = {}) {
  if (!enabled) return unavailableResult('disabled', 'not_enabled');
  if (typeof detector !== 'function') {
    return unavailableResult('unavailable', 'detector_not_configured');
  }
  if (!Array.isArray(reviews) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    return unavailableResult('invalid', 'invalid_request');
  }

  let indexedReviews;
  try {
    indexedReviews = reviews.map((review, reviewIndex) => ({
      reviewIndex,
      text: sanitizeReviewText(getReviewText(review)),
    }));
  } catch {
    return unavailableResult('invalid', 'invalid_review_text');
  }
  if (indexedReviews.some(({ text }) => !text)) {
    return unavailableResult('invalid', 'empty_review_text');
  }
  if (signal?.aborted) return unavailableResult('unavailable', 'cancelled');

  const controller = new AbortController();
  let rejectCallerAbort;
  const callerCancelled = new Promise((_, reject) => {
    rejectCallerAbort = reject;
  });
  const abortFromCaller = () => {
    controller.abort(signal.reason);
    rejectCallerAbort(Object.assign(new Error('Detector was cancelled.'), { name: 'AbortError' }));
  };
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  let timeoutId;
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => detector(indexedReviews, { signal: controller.signal })),
      ...(signal ? [callerCancelled] : []),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('Detector timed out.'), { code: 'ETIMEDOUT' }));
        }, timeoutMs);
      }),
    ]);
    return validateSuspiciousReviewResponse(response, reviews.length);
  } catch (error) {
    if (error?.code === 'ETIMEDOUT') {
      return unavailableResult('unavailable', 'timeout');
    }
    if (signal?.aborted) return unavailableResult('unavailable', 'cancelled');
    if (/invalid|misaligned|incomplete|one result/i.test(error?.message || '')) {
      return unavailableResult('invalid', 'invalid_response');
    }
    return unavailableResult('unavailable', 'detector_error');
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function getCombinedReviewAggregateEligibilityMask({
  reviewCount,
  detectorResult = null,
  reviewIntegrityAssessment = null,
  excludeFlagged = false,
  reviewIntegrityEnabled = true,
}) {
  if (!Number.isSafeInteger(reviewCount) || reviewCount < 0) {
    throw new RangeError('reviewCount must be a non-negative integer.');
  }
  const included = Array(reviewCount).fill(true);
  if (!excludeFlagged) {
    return included;
  }

  // Exact Repeated-Text Check: only exclude if completed
  if (detectorResult?.status === 'complete' &&
      Array.isArray(detectorResult.results) &&
      detectorResult.results.length === reviewCount) {
    let validated;
    try {
      validated = validateSuspiciousReviewResponse(detectorResult, reviewCount);
    } catch {
      validated = null;
    }
    if (validated) {
      validated.results.forEach((result, index) => {
        if (result.label === REPEATED_REVIEW_LABEL) {
          included[index] = false;
        }
      });
    }
  }

  // Review Integrity Assessment (Pattern Flags): only exclude if completed and enabled
  const riaResults = Array.isArray(reviewIntegrityAssessment)
    ? reviewIntegrityAssessment
    : Array.isArray(reviewIntegrityAssessment?.results)
      ? reviewIntegrityAssessment.results
      : null;

  if (reviewIntegrityEnabled !== false &&
      Array.isArray(riaResults) &&
      riaResults.length === reviewCount) {
    riaResults.forEach((r, index) => {
      const idx = Number.isSafeInteger(r?.reviewIndex) && r.reviewIndex >= 0 && r.reviewIndex < reviewCount
        ? r.reviewIndex
        : index;
      const isPatternFlagged = r?.assessmentStatus === 'Patterns Detected' ||
        (Array.isArray(r?.triggeredRules) && r.triggeredRules.length > 0);
      if (isPatternFlagged && r?.assessmentStatus !== 'Unable to Assess') {
        included[idx] = false;
      }
    });
  }

  return included;
}

export function getReviewAggregateEligibilityMask(
  reviewCount,
  detectorResult,
  excludeDuplicates = false,
  reviewIntegrityAssessment = null,
  reviewIntegrityEnabled = true,
) {
  return getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult,
    reviewIntegrityAssessment,
    excludeFlagged: excludeDuplicates,
    reviewIntegrityEnabled,
  });
}

export function getEmotionInclusionMask(
  reviewCount,
  detectorResult,
  excludeDuplicates = false,
  reviewIntegrityAssessment = null,
  reviewIntegrityEnabled = true,
) {
  return getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult,
    reviewIntegrityAssessment,
    excludeFlagged: excludeDuplicates,
    reviewIntegrityEnabled,
  });
}

export function associateSuspiciousReviewResults(reviews, detectorResult) {
  let validated = null;
  if (detectorResult?.status === 'complete' && Array.isArray(reviews)) {
    try {
      validated = validateSuspiciousReviewResponse(detectorResult, reviews.length);
    } catch {
      validated = null;
    }
  }
  return Array.isArray(reviews)
    ? reviews.map((review, reviewIndex) => ({
        review,
        result: validated?.results[reviewIndex] || null,
      }))
    : [];
}

export function summarizeEmotionPredictions(predictions, inclusionMask = null) {
  if (!Array.isArray(predictions) ||
      (inclusionMask !== null &&
        (!Array.isArray(inclusionMask) || inclusionMask.length !== predictions.length))) {
    throw new TypeError('Emotion predictions and inclusion mask must be aligned arrays.');
  }

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  predictions.forEach((category, index) => {
    if (inclusionMask && !inclusionMask[index]) return;
    if (!Object.hasOwn(counts, category)) {
      throw new RangeError('Emotion prediction contains an invalid category.');
    }
    counts[category] += 1;
  });
  const totalReviews = Object.values(counts).reduce((total, count) => total + count, 0);
  const percentages = Object.fromEntries(
    Object.entries(counts).map(([category, count]) => [
      category,
      totalReviews ? Math.round((count / totalReviews) * 100) : 0,
    ]),
  );
  const dominantCategory = Number(
    Object.keys(counts).sort((first, second) => counts[second] - counts[first])[0],
  );
  return { counts, percentages, totalReviews, dominantCategory };
}
