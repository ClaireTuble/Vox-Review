import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyReviewScreeningMetadata,
  createReviewScreeningMetadata,
  restoreReviewScreeningMetadata,
} from './reviewScreeningMetadata.js';
import { getTopicReviewSetSignature } from './topicAnalysisRequest.js';
import { sanitizeReviewText } from '../../services/privacyRedaction.js';

test('screening metadata round-trips per-review flags, rule selection, and findings', () => {
  const reviews = [{ text: 'Repeated sanitized review text.' }, { text: 'Another review.' }];
  const reviewIntegrityAssessment = {
    reviewSetSignature: getTopicReviewSetSignature(reviews),
    results: [
      {
        reviewIndex: 0,
        assessmentStatus: 'Patterns Detected',
        triggeredRules: [{ id: 'RIA-E', explanation: 'Similar wording.' }],
      },
      { reviewIndex: 1, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    ],
  };
  const metadata = createReviewScreeningMetadata({
    reviews,
    emotionData: {
      quotes: [{
        topicResultIndex: 0,
        suspiciousReviewLabel: 'Repeated Review',
        suspiciousReviewReason: 'Exact match.',
        aggregateEligible: false,
      }],
      suspiciousReviewDetection: { status: 'complete', flaggedCount: 1 },
    },
    reviewIntegrityAssessment,
    reviewIntegrityEnabled: true,
    enabledRiaRuleIds: ['RIA-E'],
    duplicateCheckEnabled: true,
    excludeDuplicatesFromAggregates: true,
  });

  const restored = restoreReviewScreeningMetadata(metadata, reviews);
  assert.equal(restored.reviewIntegrity.enabled, true);
  assert.deepEqual(restored.reviewIntegrity.enabledRuleIds, ['RIA-E']);
  assert.deepEqual(restored.reviewIntegrity.results, reviewIntegrityAssessment.results);
  assert.equal(restored.duplicateCheckEnabled, true);
  assert.equal(restored.excludeDuplicatesFromAggregates, true);
  assert.deepEqual([...restored.duplicateResults.values()], metadata.duplicateResults);
  assert.equal(
    applyReviewScreeningMetadata([{ topicResultIndex: 0 }], restored)[0].aggregateEligible,
    false,
  );
});

test('old saved analyses without screening metadata do not receive fabricated results', () => {
  const restored = restoreReviewScreeningMetadata(undefined, [{ text: 'Older review.' }]);
  assert.equal(restored, null);
});

test('screening results are not restored for a different review set', () => {
  const reviews = [{ text: 'Original review.' }];
  const metadata = createReviewScreeningMetadata({
    reviews,
    emotionData: { quotes: [] },
    reviewIntegrityAssessment: null,
    reviewIntegrityEnabled: true,
    enabledRiaRuleIds: ['RIA-A'],
    duplicateCheckEnabled: false,
    excludeDuplicatesFromAggregates: false,
  });

  assert.equal(
    restoreReviewScreeningMetadata(metadata, [{ text: 'Changed review.' }]),
    null,
  );
});

test('screening metadata matches sanitized review text and the saved page', () => {
  const pageKey = 'shopee:example-product';
  const review = { text: 'Contact me at private.person@example.com about this order.' };
  const sanitizedText = sanitizeReviewText(review.text);
  const reviewIntegrityAssessment = {
    pageKey,
    reviewSetSignature: getTopicReviewSetSignature([sanitizedText]),
    results: [{ reviewIndex: 0, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] }],
  };
  const metadata = createReviewScreeningMetadata({
    reviews: [review],
    emotionData: { quotes: [] },
    reviewIntegrityAssessment,
    reviewIntegrityEnabled: true,
    enabledRiaRuleIds: ['RIA-A'],
    duplicateCheckEnabled: false,
    excludeDuplicatesFromAggregates: false,
    pageKey,
  });

  const restored = restoreReviewScreeningMetadata(metadata, [review]);
  assert.deepEqual(restored.reviewIntegrity.results, reviewIntegrityAssessment.results);
});

test('screening metadata maps compacted evidence quotes to their original review indexes', () => {
  const reviews = [
    { text: '' },
    { text: 'First substantive review.' },
    { text: '  ' },
    { text: 'Repeated sanitized review text.' },
  ];
  const reviewIntegrityAssessment = {
    reviewSetSignature: getTopicReviewSetSignature(reviews),
    results: reviews.map((_, reviewIndex) => ({
      reviewIndex,
      assessmentStatus: reviewIndex === 3 ? 'Patterns Detected' : 'No Selected Patterns Detected',
      triggeredRules: reviewIndex === 3 ? [{ id: 'RIA-B', explanation: 'Repeated wording.' }] : [],
    })),
  };
  const emotionData = {
    quotes: [{
      topicResultIndex: 1,
      sourceReviewIndex: 3,
      suspiciousReviewLabel: 'Repeated Review',
      aggregateEligible: false,
    }],
    suspiciousReviewDetection: { status: 'complete', flaggedCount: 1 },
  };

  const metadata = createReviewScreeningMetadata({
    reviews,
    emotionData,
    reviewIntegrityAssessment,
    reviewIntegrityEnabled: true,
    enabledRiaRuleIds: ['RIA-B'],
    duplicateCheckEnabled: true,
    excludeDuplicatesFromAggregates: true,
  });
  const restored = restoreReviewScreeningMetadata(metadata, reviews);
  const [restoredQuote] = applyReviewScreeningMetadata(
    [{ topicResultIndex: 1, sourceReviewIndex: 3 }],
    restored,
  );

  assert.deepEqual(metadata.duplicateResults.map(({ reviewIndex }) => reviewIndex), [3]);
  assert.equal(restoredQuote.suspiciousReviewLabel, 'Repeated Review');
  assert.equal(restoredQuote.aggregateEligible, false);
});
