import assert from 'node:assert/strict';
import test from 'node:test';
import { filterSupportedPlatforms, isSupportedPlatformCode } from './platforms.js';

test('filters platform data to supported platform keys', () => {
  const platforms = filterSupportedPlatforms([
    { platform: 'shopee', name: 'Shopee' },
    { platform: 'google', name: 'Google Maps' },
    { platform: 'googleplay', name: 'Google Play Store' },
    { platform: 'steam', name: 'Steam' },
    { platform: 'unknown', name: 'Unknown' },
  ]);
  assert.deepEqual(platforms.map(({ platform }) => platform), ['shopee', 'googleplay', 'steam']);
  assert.equal(filterSupportedPlatforms(null).length, 0);
});

test('only known platform keys can trigger platform operations', () => {
  assert.equal(isSupportedPlatformCode('shopee'), true);
  assert.equal(isSupportedPlatformCode('lazada'), true);
  assert.equal(isSupportedPlatformCode('steam'), true);
  assert.equal(isSupportedPlatformCode('googleplay'), true);
  assert.equal(isSupportedPlatformCode('google'), false);
  assert.equal(isSupportedPlatformCode('Google Maps'), false);
});
