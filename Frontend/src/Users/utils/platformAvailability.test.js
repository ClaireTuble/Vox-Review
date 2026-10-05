import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchPlatformAvailability } from './platformAvailability.js';

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
