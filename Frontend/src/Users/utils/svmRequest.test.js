import assert from 'node:assert/strict';
import test from 'node:test';
import { requestSvmBatch } from './svmRequest.js';

test('returns a successful batch response and passes all reviews in one request', async () => {
  let requestCount = 0;
  let requestBody;
  const payload = {
    success: true,
    predictions: [1, 2],
    modelProvenance: { modelIdentifier: 'hybrid_oof_stacking' },
  };
  let requestUrl;
  const result = await requestSvmBatch(['great', 'disappointed'], {
    platform: 'shopee',
    reviewOffset: 100,
    fetchImpl: async (url, options) => {
      requestCount += 1;
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => payload };
    },
  });

  assert.equal(requestCount, 1);
  assert.deepEqual(requestBody.reviews, ['great', 'disappointed']);
  assert.equal(requestBody.platform, 'shopee');
  assert.equal(requestBody.reviewOffset, 100);
  assert.match(requestUrl, /\/api\/nlp\/svm\/predict$/);
  assert.equal(result.modelProvenance.modelIdentifier, 'hybrid_oof_stacking');
  assert.equal(result, payload);
});

test('clears the loading state on an HTTP/API error', async () => {
  const state = { status: 'analyzing', message: '' };

  await assert.rejects(
    requestSvmBatch(['great'], {
      platform: 'shopee',
      fetchImpl: async () => ({
        ok: false,
        json: async () => ({ success: false, error: 'SVM prediction service unavailable' }),
      }),
      onFailure: (error) => {
        state.status = 'idle';
        state.message = error.message;
      },
    }),
    /SVM prediction service unavailable/,
  );

  assert.equal(state.status, 'idle');
  assert.match(state.message, /SVM prediction service unavailable/);
});

test('surfaces the backend platform-disabled message', async () => {
  await assert.rejects(
    requestSvmBatch(['great'], {
      platform: 'steam',
      fetchImpl: async () => ({
        ok: false,
        json: async () => ({
          success: false,
          error: 'PLATFORM_DISABLED',
          message: 'Analysis for this platform is currently disabled.',
        }),
      }),
    }),
    (error) => error.code === 'PLATFORM_DISABLED' &&
      /Analysis for this platform is currently disabled/.test(error.message),
  );
});

test('sends redacted review text without reviewer metadata', async () => {
  let requestBody;
  await requestSvmBatch([
    { reviewer: 'Jane', reviewText: 'Great quality. Email jane@example.com and call +63 917 123 4567.' },
  ], {
    platform: 'shopee',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ success: true, predictions: [1] }) };
    },
  });

  assert.deepEqual(requestBody.reviews, ['Great quality. Email [EMAIL] and call [PHONE].']);
});

test('aborts a pending request at the deadline and clears loading with a timeout message', async () => {
  const state = { status: 'analyzing', message: '' };
  let receivedSignal;
  const fetchImpl = (_url, options) => new Promise((_resolve, reject) => {
    receivedSignal = options.signal;
    options.signal.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true });
  });

  await assert.rejects(
    requestSvmBatch(['great'], {
      platform: 'shopee',
      fetchImpl,
      timeoutMs: 10,
      onFailure: (error) => {
        state.status = 'idle';
        state.message = error.message;
      },
    }),
    (error) => error.name === 'TimeoutError' && error.code === 'ETIMEDOUT',
  );

  assert.equal(receivedSignal.aborted, true);
  assert.equal(state.status, 'idle');
  assert.match(state.message, /timed out after 0.01 seconds/);
});

test('aborts the pending request when its analysis job is cancelled', async () => {
  const jobController = new AbortController();
  let requestSignal;
  const pendingRequest = requestSvmBatch(['great'], {
    platform: 'steam',
    signal: jobController.signal,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      requestSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true });
    }),
  });

  jobController.abort();
  await assert.rejects(pendingRequest, /fetch aborted/);
  assert.equal(requestSignal.aborted, true);
});