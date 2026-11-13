import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getNewReviews,
  getSavedRefreshScrapeFailure,
  getSavedReviewIdentity,
  alignSavedAnalysisRefreshBatch,
  refreshSavedAnalysisFromScrape,
} from './savedAnalysisRefresh.js';
import { prepareReviewsForAnalysis } from './reviewLanguage.js';

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

test('rejects a Steam saved-refresh scrape with no loaded review cards', () => {
  const scrape = {
    platform: 'steam',
    isProductPage: true,
    reviews: [],
    hasError: true,
    errorMessage: "Steam has not loaded any review cards yet. Use Steam's review controls or scroll the page, then select Rescan.",
  };

  assert.equal(getSavedRefreshScrapeFailure(scrape), scrape.errorMessage);
  assert.equal(getSavedRefreshScrapeFailure({
    platform: 'steam',
    isProductPage: true,
    reviews: [{ id: 'steam-dom-1', text: 'A loaded review.' }],
    hasError: false,
  }), null);
});

test('does not write an empty Steam rescan over the saved review baseline', async () => {
  const savedItem = {
    id: 'snapshot-1',
    platform: 'steam',
    reviews: Array.from({ length: 53 }, (_, index) => ({
      id: `saved-${index}`,
      text: `Saved review ${index}`,
    })),
    last_refreshed_at: 123,
  };
  const originalSavedItem = structuredClone(savedItem);
  let saveCalled = false;

  await assert.rejects(
    refreshSavedAnalysisFromScrape(
      savedItem,
      {
        platform: 'steam',
        isProductPage: true,
        reviews: [],
        hasError: true,
        errorMessage: "Steam has not loaded any review cards yet. Use Steam's review controls or scroll the page, then select Rescan.",
      },
      async () => {
        saveCalled = true;
        return savedItem;
      },
    ),
    /Steam has not loaded any review cards yet/,
  );

  assert.equal(saveCalled, false);
  assert.deepEqual(savedItem, originalSavedItem);
});

test('aligns saved-refresh emotion results to accepted reviews in a mixed-language batch', async () => {
  const supportedReview = { id: 'en-1', text: 'The package arrived safely and works as expected.' };
  const unsupportedReview = {
    id: 'ja-1',
    text: 'この商品はとても良いです。使いやすくて満足しています。品質も高く、また購入したいです。',
  };
  const prepared = await prepareReviewsForAnalysis([supportedReview, unsupportedReview]);

  const batch = alignSavedAnalysisRefreshBatch(prepared.reviews, [2]);

  assert.deepEqual(batch, {
    reviews: [supportedReview],
    predictions: [2],
  });
  assert.equal(prepared.skippedReviews[0].review, unsupportedReview);
  assert.equal(prepared.skippedReviews[0].status, 'skipped');
  assert.equal(prepared.skippedReviews[0].reason, 'unsupported_language');
});

test('excludes Indonesian reviews from the saved-refresh analysis batch', async () => {
  const supportedReview = { id: 'en-1', text: 'The package arrived safely and works as expected.' };
  const indonesianReview = {
    id: 'id-1',
    text: 'The quality is bagus, tapi pengiriman sangat lambat.',
  };
  const prepared = await prepareReviewsForAnalysis([supportedReview, indonesianReview]);
  const batch = alignSavedAnalysisRefreshBatch(prepared.reviews, [2]);

  assert.deepEqual(batch, {
    reviews: [supportedReview],
    predictions: [2],
  });
  assert.equal(prepared.skippedReviews.length, 1);
  assert.equal(prepared.skippedReviews[0].review, indonesianReview);
  assert.equal(prepared.skippedReviews[0].status, 'skipped');
  assert.equal(prepared.skippedReviews[0].reason, 'unsupported_language');
  assert.equal(prepared.skippedReviews[0].detectedLanguage, 'id');
});
