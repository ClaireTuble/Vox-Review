import assert from 'node:assert/strict';
import test from 'node:test';
import { isMatchingRescanScrape } from './analysisScrapeState.js';

const pending = {
  pageKey: 'shopee:i.123.456',
  tabId: 7,
  requestId: 'rescan-current',
  startedAt: 1000,
};

function scrape(overrides = {}) {
  return {
    platform: 'shopee',
    url: 'https://shopee.ph/product/123/456?ref=rescan',
    tabId: 7,
    timestamp: 1001,
    rescanRequestId: 'rescan-current',
    reviews: [],
    ...overrides,
  };
}

test('accepts fresh scrape data matching page, tab, and rescan request', () => {
  assert.equal(isMatchingRescanScrape(scrape(), pending), true);
});

test('rejects scrape results from an earlier rescan even for the same page', () => {
  assert.equal(isMatchingRescanScrape(scrape({ rescanRequestId: 'rescan-previous' }), pending), false);
});

test('rejects stale timestamps, another tab, and another stable page identity', () => {
  assert.equal(isMatchingRescanScrape(scrape({ timestamp: 999 }), pending), false);
  assert.equal(isMatchingRescanScrape(scrape({ tabId: 8 }), pending), false);
  assert.equal(isMatchingRescanScrape(scrape({ url: 'https://shopee.ph/product/123/789' }), pending), false);
});
