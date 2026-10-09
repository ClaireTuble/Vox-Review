import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTopicAnalysisRequestCoordinator,
  createTopicRequestTimeout,
  getTopicAnalysisUrl,
  getTopicReviewSetSignature,
  getTopicRequestTimeoutMs,
  requestTopicAnalysis,
} from './topicAnalysisRequest.js';

test('deduplicates identical page review sets and reuses only successful results', async () => {
  let calls = 0;
  let resolveRequest;
  const result = { success: true, results: [{ topics: [] }, { topics: [] }] };
  const coordinator = createTopicAnalysisRequestCoordinator({
    request: () => {
      calls += 1;
      return calls === 1
        ? new Promise((resolve) => { resolveRequest = resolve; })
        : Promise.resolve(result);
    },
  });
  const reviews = ['Review A', 'Review B'];
  const first = coordinator.request(reviews, 'shopee', {
    pageKey: 'shopee:i.123.456',
    requestContext: 'popup-restore',
  });
  const duplicate = coordinator.request(reviews, 'shopee', {
    pageKey: 'shopee:i.123.456',
    requestContext: 'background-analysis',
  });

  assert.equal(calls, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(getTopicReviewSetSignature(reviews), getTopicReviewSetSignature([...reviews]));
  resolveRequest(result);
  assert.equal(await first, result);
  assert.equal(await duplicate, result);

  assert.equal(await coordinator.request(reviews, 'shopee', {
    pageKey: 'shopee:i.123.456',
    requestContext: 'popup-retry',
  }), result);
  assert.equal(calls, 1);

  await coordinator.request(reviews, 'shopee', { pageKey: 'shopee:i.999.888' });
  assert.equal(calls, 2);
  await coordinator.request(['Review A', 'Changed review'], 'shopee', {
    pageKey: 'shopee:i.123.456',
  });
  assert.equal(calls, 3);
});

test('a failed forced refresh leaves its previous successful result reusable', async () => {
  let calls = 0;
  const result = { success: true, results: [{ topics: [] }] };
  const coordinator = createTopicAnalysisRequestCoordinator({
    request: async (_reviews, _platform, { force }) => {
      calls += 1;
      if (force) throw Object.assign(new Error('temporary failure'), { httpStatus: 503 });
      return result;
    },
  });
  const identity = { pageKey: 'google:place:sample' };

  assert.equal(await coordinator.request(['review'], 'google', identity), result);
  await assert.rejects(
    coordinator.request(['review'], 'google', { ...identity, force: true }),
    { httpStatus: 503 },
  );
  assert.equal(await coordinator.request(['review'], 'google', identity), result);
  assert.equal(calls, 2);
});

test('a failed request with no cached success can be retried', async () => {
  let calls = 0;
  const result = { success: true, results: [{ topics: [] }] };
  const coordinator = createTopicAnalysisRequestCoordinator({
    request: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('temporary failure'), { httpStatus: 503 });
      return result;
    },
  });
  const options = { pageKey: 'steam:app/123' };

  await assert.rejects(coordinator.request(['review'], 'steam', options), { httpStatus: 503 });
  assert.equal(await coordinator.request(['review'], 'steam', options), result);
  assert.equal(calls, 2);
});

test('coordinator diagnostics include safe request identity, operation, status, and failure reason', async () => {
  const originalWarn = console.warn;
  let warning;
  const coordinator = createTopicAnalysisRequestCoordinator({
    request: async () => {
      throw Object.assign(new Error('worker deadline exceeded'), {
        code: 'TOPIC_WORKER_TIMEOUT',
        httpStatus: 504,
      });
    },
  });
  console.warn = (...args) => { warning = args; };

  try {
    await assert.rejects(
      coordinator.request(['Private review text.'], 'steam', {
        pageKey: 'steam:app/123',
        operation: 'classify',
      }),
      { code: 'TOPIC_WORKER_TIMEOUT' },
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warning[1].requestId.startsWith('topic-'), true);
  assert.equal(warning[1].operation, 'classify');
  assert.equal(warning[1].status, 504);
  assert.equal(warning[1].failureReason, 'worker_timeout');
  assert.equal(JSON.stringify(warning).includes('Private review text.'), false);
});

test('classification and keyword-score operations do not collide in request deduplication', async () => {
  const operations = [];
  const coordinator = createTopicAnalysisRequestCoordinator({
    request: async (_reviews, _platform, { operation }) => {
      operations.push(operation);
      return { success: true, operation };
    },
  });
  const shared = { pageKey: 'google:place:sample' };

  const classification = coordinator.request(['same text'], 'google', shared);
  const keywordScores = coordinator.request(['same text'], 'google', {
    ...shared,
    operation: 'keyword-scores',
  });
  const duplicateKeywordScores = coordinator.request(['same text'], 'google', {
    ...shared,
    operation: 'keyword-scores',
  });

  assert.equal((await classification).operation, 'classify');
  assert.equal((await keywordScores).operation, 'keyword-scores');
  assert.equal((await duplicateKeywordScores).operation, 'keyword-scores');
  assert.deepEqual(operations, ['classify', 'keyword-scores']);
});

test('failed keyword scoring does not evict a successful classification result', async () => {
  let calls = 0;
  const classification = {
    success: true,
    results: [{ topics: [{ label: 'Quality', score: 0.8 }] }],
  };
  const coordinator = createTopicAnalysisRequestCoordinator({
    request: async (_reviews, _platform, { operation }) => {
      calls += 1;
      if (operation === 'keyword-scores') {
        throw Object.assign(new Error('keyword service unavailable'), { httpStatus: 503 });
      }
      return classification;
    },
  });
  const identity = { pageKey: 'google:place:sample' };

  assert.equal(await coordinator.request(['review'], 'google', identity), classification);
  await assert.rejects(coordinator.request(['review'], 'google', {
    ...identity,
    operation: 'keyword-scores',
  }), { httpStatus: 503 });
  assert.equal(await coordinator.request(['review'], 'google', identity), classification);
  assert.equal(calls, 2);
});

test('allows extra inference and queue time for a three-review topic request', () => {
  let triggerTimeout;
  let scheduledTimeout;
  const controller = new AbortController();
  const timeout = createTopicRequestTimeout(controller, 3, {
    setTimer(callback, delay) {
      triggerTimeout = callback;
      scheduledTimeout = delay;
      return 1;
    },
    clearTimer() {},
  });

  assert.equal(scheduledTimeout, 216_000);
  assert.equal(timeout.timeoutMs, 216_000);
  assert.equal(getTopicRequestTimeoutMs(3), 216_000);
  assert.equal(controller.signal.aborted, false);

  triggerTimeout();
  assert.equal(controller.signal.aborted, true);
  assert.equal(controller.signal.reason.name, 'TimeoutError');
});

test('uses the deployed topic route and sends the backend request contract', async () => {
  let requestedUrl;
  let requestOptions;
  const result = await requestTopicAnalysis(
    ['The checkout was simple.'],
    'Google Play',
    {
      apiBaseUrl: 'https://vox-review-production.up.railway.app/',
      requestContext: 'topic-keyword-scoring',
      clientRequestId: 'topic-123-1',
      pageKey: 'google:place:sample',
      fetchImpl: async (url, options) => {
        requestedUrl = url;
        requestOptions = options;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            model: 'intfloat/multilingual-e5-small',
            results: [{
              reviewIndex: 0,
              topics: [{ label: 'Usability / Experience', score: 0.82 }],
              topicScores: [{ label: 'Usability / Experience', score: 0.82 }],
            }],
          }),
        };
      },
    },
  );

  assert.equal(
    getTopicAnalysisUrl('https://vox-review-production.up.railway.app/'),
    'https://vox-review-production.up.railway.app/api/nlp/topics/predict',
  );
  assert.equal(requestedUrl, 'https://vox-review-production.up.railway.app/api/nlp/topics/predict');
  assert.deepEqual(JSON.parse(requestOptions.body), {
    reviews: ['The checkout was simple.'],
    platform: 'googleplay',
  });
  assert.equal(requestOptions.headers['X-VoxReview-Request-Context'], 'topic-keyword-scoring');
  assert.equal(requestOptions.headers['X-VoxReview-Client-Request-Id'], 'topic-123-1');
  assert.equal(requestOptions.headers['X-VoxReview-Page-Key'], 'google:place:sample');
  assert.equal(result.model, 'intfloat/multilingual-e5-small');
});

test('keyword scoring requests use the raw-score operation response shape', async () => {
  let requestOptions;
  const labels = [
    'Quality', 'Performance / Functionality', 'Features / Content',
    'Service / Support', 'Delivery / Transaction', 'Price / Value',
    'Usability / Experience', 'Accuracy / Expectations',
    'Availability / Accessibility', 'Environment / Location', 'Other / General',
  ];
  const result = await requestTopicAnalysis(
    ['candidate phrase'],
    'steam',
    {
      operation: 'keyword-scores',
      fetchImpl: async (_url, options) => {
        requestOptions = options;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            model: 'intfloat/multilingual-e5-small',
            results: [{
              reviewIndex: 0,
              topicScores: labels.map((label) => ({ label, score: 0.5 })),
            }],
          }),
        };
      },
    },
  );

  assert.equal(JSON.parse(requestOptions.body).operation, 'keyword-scores');
  assert.equal(result.results[0].topicScores.length, 11);
  assert.equal(result.results[0].topics, undefined);
});

test('an explicit forced refresh is forwarded to the backend cache boundary', async () => {
  let requestHeaders;
  await requestTopicAnalysis(['review'], 'shopee', {
    pageKey: 'shopee:i.123.456',
    force: true,
    fetchImpl: async (_url, options) => {
      requestHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, results: [{ reviewIndex: 0, topics: [] }] }),
      };
    },
  });

  assert.equal(requestHeaders['X-VoxReview-Page-Key'], 'shopee:i.123.456');
  assert.equal(requestHeaders['X-VoxReview-Force-Refresh'], 'true');
});

test('an empty topic assignment is a valid completed inference result', async () => {
  const result = await requestTopicAnalysis(['A review with no assigned topic.'], 'steam', {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        results: [{ reviewIndex: 0, topics: [] }],
      }),
    }),
  });

  assert.deepEqual(result.results[0].topics, []);
});

test('reports a failed HTTP status without logging request review text', async () => {
  const originalWarn = console.warn;
  let warning;
  console.warn = (...args) => { warning = args; };
  try {
    await assert.rejects(
      requestTopicAnalysis(
        ['Private review text that must not be logged.'],
        'steam',
        {
          apiBaseUrl: 'https://vox-review-production.up.railway.app',
          clientRequestId: 'steam-topic-503',
          operation: 'classify',
          fetchImpl: async () => ({
            ok: false,
            status: 503,
            json: async () => ({
              success: false,
              code: 'TOPIC_WORKER_UNAVAILABLE',
              message: 'The service is unavailable.',
            }),
          }),
        },
      ),
      (error) => error.httpStatus === 503 && error.code === 'TOPIC_WORKER_UNAVAILABLE',
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warning[1].httpStatus, 503);
  assert.equal(warning[1].status, 503);
  assert.equal(warning[1].requestId, 'steam-topic-503');
  assert.equal(warning[1].operation, 'classify');
  assert.equal(warning[1].failureReason, 'worker_unavailable');
  assert.equal(warning[1].details, 'http_error');
  assert.equal(warning[1].code, 'TOPIC_WORKER_UNAVAILABLE');
  assert.equal(JSON.stringify(warning).includes('Private review text'), false);
});

test('reports worker timeouts and response-shape mismatches as distinct failures', async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    for (const [status, code] of [
      [504, 'TOPIC_WORKER_TIMEOUT'],
      [502, 'TOPIC_WORKER_INVALID_RESPONSE'],
    ]) {
      await assert.rejects(
        requestTopicAnalysis(['A private Steam review.'], 'steam', {
          clientRequestId: `topic-${status}`,
          operation: 'classify',
          fetchImpl: async () => ({
            ok: false,
            status,
            json: async () => ({ success: false, code, error: 'Topic request failed.' }),
          }),
        }),
        (error) => error.httpStatus === status && error.code === code,
      );
    }
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings.map(([, diagnostic]) => ({
    requestId: diagnostic.requestId,
    operation: diagnostic.operation,
    status: diagnostic.status,
    failureReason: diagnostic.failureReason,
  })), [
    {
      requestId: 'topic-504',
      operation: 'classify',
      status: 504,
      failureReason: 'worker_timeout',
    },
    {
      requestId: 'topic-502',
      operation: 'classify',
      status: 502,
      failureReason: 'response_shape_mismatch',
    },
  ]);
  assert.equal(JSON.stringify(warnings).includes('A private Steam review.'), false);
});

test('reports intentional request cancellation separately from timeout', async () => {
  const originalWarn = console.warn;
  let warning;
  const controller = new AbortController();
  controller.abort(new DOMException('Analysis was replaced.', 'AbortError'));
  console.warn = (...args) => { warning = args; };

  try {
    await assert.rejects(
      requestTopicAnalysis(['A stale review.'], 'googleplay', {
        signal: controller.signal,
        requestContext: 'background-analysis',
        fetchImpl: async (_url, options) => {
          assert.equal(options.signal, controller.signal);
          throw new DOMException('The operation was aborted.', 'AbortError');
        },
      }),
      { name: 'AbortError' },
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warning[1].requestContext, 'background-analysis');
  assert.equal(warning[1].abortSource, 'caller_cancelled');
  assert.equal(warning[1].details, 'aborted');
});

test('reports request deadline expiry distinctly from intentional cancellation', async () => {
  const originalWarn = console.warn;
  let warning;
  let expireRequest;
  const controller = new AbortController();
  const timeout = createTopicRequestTimeout(controller, 3, {
    setTimer(callback) {
      expireRequest = callback;
      return 1;
    },
    clearTimer() {},
  });
  console.warn = (...args) => { warning = args; };

  try {
    const request = requestTopicAnalysis(['A review.'], 'googleplay', {
      signal: controller.signal,
      requestContext: 'background-analysis',
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      }),
    });
    expireRequest();
    await assert.rejects(request, { name: 'TimeoutError' });
  } finally {
    timeout.clear();
    console.warn = originalWarn;
  }

  assert.equal(warning[1].requestContext, 'background-analysis');
  assert.equal(warning[1].durationMs >= 0, true);
  assert.equal(warning[1].abortSource, 'request_timeout');
  assert.equal(warning[1].details, 'timeout');
  assert.equal(warning[1].httpStatus, null);
});
