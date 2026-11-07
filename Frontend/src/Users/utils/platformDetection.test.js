import assert from 'node:assert/strict';
import test from 'node:test';
import { detectPlatformFromUrl } from './platformDetection.js';

test('detects the supported review platforms', () => {
  assert.equal(detectPlatformFromUrl('https://store.steampowered.com/app/440/'), 'steam');
  assert.equal(detectPlatformFromUrl('https://shopee.ph/product/1/2'), 'shopee');
  assert.equal(detectPlatformFromUrl('https://www.lazada.com.ph/products/item.html'), 'lazada');
  assert.equal(detectPlatformFromUrl('https://play.google.com/store/apps/details?id=app'), 'googleplay');
});

test('does not detect Google Maps or unrelated Google pages as supported', () => {
  assert.equal(detectPlatformFromUrl('https://www.google.com/maps/place/test'), 'unknown');
  assert.equal(detectPlatformFromUrl('https://maps.google.com/'), 'unknown');
  assert.equal(detectPlatformFromUrl('https://www.google.com/search?q=review'), 'unknown');
  assert.equal(detectPlatformFromUrl('https://notshopee.com/product'), 'unknown');
  assert.equal(detectPlatformFromUrl('https://lazada.example.org/product'), 'unknown');
});

test('rejects invalid URLs and empty values', () => {
  assert.equal(detectPlatformFromUrl(''), 'unknown');
  assert.equal(detectPlatformFromUrl('not a URL'), 'unknown');
  assert.equal(detectPlatformFromUrl(null), 'unknown');
});
