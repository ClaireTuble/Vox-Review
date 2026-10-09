import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlatformAvailabilityChecker,
  fetchPlatformAvailability,
} from './platformAvailability.js';

test('checks the backend availability endpoint and returns the canonical platform name', async () => {
  let requestedUrl;
  const availability = await fetchPlatformAvailability('googleplay', async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({
        success: true,
        platform: 'googleplay',
        name: 'Google Play Store',
        is_active: false,
      }),
    };
  });

  assert.equal(requestedUrl, 'http://localhost:5000/api/health/platforms/googleplay/availability');
  assert.deepEqual(availability, {
    platform: 'googleplay',
    name: 'Google Play Store',
    isActive: false,
  });
});

test('fails closed when backend availability cannot be verified', async () => {
  await assert.rejects(
    fetchPlatformAvailability('steam', async () => ({
      ok: false,
      json: async () => ({
        success: false,
        error: 'PLATFORM_STATUS_UNAVAILABLE',
        message: 'Platform availability could not be verified. Please try again.',
      }),
    })),
    /Platform availability could not be verified/,
  );
});

test('rejects missing platform keys without making a request', async () => {
  let requestCount = 0;
  await assert.rejects(
    fetchPlatformAvailability('', async () => { requestCount += 1; }),
    /supported platform is required/,
  );
  assert.equal(requestCount, 0);
});

test('aborts a platform availability request that exceeds its timeout', async () => {
  let receivedSignal;
  await assert.rejects(
    fetchPlatformAvailability('steam', (_url, options) => new Promise((_resolve, reject) => {
      receivedSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true });
    }), 10),
    /Platform availability check timed out/,
  );
  assert.equal(receivedSignal.aborted, true);
});

test('reuses a platform availability result until its cache expires', async () => {
  let now = 100;
  let requestCount = 0;
  const checker = createPlatformAvailabilityChecker({
    cacheTtlMs: 50,
    now: () => now,
    fetchAvailability: async (platform) => {
      requestCount += 1;
      return { platform, name: 'Steam', isActive: true };
    },
  });

  const first = await checker.check('steam');
  const cached = await checker.check('steam');
  assert.equal(cached, first);
  assert.equal(requestCount, 1);

  now = 150;
  assert.equal(checker.get('steam'), null);
  await checker.check('steam');
  assert.equal(requestCount, 2);
});

test('deduplicates simultaneous availability checks and allows forced refresh', async () => {
  let requestCount = 0;
  let resolveAvailability;
  const checker = createPlatformAvailabilityChecker({
    fetchAvailability: () => {
      requestCount += 1;
      return new Promise((resolve) => { resolveAvailability = resolve; });
    },
  });

  const first = checker.check('lazada');
  const second = checker.check('lazada', { force: true });
  assert.equal(requestCount, 0);
  await Promise.resolve();
  assert.equal(requestCount, 1);
  resolveAvailability({ platform: 'lazada', name: 'Lazada', isActive: true });
  assert.deepEqual(await Promise.all([first, second]), [
    { platform: 'lazada', name: 'Lazada', isActive: true },
    { platform: 'lazada', name: 'Lazada', isActive: true },
  ]);
  assert.equal(requestCount, 1);

  const forced = checker.check('lazada', { force: true });
  await Promise.resolve();
  assert.equal(requestCount, 2);
  resolveAvailability({ platform: 'lazada', name: 'Lazada', isActive: false });
  assert.equal((await forced).isActive, false);
});
