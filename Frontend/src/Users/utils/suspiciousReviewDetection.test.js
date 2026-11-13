import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateReviewPriorities } from './priorityEngine.js';
import {
  associateSuspiciousReviewResults,
  detectRepeatedReviewText,
  filterEligibleReviewEntries,
  getEmotionInclusionMask,
  getReviewAggregateEligibilityMask,
  runSuspiciousReviewCheck,
  summarizeEmotionPredictions,
} from './suspiciousReviewDetection.js';

const reviews = [
  { id: 'a', text: 'Great quality', rating: 5, helpfulCount: 2 },
  { id: 'b', text: 'The app crashes every time', rating: 1, helpfulCount: 4 },
  { id: 'c', text: 'Needs more features', rating: 3, helpfulCount: 0 },
];
const predictions = [1, 3, 2];

// Development-only synthetic fake; it is never imported by application code.
function createDevelopmentOnlyFakeDetector(labels) {
  return async (indexedReviews) => ({
    status: 'complete',
    results: indexedReviews.map(({ reviewIndex }) => ({
      reviewIndex,
      label: labels[reviewIndex],
      score: 0.9,
      status: 'classified',
    })),
  });
}

test('disabled detection preserves the existing emotion summary and does not call a detector', async () => {
  let called = false;
  const result = await runSuspiciousReviewCheck(reviews, {
    enabled: false,
    detector: async () => {
      called = true;
      return null;
    },
  });

  assert.equal(result.status, 'disabled');
  assert.equal(result.evaluatedCount, 0);
  assert.equal(called, false);
  assert.deepEqual(
    summarizeEmotionPredictions(predictions),
    summarizeEmotionPredictions(predictions, getEmotionInclusionMask(predictions.length, result, true)),
  );
});

test('enabled detection with no configured provider remains unavailable and includes all reviews', async () => {
  const result = await runSuspiciousReviewCheck(reviews, { enabled: true, detector: null });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'detector_not_configured');
  assert.deepEqual(getEmotionInclusionMask(reviews.length, result, true), [true, true, true]);
});

test('exact repeated review text is flagged with an explanatory reason', async () => {
  const result = await runSuspiciousReviewCheck([
    { text: 'A useful product with a sturdy case.' },
    { text: 'A useful product with a sturdy case.' },
    { text: 'A useful product with a sturdy case!' },
  ], { enabled: true });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.results.map(({ reviewIndex, label }) => ({ reviewIndex, label })), [
    { reviewIndex: 0, label: 'Repeated Review' },
    { reviewIndex: 1, label: 'Repeated Review' },
    { reviewIndex: 2, label: 'Likely Authentic' },
  ]);
  assert.equal(result.results[0].reason, 'This exact review text appears more than once in this analysis.');
  assert.equal(result.results[1].reason, 'This exact review text appears more than once in this analysis.');
  assert.ok(result.results.every(({ score }) => score >= 0 && score <= 1));
  assert.deepEqual(getEmotionInclusionMask(3, result), [true, true, true]);
  assert.deepEqual(getEmotionInclusionMask(3, result, true), [false, false, true]);
});

test('case and whitespace normalization detects duplicates without flagging unrelated wording', async () => {
  const result = await runSuspiciousReviewCheck([
    { text: '  Great\tquality\nfor the price. ' },
    { text: 'great quality for the PRICE.' },
    { text: 'Great quality.' },
    { text: 'Good.' },
    { text: 'Love it!' },
  ], { enabled: true });

  assert.deepEqual(result.results.map(({ label }) => label), [
    'Repeated Review',
    'Repeated Review',
    'Likely Authentic',
    'Likely Authentic',
    'Likely Authentic',
  ]);
  assert.deepEqual(result.results.map(({ reviewIndex }) => reviewIndex), [0, 1, 2, 3, 4]);
});

test('the duplicate provider preserves input indices and does not mutate reviews', async () => {
  const input = [
    { reviewIndex: 7, text: 'Same review' },
    { reviewIndex: 2, text: 'Same review' },
  ];
  const snapshot = structuredClone(input);

  const response = await detectRepeatedReviewText(input);

  assert.deepEqual(response.results.map(({ reviewIndex }) => reviewIndex), [7, 2]);
  assert.deepEqual(input, snapshot);
});

test('malformed review input fails open without returning partial results', async () => {
  for (const invalidReviews of [null, {}, [{ text: '' }]]) {
    const result = await runSuspiciousReviewCheck(invalidReviews, { enabled: true });
    assert.equal(result.status, 'invalid');
    assert.equal(result.evaluatedCount, 0);
    assert.deepEqual(result.results, []);
  }
});

test('validated detector results are associated by review index, not response order', async () => {
  const fake = createDevelopmentOnlyFakeDetector([
    'Likely Authentic',
    'Potentially Suspicious Review',
    'Needs Manual Review',
  ]);
  const result = await runSuspiciousReviewCheck(reviews, {
    enabled: true,
    detector: async (indexedReviews, options) => {
      const response = await fake(indexedReviews, options);
      response.results.reverse();
      return response;
    },
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.results.map(({ reviewIndex }) => reviewIndex), [0, 1, 2]);
  assert.deepEqual(result.results.map(({ label }) => label), [
    'Likely Authentic',
    'Potentially Suspicious Review',
    'Needs Manual Review',
  ]);
  const inspectionEntries = associateSuspiciousReviewResults(reviews, result);
  assert.equal(inspectionEntries.length, reviews.length);
  assert.equal(inspectionEntries[1].review, reviews[1]);
  assert.equal(inspectionEntries[1].result.label, 'Potentially Suspicious Review');
});

test('detector receives sanitized text with stable local indices only', async () => {
  let detectorInput;
  const result = await runSuspiciousReviewCheck([
    { id: 'private-id', text: 'Contact jane@example.com for details' },
    { id: 'second', text: 'Second review' },
  ], {
    enabled: true,
    detector: async (indexedReviews) => {
      detectorInput = indexedReviews;
      return {
        status: 'complete',
        results: indexedReviews.map(({ reviewIndex }) => ({
          reviewIndex,
          label: 'Likely Authentic',
          score: 0.9,
          status: 'classified',
        })),
      };
    },
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(detectorInput.map(({ reviewIndex }) => reviewIndex), [0, 1]);
  assert.equal(detectorInput[0].text.includes('jane@example.com'), false);
  assert.deepEqual(Object.keys(detectorInput[0]).sort(), ['reviewIndex', 'text']);
});

test('empty, duplicate, missing, out-of-range, and mismatched indices fail safely', async (t) => {
  const invalidResponses = [
    {
      status: 'complete',
      results: [
        { reviewIndex: 0, label: 'Likely Authentic', score: 0.9, status: 'classified' },
        { reviewIndex: 0, label: 'Potentially Suspicious Review', score: 0.8, status: 'classified' },
        { reviewIndex: 2, label: 'Needs Manual Review', score: 0.5, status: 'classified' },
      ],
    },
    {
      status: 'complete',
      results: [
        { reviewIndex: 0, label: 'Likely Authentic', score: 0.9, status: 'classified' },
        { reviewIndex: 2, label: 'Needs Manual Review', score: 0.5, status: 'classified' },
      ],
    },
    {
      status: 'complete',
      results: [
        { reviewIndex: 0, label: 'Likely Authentic', score: 0.9, status: 'classified' },
        { reviewIndex: 1, label: 'Potentially Suspicious Review', score: 0.8, status: 'classified' },
        { reviewIndex: 3, label: 'Needs Manual Review', score: 0.5, status: 'classified' },
      ],
    },
    {
      status: 'partial',
      results: [
        { reviewIndex: 0, label: 'Likely Authentic', score: 0.9, status: 'classified' },
        { reviewIndex: 1, label: 'Potentially Suspicious Review', score: 0.8, status: 'classified' },
        { reviewIndex: 2, label: 'Needs Manual Review', score: 0.5, status: 'classified' },
      ],
    },
    {
      status: 'complete',
      results: [
        { reviewIndex: 0, label: 'Likely Authentic', score: 0.9, status: 'classified' },
        { reviewIndex: 1, label: 'BOT', score: 0.8, status: 'classified' },
        { reviewIndex: 2, label: 'Needs Manual Review', score: 0.5, status: 'classified' },
      ],
    },
    {
      status: 'complete',
      results: [
        { reviewIndex: 0, label: 'Likely Authentic', score: 0.9, status: 'classified' },
        { reviewIndex: 1, label: 'Potentially Suspicious Review', score: 0.8, status: 'unknown' },
        { reviewIndex: 2, label: 'Needs Manual Review', score: 0.5, status: 'classified' },
      ],
    },
  ];

  for (const [index, response] of invalidResponses.entries()) {
    await t.test(`invalid response ${index + 1}`, async () => {
      const result = await runSuspiciousReviewCheck(reviews, {
        enabled: true,
        detector: async () => response,
      });
      assert.equal(result.status, 'invalid');
      assert.equal(result.evaluatedCount, 0);
      assert.deepEqual(result.results, []);
      assert.deepEqual(getEmotionInclusionMask(reviews.length, result, true), [true, true, true]);
      const inspectionEntries = associateSuspiciousReviewResults(reviews, result);
      assert.equal(inspectionEntries.length, reviews.length);
      assert.equal(inspectionEntries[1].review, reviews[1]);
      assert.equal(inspectionEntries[1].result, null);
    });
  }
});

test('pattern-suspicious labels are not treated as exact duplicates in aggregate counts', async () => {
  const detection = await runSuspiciousReviewCheck(reviews, {
    enabled: true,
    detector: createDevelopmentOnlyFakeDetector([
      'Likely Authentic',
      'Potentially Suspicious Review',
      'Needs Manual Review',
    ]),
  });

  const primaryMask = getEmotionInclusionMask(predictions.length, detection, true);
  const primary = summarizeEmotionPredictions(predictions, primaryMask);
  const unfiltered = summarizeEmotionPredictions(predictions);

  assert.deepEqual(primaryMask, [true, true, true]);
  assert.equal(primary.totalReviews, 3);
  assert.deepEqual(primary.counts, { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0 });
  assert.deepEqual(primary.percentages, { 1: 33, 2: 33, 3: 33, 4: 0, 5: 0, 6: 0 });
  assert.equal(unfiltered.totalReviews, 3);
  assert.deepEqual(unfiltered.counts, { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0 });
  assert.deepEqual(unfiltered.percentages, { 1: 33, 2: 33, 3: 33, 4: 0, 5: 0, 6: 0 });
  assert.deepEqual(reviews.map(({ id }) => id), ['a', 'b', 'c']);
});

test('detection does not mutate review, topic, or priority inputs', async () => {
  const reviewSnapshot = structuredClone(reviews);
  const topicAnalysis = {
    results: [
      { reviewIndex: 0, topics: [{ label: 'Quality', score: 0.8 }] },
      { reviewIndex: 1, topics: [{ label: 'Performance / Functionality', score: 0.9 }] },
      { reviewIndex: 2, topics: [{ label: 'Features / Content', score: 0.7 }] },
    ],
  };
  const topicSnapshot = structuredClone(topicAnalysis);
  const priorityBefore = calculateReviewPriorities(reviews, topicAnalysis);

  const detection = await runSuspiciousReviewCheck(reviews, {
    enabled: true,
    detector: createDevelopmentOnlyFakeDetector([
      'Likely Authentic',
      'Potentially Suspicious Review',
      'Needs Manual Review',
    ]),
  });
  getEmotionInclusionMask(reviews.length, detection, true);

  assert.deepEqual(reviews, reviewSnapshot);
  assert.deepEqual(topicAnalysis, topicSnapshot);
  assert.deepEqual(calculateReviewPriorities(reviews, topicAnalysis), priorityBefore);
});

test('detector exceptions and timeouts leave every review included', async (t) => {
  await t.test('detector exception', async () => {
    const result = await runSuspiciousReviewCheck(reviews, {
      enabled: true,
      detector: async () => {
        throw new Error('inference failed');
      },
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'detector_error');
    assert.deepEqual(getEmotionInclusionMask(reviews.length, result, true), [true, true, true]);
  });

  await t.test('timeout', async () => {
    const result = await runSuspiciousReviewCheck(reviews, {
      enabled: true,
      timeoutMs: 5,
      detector: () => new Promise(() => {}),
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'timeout');
    assert.deepEqual(getEmotionInclusionMask(reviews.length, result, true), [true, true, true]);
  });

  await t.test('caller cancellation', async () => {
    const controller = new AbortController();
    const pendingCheck = runSuspiciousReviewCheck(reviews, {
      enabled: true,
      timeoutMs: 1000,
      signal: controller.signal,
      detector: () => new Promise(() => {}),
    });
    controller.abort();
    const result = await pendingCheck;

    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'cancelled');
    assert.deepEqual(getEmotionInclusionMask(reviews.length, result, true), [true, true, true]);
  });
});

test('Review Quality Check: only exact duplicate labels are excluded from aggregates', () => {
  const resultWithRepeated = {
    status: 'complete',
    results: [
      { reviewIndex: 0, label: 'Repeated Review', score: 0.95, status: 'classified' },
      { reviewIndex: 1, label: 'Likely Authentic', score: 0.5, status: 'classified' },
    ],
  };
  const resultWithLegacy = {
    status: 'complete',
    results: [
      { reviewIndex: 0, label: 'Potentially Suspicious Review', score: 0.95, status: 'classified' },
      { reviewIndex: 1, label: 'Likely Authentic', score: 0.5, status: 'classified' },
    ],
  };

  assert.deepEqual(getEmotionInclusionMask(2, resultWithRepeated, true), [false, true]);
  assert.deepEqual(getEmotionInclusionMask(2, resultWithLegacy, true), [true, true]);
  assert.deepEqual(getEmotionInclusionMask(2, resultWithRepeated, false), [true, true]);
  assert.deepEqual(getReviewAggregateEligibilityMask(2, resultWithRepeated, true), [false, true]);
  assert.deepEqual(filterEligibleReviewEntries([
    { topicResultIndex: 0, aggregateEligible: false },
    { topicResultIndex: 1, aggregateEligible: true },
  ]).map(({ topicResultIndex }) => topicResultIndex), [1]);
  assert.deepEqual(filterEligibleReviewEntries([
    { aggregateEligible: false },
    { aggregateEligible: false },
  ]), []);
});

test('Review Quality Check: disabled controls and unavailable states fail open', async () => {
  const disabledResult = await runSuspiciousReviewCheck(reviews, { enabled: false });
  assert.equal(disabledResult.status, 'disabled');
  assert.equal(disabledResult.evaluatedCount, 0);
  assert.deepEqual(getEmotionInclusionMask(reviews.length, disabledResult, true), [true, true, true]);

  const unavailableResult = await runSuspiciousReviewCheck(reviews, { enabled: true, detector: null });
  assert.equal(unavailableResult.status, 'unavailable');
  assert.equal(unavailableResult.reason, 'detector_not_configured');
  assert.equal(unavailableResult.evaluatedCount, 0);
  assert.deepEqual(getEmotionInclusionMask(reviews.length, unavailableResult, true), [true, true, true]);
});
