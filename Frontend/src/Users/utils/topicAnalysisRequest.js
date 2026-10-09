import { API_BASE_URL } from '../../services/apiConfig.js';

export const TOPIC_ANALYSIS_PATH = '/api/nlp/topics/predict';
export const TOPIC_REQUEST_TIMEOUT_BASE_MS = 180_000;
export const TOPIC_REQUEST_TIMEOUT_PER_REVIEW_MS = 12_000;
let nextTopicRequestSequence = 0;

export function getTopicReviewSetSignature(reviews) {
  const texts = Array.isArray(reviews)
    ? reviews.map((review) => (
        typeof review === 'string'
          ? review
          : review?.text || review?.reviewText || review?.comment || review?.review || ''
      ))
    : [];
  const serialized = JSON.stringify(texts);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${texts.length}-${hash.toString(16).padStart(16, '0')}`;
}

export function createTopicAnalysisRequestCoordinator({
  request = requestTopicAnalysis,
  maxCachedResults = 50,
} = {}) {
  const pending = new Map();
  const successful = new Map();
  let nextRequestId = 0;

  return {
    request(reviews, platform, {
      pageKey,
      requestContext = 'unspecified',
      operation = 'classify',
      signal,
      force = false,
    } = {}) {
      if (!pageKey || !Array.isArray(reviews) ||
        !['classify', 'keyword-scores'].includes(operation)) {
        return Promise.reject(new Error('Topic analysis requires a page key and review list.'));
      }
      const reviewSetSignature = getTopicReviewSetSignature(reviews);
      const identity = `${operation}\u001f${pageKey}\u001f${reviewSetSignature}`;
      if (!force && successful.has(identity)) {
        const result = successful.get(identity);
        successful.delete(identity);
        successful.set(identity, result);
        console.info('VoxReview: Topic analysis request reused a successful result.', {
          pageKey,
          reviewCount: reviews.length,
          reviewSetSignature,
          operation,
          requestContext,
          outcome: 'cached',
        });
        return Promise.resolve(result);
      }
      if (pending.has(identity)) {
        const pendingRequest = pending.get(identity);
        console.info('VoxReview: Duplicate topic analysis request joined an in-flight request.', {
          requestId: pendingRequest.requestId,
          pageKey,
          reviewCount: reviews.length,
          reviewSetSignature,
          operation,
          requestContext,
          outcome: 'deduplicated',
        });
        return pendingRequest.promise;
      }

      const requestId = `topic-${Date.now()}-${++nextRequestId}`;
      const startedAt = Date.now();
      console.info('VoxReview: Topic analysis request started.', {
        requestId,
        pageKey,
        reviewCount: reviews.length,
        reviewSetSignature,
        operation,
        requestContext,
      });
      const requestPromise = Promise.resolve()
        .then(() => request(reviews, platform, {
          operation,
          signal,
          requestContext,
          pageKey,
          force,
          clientRequestId: requestId,
        }))
        .then((result) => {
          successful.set(identity, result);
          while (successful.size > maxCachedResults) {
            successful.delete(successful.keys().next().value);
          }
          console.info('VoxReview: Topic analysis request completed.', {
            requestId,
            pageKey,
            reviewCount: reviews.length,
            reviewSetSignature,
            operation,
            requestContext,
            durationMs: Date.now() - startedAt,
            outcome: 'success',
          });
          return result;
        }, (error) => {
          console.warn('VoxReview: Topic analysis request completed.', {
            requestId,
            pageKey,
            reviewCount: reviews.length,
            reviewSetSignature,
            operation,
            requestContext,
            durationMs: Date.now() - startedAt,
            httpStatus: error?.httpStatus ?? null,
            code: safeErrorCode(error?.code),
            outcome: 'failure',
          });
          throw error;
        })
        .finally(() => pending.delete(identity));
      pending.set(identity, { requestId, promise: requestPromise });
      return requestPromise;
    },
  };
}

export function getTopicRequestTimeoutMs(reviewCount) {
  return TOPIC_REQUEST_TIMEOUT_BASE_MS + reviewCount * TOPIC_REQUEST_TIMEOUT_PER_REVIEW_MS;
}

export function createTopicRequestTimeout(controller, reviewCount, {
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const timeoutMs = getTopicRequestTimeoutMs(reviewCount);
  const timer = setTimer(
    () => controller.abort(new DOMException('Topic analysis request timed out.', 'TimeoutError')),
    timeoutMs,
  );
  return {
    timeoutMs,
    clear: () => clearTimer(timer),
  };
}

const VALID_TOPIC_LABELS = new Set([
  'Quality', 'Performance / Functionality', 'Features / Content', 'Service / Support',
  'Delivery / Transaction', 'Price / Value', 'Usability / Experience',
  'Accuracy / Expectations', 'Availability / Accessibility', 'Environment / Location', 'Other / General',
]);

export function getTopicAnalysisUrl(apiBaseUrl = API_BASE_URL) {
  return `${apiBaseUrl.replace(/\/+$/, '')}${TOPIC_ANALYSIS_PATH}`;
}

function hasValidTopicResponse(payload, expectedReviewCount) {
  return Array.isArray(payload?.results) &&
    payload.results.length === expectedReviewCount &&
    payload.results.every((result, index) => (
      (result?.reviewIndex == null || result.reviewIndex === index) &&
      Array.isArray(result?.topics) && result.topics.every((topic) => (
        VALID_TOPIC_LABELS.has(topic?.label) &&
        typeof topic.score === 'number' &&
        Number.isFinite(topic.score)
      ))
    ));
}

function hasValidTopicKeywordScoreResponse(payload, expectedReviewCount) {
  return Array.isArray(payload?.results) &&
    payload.results.length === expectedReviewCount &&
    payload.results.every((result, index) => (
      result?.reviewIndex === index &&
      Array.isArray(result?.topicScores) &&
      result.topicScores.length === VALID_TOPIC_LABELS.size &&
      new Set(result.topicScores.map((topic) => topic?.label)).size === VALID_TOPIC_LABELS.size &&
      result.topicScores.every((topic) => (
        VALID_TOPIC_LABELS.has(topic?.label) &&
        typeof topic.score === 'number' &&
        Number.isFinite(topic.score)
      ))
    ));
}

function safeErrorCode(value) {
  const code = String(value || '');
  return /^[A-Za-z0-9_-]{1,100}$/.test(code) ? code : null;
}

export async function requestTopicAnalysis(
  reviews,
  platform,
  {
    fetchImpl = globalThis.fetch,
    signal,
    apiBaseUrl = API_BASE_URL,
    requestContext = 'unspecified',
    clientRequestId = `topic-client-${Date.now()}-${++nextTopicRequestSequence}`,
    pageKey = null,
    force = false,
    operation = 'classify',
  } = {},
) {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const platformKey = ({
    'google reviews': 'google',
    'google play': 'googleplay',
  })[normalizedPlatform] || normalizedPlatform;
  const url = getTopicAnalysisUrl(apiBaseUrl);
  const requestStartedAt = Date.now();
  let response = null;
  let payload = null;

  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VoxReview-Request-Context': /^[a-z][a-z0-9-]{0,79}$/.test(requestContext)
          ? requestContext
          : 'unspecified',
        'X-VoxReview-Client-Request-Id': /^[A-Za-z0-9_-]{1,100}$/.test(clientRequestId)
          ? clientRequestId
          : 'topic-client-invalid',
        ...(typeof pageKey === 'string' && pageKey.length <= 500
          ? { 'X-VoxReview-Page-Key': pageKey }
          : {}),
        ...(force ? { 'X-VoxReview-Force-Refresh': 'true' } : {}),
      },
      body: JSON.stringify({
        reviews,
        platform: platformKey,
        ...(operation === 'classify' ? {} : { operation }),
      }),
      signal,
    });
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error('Topic analysis returned a non-JSON response.', { cause: error });
    }

    const validResults = operation === 'keyword-scores'
      ? hasValidTopicKeywordScoreResponse(payload, reviews.length)
      : hasValidTopicResponse(payload, reviews.length);
    if (!['classify', 'keyword-scores'].includes(operation) ||
      !response.ok || !payload?.success || !validResults) {
      const error = new Error(
        payload?.message || payload?.error || 'Topic analysis returned an invalid response.',
      );
      error.code = safeErrorCode(payload?.error);
      error.httpStatus = response.status;
      throw error;
    }
    console.info('VoxReview: Topic analysis transport completed.', {
      clientRequestId,
      requestContext,
      httpStatus: response.status,
      durationMs: Date.now() - requestStartedAt,
      reviewCount: reviews.length,
      resultCount: payload.results.length,
      operation,
      outcome: 'success',
    });
    return payload;
  } catch (error) {
    if (error && typeof error === 'object' && error.httpStatus == null && response) {
      error.httpStatus = response.status;
    }
    const details = error?.name === 'TimeoutError' || signal?.reason?.name === 'TimeoutError'
      ? 'timeout'
      : error?.name === 'AbortError'
        ? 'aborted'
      : response && !response.ok
        ? 'http_error'
        : response
          ? 'invalid_or_unreadable_response'
          : 'network_error';
    console.warn('VoxReview: Topic analysis request failed.', {
      endpoint: url,
      requestContext,
      clientRequestId,
      durationMs: Date.now() - requestStartedAt,
      abortSource: signal?.reason?.name === 'TimeoutError'
        ? 'request_timeout'
        : signal?.aborted
          ? 'caller_cancelled'
          : null,
      httpStatus: error?.httpStatus ?? response?.status ?? null,
      code: safeErrorCode(error?.code || payload?.error),
      details,
      reviewCount: Array.isArray(reviews) ? reviews.length : 0,
      operation,
    });
    throw error;
  }
}
