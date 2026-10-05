import assert from 'node:assert/strict';
import test from 'node:test';

import { getNewReviews, getSavedReviewIdentity } from './savedAnalysisRefresh.js';

test('uses a stable source review ID even when review text was edited', () => {
  const saved = [{ id: 'source-comment-123', text: 'Original wording' }];
  const fetched = [{ id: 'source-comment-123', text: 'Edited wording' }];

  assert.deepEqual(getNewReviews(saved, fetched), []);
});

test('falls back from scraper index IDs to normalized review text and reviewer', () => {
  const saved = [{ id: 'shopee-review-0', reviewer: 'Shopee Buyer', text: 'Very good quality!' }];
  const fetched = [{ id: 'shopee-review-18', reviewer: 'Shopee Buyer', text: '  VERY good quality!  ' }];

  assert.deepEqual(getNewReviews(saved, fetched), []);
});

test('ignores reviewer-date-index IDs when the list index changes', () => {
  const saved = [{ id: 'Jane Doe-3 days ago-0', reviewer: 'Jane Doe', date: '3 days ago', text: 'Great service.' }];
  const fetched = [{ id: 'Jane Doe-3 days ago-5', reviewer: 'Jane Doe', date: '3 days ago', text: 'Great service.' }];

  assert.deepEqual(getNewReviews(saved, fetched), []);
});

test('uses text plus reviewer when no stable source ID exists', () => {
  const saved = [{ reviewer: 'Buyer A', text: 'Item arrived safely.' }];
  const fetched = [
    { reviewer: 'Buyer A', text: 'Item arrived safely.' },
    { reviewer: 'Buyer B', text: 'Item arrived safely.' },
  ];

  assert.equal(getNewReviews(saved, fetched).length, 1);
  assert.equal(getNewReviews(saved, fetched)[0].reviewer, 'Buyer B');
});

test('returns only distinct new reviews and suppresses duplicates in the fetched batch', () => {
  const existing = [{ reviewId: 'gp-1', reviewText: 'Already analyzed.' }];
  const firstNew = { reviewId: 'gp-2', reviewText: 'New review.' };
  const fetched = [
    { reviewId: 'gp-1', reviewText: 'Already analyzed.' },
    firstNew,
    { reviewId: 'gp-2', reviewText: 'New review.' },
    { reviewId: 'gp-3', reviewText: 'Another new review.' },
  ];

  assert.deepEqual(getNewReviews(existing, fetched), [firstNew, { reviewId: 'gp-3', reviewText: 'Another new review.' }]);
  assert.equal(getSavedReviewIdentity('  New review.  '), getSavedReviewIdentity('new review.'));
});

test('does not rediscover reviews after they are merged into the saved batch', () => {
  const saved = [{ reviewId: 'gp-1', reviewText: 'Existing review.' }];
  const newlyDetected = [
    { reviewId: 'gp-2', reviewText: 'New review one.' },
    { reviewId: 'gp-3', reviewText: 'New review two.' },
  ];
  const merged = [...saved, ...newlyDetected];

  assert.deepEqual(getNewReviews(saved, newlyDetected), newlyDetected);
  assert.deepEqual(getNewReviews(merged, [...newlyDetected, ...saved]), []);
});
