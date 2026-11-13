import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCombinedReviewAggregateEligibilityMask,
  getReviewAggregateEligibilityMask,
  getEmotionInclusionMask,
  summarizeEmotionPredictions,
} from './suspiciousReviewDetection.js';
import {
  applyReviewScreeningMetadata,
  createReviewScreeningMetadata,
  restoreReviewScreeningMetadata,
} from './reviewScreeningMetadata.js';

test('Flagged review exclusion: default state is OFF (all reviews included)', () => {
  const reviewCount = 6;
  const detectorResult = {
    status: 'complete',
    results: [
      { reviewIndex: 0, label: 'Repeated Review', score: 0.95, status: 'classified' },
      { reviewIndex: 1, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 2, label: 'Repeated Review', score: 0.95, status: 'classified' },
      { reviewIndex: 3, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 4, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 5, label: 'Likely Authentic', score: 0.5, status: 'classified' },
    ],
  };
  const riaResults = [
    { reviewIndex: 0, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-A' }] },
    { reviewIndex: 1, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-B' }] },
    { reviewIndex: 2, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 3, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 4, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 5, assessmentStatus: 'Unable to Assess', triggeredRules: [] },
  ];

  // Default OFF (excludeFlagged: false)
  const maskDefault = getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult,
    reviewIntegrityAssessment: riaResults,
    excludeFlagged: false,
    reviewIntegrityEnabled: true,
  });

  assert.deepEqual(maskDefault, [true, true, true, true, true, true]);
  assert.equal(maskDefault.filter((inc) => !inc).length, 0, 'Zero reviews excluded when toggle is OFF');

  // Verify backward compatibility helper
  const maskLegacy = getReviewAggregateEligibilityMask(
    reviewCount,
    detectorResult,
    false,
    riaResults,
    true,
  );
  assert.deepEqual(maskLegacy, [true, true, true, true, true, true]);
});

test('Google Play: exclusion works when RIA completes with pattern flags and Exact check is unavailable', () => {
  // Simulates Google Play scenario:
  // Review Integrity Assessment: Complete, 5 pattern flags (indices 0, 1, 2, 3, 4)
  // Exact Repeated-Text Check: Check unavailable
  const reviewCount = 8;
  const detectorResult = {
    status: 'unavailable',
    reason: 'detector_not_configured',
    evaluatedCount: 0,
    results: [],
  };
  const riaResults = [
    { reviewIndex: 0, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-C' }] },
    { reviewIndex: 1, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-D' }] },
    { reviewIndex: 2, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-A' }] },
    { reviewIndex: 3, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-B' }] },
    { reviewIndex: 4, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-E' }] },
    { reviewIndex: 5, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 6, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 7, assessmentStatus: 'Unable to Assess', triggeredRules: [] },
  ];

  const mask = getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult,
    reviewIntegrityAssessment: riaResults,
    excludeFlagged: true,
    reviewIntegrityEnabled: true,
  });

  // Indices 0..4 are excluded, 5..7 remain included (Unable to Assess is NOT excluded)
  assert.deepEqual(mask, [false, false, false, false, false, true, true, true]);
  const excludedCount = mask.filter((inc) => !inc).length;
  assert.equal(excludedCount, 5, 'Exactly 5 pattern flags excluded');

  // Verify predictions summary recalculation
  // Predictions: 1 (Joy), 1, 1, 2 (Sadness), 2, 3 (Anger), 3, 3
  const predictions = [1, 1, 1, 2, 2, 3, 3, 3];
  const unfiltered = summarizeEmotionPredictions(predictions);
  const filtered = summarizeEmotionPredictions(predictions, mask);

  assert.equal(unfiltered.totalReviews, 8);
  assert.equal(unfiltered.dominantCategory, 1); // Category 1 has 3 reviews, Category 3 has 3 reviews (tied)
  assert.equal(filtered.totalReviews, 3);
  assert.equal(filtered.dominantCategory, 3); // After excluding 0..4, only [3, 3, 3] remain -> 100% Category 3
  assert.equal(filtered.percentages[3], 100);
});

test('Steam: exclusion works when Exact Repeated-Text Check completes and RIA has 0 flags', () => {
  // Simulates Steam scenario:
  // Review Integrity Assessment: Complete, 0 pattern flags
  // Exact Repeated-Text Check: Complete, 2 duplicate matches (indices 1, 3)
  const reviewCount = 5;
  const detectorResult = {
    status: 'complete',
    results: [
      { reviewIndex: 0, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 1, label: 'Repeated Review', score: 0.95, status: 'classified' },
      { reviewIndex: 2, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 3, label: 'Repeated Review', score: 0.95, status: 'classified' },
      { reviewIndex: 4, label: 'Likely Authentic', score: 0.5, status: 'classified' },
    ],
  };
  const riaResults = [
    { reviewIndex: 0, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 1, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 2, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 3, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 4, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
  ];

  const mask = getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult,
    reviewIntegrityAssessment: riaResults,
    excludeFlagged: true,
    reviewIntegrityEnabled: true,
  });

  assert.deepEqual(mask, [true, false, true, false, true]);
  assert.equal(mask.filter((inc) => !inc).length, 2, 'Exactly 2 exact duplicates excluded');
});

test('Shopee and Lazada: combined exclusion handles both duplicate text and pattern flags with overlap', () => {
  // Review 0: Flagged by both RIA and Exact check
  // Review 1: Flagged by RIA only
  // Review 2: Flagged by Exact check only
  // Review 3: Clean
  // Review 4: Clean
  const reviewCount = 5;
  const detectorResult = {
    status: 'complete',
    results: [
      { reviewIndex: 0, label: 'Repeated Review', score: 0.95, status: 'classified' },
      { reviewIndex: 1, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 2, label: 'Repeated Review', score: 0.95, status: 'classified' },
      { reviewIndex: 3, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 4, label: 'Likely Authentic', score: 0.5, status: 'classified' },
    ],
  };
  const riaResults = [
    { reviewIndex: 0, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-A' }] },
    { reviewIndex: 1, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-B' }] },
    { reviewIndex: 2, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 3, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 4, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
  ];

  const mask = getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult,
    reviewIntegrityAssessment: riaResults,
    excludeFlagged: true,
    reviewIntegrityEnabled: true,
  });

  // Indices 0, 1, 2 are excluded; 3, 4 are included
  assert.deepEqual(mask, [false, false, false, true, true]);
  assert.equal(mask.filter((inc) => !inc).length, 3, 'Overlap review excluded once, total 3 excluded');
});

test('Unavailable and Not run checks never exclude reviews', () => {
  const reviewCount = 4;

  // Case 1: Both unavailable / not run
  const maskAllUnavailable = getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult: { status: 'unavailable', reason: 'timeout' },
    reviewIntegrityAssessment: null,
    excludeFlagged: true,
    reviewIntegrityEnabled: true,
  });
  assert.deepEqual(maskAllUnavailable, [true, true, true, true]);

  // Case 2: RIA disabled
  const maskRiaDisabled = getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult: { status: 'disabled' },
    reviewIntegrityAssessment: [
      { reviewIndex: 0, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-A' }] },
    ],
    excludeFlagged: true,
    reviewIntegrityEnabled: false,
  });
  assert.deepEqual(maskRiaDisabled, [true, true, true, true]);

  // Case 3: Unable to Assess status in RIA is never excluded
  const maskUnableToAssess = getCombinedReviewAggregateEligibilityMask({
    reviewCount: 3,
    detectorResult: { status: 'complete', results: [
      { reviewIndex: 0, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 1, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 2, label: 'Likely Authentic', score: 0.5, status: 'classified' },
    ]},
    reviewIntegrityAssessment: [
      { reviewIndex: 0, assessmentStatus: 'Unable to Assess', triggeredRules: [] },
      { reviewIndex: 1, assessmentStatus: 'Unable to Assess', triggeredRules: [] },
      { reviewIndex: 2, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    ],
    excludeFlagged: true,
    reviewIntegrityEnabled: true,
  });
  assert.deepEqual(maskUnableToAssess, [true, true, true]);
});

test('Zero flagged reviews leaves all reviews included and exclusion count at 0', () => {
  const reviewCount = 4;
  const detectorResult = {
    status: 'complete',
    results: [
      { reviewIndex: 0, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 1, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 2, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 3, label: 'Likely Authentic', score: 0.5, status: 'classified' },
    ],
  };
  const riaResults = [
    { reviewIndex: 0, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 1, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 2, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 3, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
  ];

  const mask = getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult,
    reviewIntegrityAssessment: riaResults,
    excludeFlagged: true,
    reviewIntegrityEnabled: true,
  });

  assert.deepEqual(mask, [true, true, true, true]);
  assert.equal(mask.filter((inc) => !inc).length, 0);
});

test('Preservation: reviews and integrity metadata are preserved and not deleted', () => {
  const reviews = [
    { text: 'Great game, truly loved it!', platform: 'steam' },
    { text: 'Great game, truly loved it!', platform: 'steam' },
    { text: 'Interesting mechanics and fun gameplay.', platform: 'steam' },
  ];
  const reviewsSnapshot = structuredClone(reviews);

  const quotes = [
    { id: '1', text: reviews[0].text, topicResultIndex: 0, category: 1 },
    { id: '2', text: reviews[1].text, topicResultIndex: 1, category: 1 },
    { id: '3', text: reviews[2].text, topicResultIndex: 2, category: 1 },
  ];
  const quotesSnapshot = structuredClone(quotes);

  const screeningMetadata = createReviewScreeningMetadata({
    reviews,
    emotionData: {
      quotes: [
        { topicResultIndex: 0, suspiciousReviewLabel: 'Repeated Review', aggregateEligible: false },
        { topicResultIndex: 1, suspiciousReviewLabel: 'Repeated Review', aggregateEligible: false },
        { topicResultIndex: 2, suspiciousReviewLabel: 'Likely Authentic', aggregateEligible: true },
      ],
      suspiciousReviewDetection: { status: 'complete', flaggedCount: 2 },
    },
    reviewIntegrityAssessment: {
      pageKey: 'steam:10',
      reviewSetSignature: 'sig',
      results: [
        { reviewIndex: 0, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
        { reviewIndex: 1, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
        { reviewIndex: 2, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
      ],
    },
    reviewIntegrityEnabled: true,
    enabledRiaRuleIds: ['RIA-A'],
    duplicateCheckEnabled: true,
    excludeDuplicatesFromAggregates: true,
    pageKey: 'steam:10',
  });

  // Source reviews must remain untouched
  assert.deepEqual(reviews, reviewsSnapshot);

  // Apply restored metadata
  const restored = restoreReviewScreeningMetadata(screeningMetadata, reviews);
  const appliedQuotes = applyReviewScreeningMetadata(quotes, restored, {
    excludeDuplicatesFromAggregates: true,
  });

  // Quotes array length must not change (no reviews deleted)
  assert.equal(appliedQuotes.length, 3);
  // Original quotes not mutated
  assert.deepEqual(quotes, quotesSnapshot);
  // Flags and eligibility preserved
  assert.equal(appliedQuotes[0].aggregateEligible, false);
  assert.equal(appliedQuotes[1].aggregateEligible, false);
  assert.equal(appliedQuotes[2].aggregateEligible, true);
  assert.equal(appliedQuotes[0].suspiciousReviewLabel, 'Repeated Review');
});


test('Toggle ON then OFF: dynamic recalculation and full restoration of emotion distribution', () => {
  const reviewCount = 5;
  // Predictions: 3x Happy (category 1), 2x Anger (category 3)
  const predictions = [1, 1, 1, 3, 3];
  const detectorResult = {
    status: 'complete',
    results: [
      { reviewIndex: 0, label: 'Repeated Review', score: 0.95, status: 'classified' },
      { reviewIndex: 1, label: 'Repeated Review', score: 0.95, status: 'classified' },
      { reviewIndex: 2, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 3, label: 'Likely Authentic', score: 0.5, status: 'classified' },
      { reviewIndex: 4, label: 'Likely Authentic', score: 0.5, status: 'classified' },
    ],
  };

  // State 1: Default OFF (all 5 included)
  const maskOff1 = getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult,
    excludeFlagged: false,
  });
  assert.deepEqual(maskOff1, [true, true, true, true, true]);
  const summaryOff1 = summarizeEmotionPredictions(predictions, maskOff1);
  assert.equal(summaryOff1.totalReviews, 5);
  assert.equal(summaryOff1.counts[1], 3); // Happy: 3/5 = 60%
  assert.equal(summaryOff1.counts[3], 2); // Anger: 2/5 = 40%
  assert.equal(summaryOff1.dominantCategory, 1);

  // State 2: Toggle ON (2 repeated reviews excluded)
  const maskOn = getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult,
    excludeFlagged: true,
  });
  assert.deepEqual(maskOn, [false, false, true, true, true]);
  const summaryOn = summarizeEmotionPredictions(predictions, maskOn);
  assert.equal(summaryOn.totalReviews, 3);
  assert.equal(summaryOn.counts[1], 1); // Happy: 1/3 = 33%
  assert.equal(summaryOn.counts[3], 2); // Anger: 2/3 = 67% (dominant changes from Happy to Anger!)
  assert.equal(summaryOn.dominantCategory, 3);

  // State 3: Toggle back OFF (restores all 5 reviews immediately)
  const maskOff2 = getCombinedReviewAggregateEligibilityMask({
    reviewCount,
    detectorResult,
    excludeFlagged: false,
  });
  assert.deepEqual(maskOff2, [true, true, true, true, true]);
  const summaryOff2 = summarizeEmotionPredictions(predictions, maskOff2);
  assert.equal(summaryOff2.totalReviews, 5);
  assert.equal(summaryOff2.counts[1], 3); // Happy: 3/5 = 60% restored
  assert.equal(summaryOff2.counts[3], 2); // Anger: 2/5 = 40% restored
  assert.equal(summaryOff2.dominantCategory, 1);
});

test('Saved-analysis restoration preserves exclusion state (both OFF and ON)', () => {
  const reviews = [
    { text: 'Great experience', platform: 'shopee' },
    { text: 'Great experience', platform: 'shopee' },
  ];

  // Case A: Saved with exclusion OFF
  const metadataOff = createReviewScreeningMetadata({
    reviews,
    emotionData: {
      quotes: [
        { topicResultIndex: 0, suspiciousReviewLabel: 'Repeated Review', aggregateEligible: true },
        { topicResultIndex: 1, suspiciousReviewLabel: 'Repeated Review', aggregateEligible: true },
      ],
      suspiciousReviewDetection: { status: 'complete', flaggedCount: 2 },
    },
    reviewIntegrityAssessment: null,
    reviewIntegrityEnabled: false,
    duplicateCheckEnabled: true,
    excludeDuplicatesFromAggregates: false,
    pageKey: 'shopee:test-1',
  });
  assert.equal(metadataOff.excludeDuplicatesFromAggregates, false);
  const restoredOff = restoreReviewScreeningMetadata(metadataOff, reviews);
  assert.equal(restoredOff.excludeDuplicatesFromAggregates, false, 'Restored analysis must have exclusion OFF');

  // Case B: Saved with exclusion ON
  const metadataOn = createReviewScreeningMetadata({
    reviews,
    emotionData: {
      quotes: [
        { topicResultIndex: 0, suspiciousReviewLabel: 'Repeated Review', aggregateEligible: false },
        { topicResultIndex: 1, suspiciousReviewLabel: 'Repeated Review', aggregateEligible: false },
      ],
      suspiciousReviewDetection: { status: 'complete', flaggedCount: 2 },
    },
    reviewIntegrityAssessment: null,
    reviewIntegrityEnabled: false,
    duplicateCheckEnabled: true,
    excludeDuplicatesFromAggregates: true,
    pageKey: 'shopee:test-2',
  });
  assert.equal(metadataOn.excludeDuplicatesFromAggregates, true);
  const restoredOn = restoreReviewScreeningMetadata(metadataOn, reviews);
  assert.equal(restoredOn.excludeDuplicatesFromAggregates, true, 'Restored analysis must have exclusion ON');
});
