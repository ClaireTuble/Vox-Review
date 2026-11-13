import assert from 'node:assert/strict';
import test from 'node:test';
import { createActivityReporter } from './activityReporter.js';

test('page detection continues reporting the product title and URL', async () => {
  const requests = [];
  const reporter = createActivityReporter({
    postActivity: (payload) => requests.push(payload),
  });

  await reporter.reportPageDetection({
    platform: 'Steam',
    productTitle: 'Private product title',
    productUrl: 'https://example.invalid/private-product',
  });

  assert.deepEqual(requests, [{
    platform: 'Steam',
    activity_type: 'Used',
    product_title: 'Private product title',
    product_url: 'https://example.invalid/private-product',
  }]);
});

test('analysis completion continues reporting product details and run identity', async () => {
  const requests = [];
  const reporter = createActivityReporter({
    postActivity: (payload) => requests.push(payload),
  });

  await reporter.reportAnalysisCompletion({
    platform: 'Steam',
    productTitle: 'Private product title',
    targetTitle: 'Private target title',
    page_url: 'https://example.invalid/private-product',
    runId: 'analysis-run-1',
  });

  assert.deepEqual(requests, [{
    platform: 'Steam',
    activity_type: 'Analyzed',
    product_title: 'Private product title',
    product_url: 'https://example.invalid/private-product',
    analysis_run_id: 'analysis-run-1',
  }]);
});
