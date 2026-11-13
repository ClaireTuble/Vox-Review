import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  sanitizeReviewObject,
  sanitizeReviewText,
  sanitizeReviewForAnalysis,
  sanitizeReviewsForAnalysis,
} from './privacyRedaction.js';

test('redacts emails, phones, and order IDs while preserving sentiment and issue wording', () => {
  const review = 'The product quality is bad. Please contact jane@example.com or +63 917 123 4567. Tracking No: ABCD1234.';
  const sanitized = sanitizeReviewText(review);

  assert.match(sanitized, /quality is bad/i);
  assert.match(sanitized, /\[EMAIL\]/);
  assert.match(sanitized, /\[PHONE\]/);
  assert.match(sanitized, /\[ORDER_ID\]/);
  assert.doesNotMatch(sanitized, /jane@example.com|\+63 917 123 4567|ABCD1234/i);
});

test('removes reviewer metadata before analysis payloads are stored or sent', () => {
  const reviews = [{
    platform: 'shopee',
    id: 'persistent-review-id',
    reviewer: 'Jane',
    username: 'jane',
    profileUrl: 'https://example.com/u/jane',
    reviewText: 'Great quality. Email jane@example.com.',
    rating: 5,
    helpfulCount: 19,
    helpfulnessMetric: 'review_likes',
    helpfulnessAvailable: true,
    productImage: 'https://cdn.example/reviewer.jpg',
    category: 'unneeded',
    extra: 'unneeded',
  }];

  const sanitized = sanitizeReviewsForAnalysis(reviews);
  assert.deepEqual(sanitized, [{
    text: 'Great quality. Email [EMAIL].',
    rating: 5,
    helpfulCount: 19,
    helpfulnessMetric: 'review_likes',
    helpfulnessAvailable: true,
    platform: 'shopee',
  }]);
  assert.equal('id' in sanitized[0], false);
  assert.equal('reviewer' in sanitized[0], false);
});

test('handles English, Filipino, and Taglish examples without masking harmless wording', () => {
  const reviews = [
    'Delivery was very slow and the item quality is poor. Email me at juan@sample.com.',
    'Salamat sa mabilis na delivery. Ang order no. ABCD1234 ay okay.',
    'Sobrang ganda ng product, but please call 0917-123-4567 if there is a problem.',
    'The Quality app is great and works well.',
  ];

  const sanitized = reviews.map((review) => sanitizeReviewText(review));
  assert.match(sanitized[0], /very slow/i);
  assert.match(sanitized[0], /\[EMAIL\]/);
  assert.match(sanitized[1], /\[ORDER_ID\]/);
  assert.match(sanitized[2], /\[PHONE\]/);
  assert.doesNotMatch(sanitized[3], /\[NAME\]|\[EMAIL\]|\[PHONE\]/);
});

test('does not redact ambiguous text when there is no strong personal-data signal', () => {
  const review = 'The Quality app is great, works well, and arrived on time.';
  const sanitized = sanitizeReviewText(review);
  assert.equal(sanitized, review);
});

test('masks recognizable addresses and greetings while preserving ordinary review wording', () => {
  const sanitized = sanitizeReviewText(
    'Please send it to 123 Rizal St. Hi Maria, order no. ZX-12345 is delayed.',
  );
  assert.match(sanitized, /\[ADDRESS\]/);
  assert.match(sanitized, /\[NAME\]/);
  assert.match(sanitized, /order no \[ORDER_ID\]/i);
  assert.match(sanitized, /is delayed/i);
});

test('review objects preserve only the allowlisted analysis fields and never fabricate ratings', () => {
  const sanitized = sanitizeReviewForAnalysis({
    reviewerName: 'Private Person',
    platform: 'steam',
    reviewId: 'private-id',
    review: 'Not recommended due to repeated crashes.',
    date: 'July 2026',
    recommendation: 'negative',
    helpfulCount: 11,
    helpfulnessMetric: 'helpful_votes',
    helpfulnessAvailable: true,
    category: 'quality',
  });

  assert.deepEqual(sanitized, {
    text: 'Not recommended due to repeated crashes.',
    date: 'July 2026',
    helpfulCount: 11,
    helpfulnessMetric: 'helpful_votes',
    helpfulnessAvailable: true,
    recommendation: 'negative',
    platform: 'steam',
  });
  assert.equal('rating' in sanitized, false);
});

test('helpfulCount is normalized to a safe non-negative integer or null', () => {
  for (const [value, expected] of [
    [0, 0],
    [10, 10],
    ['3', 3],
    ['1,234', 1234],
    [null, null],
    [undefined, null],
    [-1, null],
    [1.5, null],
    ['not a count', null],
    [Number.MAX_SAFE_INTEGER + 1, null],
  ]) {
    const sanitized = sanitizeReviewForAnalysis({
      platform: 'lazada',
      text: 'The interface is confusing.',
      helpfulCount: value,
      helpfulnessMetric: 'helpful_votes',
      helpfulnessAvailable: true,
      reviewerName: 'Private Person',
      profileUrl: 'https://example.test/profile',
      reviewId: 'private-id',
    });

    assert.equal(sanitized.helpfulCount, expected);
    assert.equal(sanitized.helpfulnessAvailable, expected !== null);
    assert.equal(sanitized.helpfulnessMetric, expected === null ? null : 'helpful_votes');
    assert.equal(sanitized.reviewerName, undefined);
    assert.equal(sanitized.profileUrl, undefined);
    assert.equal(sanitized.reviewId, undefined);
  }
  const unavailable = sanitizeReviewForAnalysis({
    platform: 'steam',
    text: 'The controls are confusing.',
  });
  assert.equal(Object.hasOwn(unavailable, 'helpfulCount'), false);
  const explicitUnavailable = sanitizeReviewForAnalysis({
    platform: 'steam',
    text: 'The controls are confusing.',
    helpfulCount: null,
    helpfulnessMetric: null,
    helpfulnessAvailable: false,
  });
  assert.deepEqual(
    [
      explicitUnavailable.helpfulCount,
      explicitUnavailable.helpfulnessMetric,
      explicitUnavailable.helpfulnessAvailable,
    ],
    [null, null, false],
  );
});

test('best-effort masking does not detect every free-form name or claim complete anonymization', () => {
  const sanitized = sanitizeReviewText('Maria said the packaging arrived late and I was disappointed.');
  assert.match(sanitized, /Maria said/);
  assert.doesNotMatch(sanitized, /fully anonymized|complete anonymization/i);
});

test('Saved Analyses notes warn that cloud notes are not automatically screened', async () => {
  const [analysisResults, savedAnalyses] = await Promise.all([
    readFile(new URL('../Users/components/AnalysisResults.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../Users/components/SavedAnalysesView.jsx', import.meta.url), 'utf8'),
  ]);
  for (const source of [analysisResults, savedAnalyses]) {
    assert.match(source, /saved with your cloud snapshot/i);
    assert.match(source, /not automatically screened/i);
    assert.doesNotMatch(source, /fully anonymized|all personal information is removed/i);
  }
});

test('other platform review fields remain outside this four-platform allowlist change', () => {
  const sanitized = sanitizeReviewForAnalysis({
    id: 'existing-maps-review-id',
    platform: 'google',
    reviewer: 'Previously filtered name',
    helpfulCount: 6,
    text: 'A helpful place review.',
  });

  assert.deepEqual(sanitized, {
    id: 'existing-maps-review-id',
    platform: 'google',
    helpfulCount: 6,
    text: 'A helpful place review.',
  });
});

test('sanitizes a review object without dropping issue-related text', () => {
  const review = {
    reviewer: 'Maria',
    username: 'marial',
    reviewText: 'Pretty good quality but had a bad experience at 123 Rizal St.',
    helpful: 7,
  };

  const sanitized = sanitizeReviewObject(review);
  assert.equal(sanitized.helpful, 7);
  assert.equal(sanitized.reviewText, 'Pretty good quality but had a bad experience at [ADDRESS].');
  assert.equal(sanitized.reviewer, undefined);
  assert.equal(sanitized.username, undefined);
});
