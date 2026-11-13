import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnalysisReviewSample,
  DEFAULT_ANALYSIS_REVIEW_BATCH_SIZE,
  MAX_ANALYSIS_REVIEW_BATCH_SIZE,
  DEFAULT_STEAM_ANALYSIS_REVIEW_LIMIT,
  getCommonEmotionModelIdentifier,
  getEmotionModelDisplayName,
  mergeSvmBatchResponses,
  mergeTopicBatchResponses,
  requestReviewBatches,
} from './analysisReviewBatching.js';
import { prepareReviewsForAnalysis } from './reviewLanguage.js';

test('Steam sampling deduplicates by normalized review text and honors the 200-review cap', () => {
  const reviews = Array.from({ length: 201 }, (_, index) => ({
    id: `steam-${index}`,
    text: `Review number ${index}`,
  }));
  reviews.push({ id: 'different-id', text: '  REVIEW   NUMBER 0  ' });
  reviews.push({ id: 'steam-1', text: 'Different text with the same review ID' });

  const firstSample = createAnalysisReviewSample(reviews, {
    platform: 'steam',
    sourceReviewCount: 203,
  });
  const nextSample = createAnalysisReviewSample(reviews, {
    platform: 'steam',
    offset: firstSample.sampleInfo.nextOffset,
  });

  assert.equal(DEFAULT_STEAM_ANALYSIS_REVIEW_LIMIT, 200);
  assert.equal(DEFAULT_ANALYSIS_REVIEW_BATCH_SIZE, 100);
  assert.equal(MAX_ANALYSIS_REVIEW_BATCH_SIZE, 100);
  assert.equal(firstSample.sampleInfo.duplicateReviewCount, 1);
  assert.equal(firstSample.sampleInfo.uniqueReviewCount, 202);
  assert.equal(firstSample.sampleInfo.selectedReviewCount, 200);
  assert.equal(firstSample.sampleInfo.omittedReviewCount, 2);
  assert.equal(firstSample.sampleInfo.hasMore, true);
  assert.deepEqual(nextSample.reviews.map(({ text }) => text), [
    'Review number 200',
    'Different text with the same review ID',
  ]);
  assert.equal(nextSample.sampleInfo.sampleStart, 201);
  assert.equal(nextSample.sampleInfo.hasMore, false);
});

test('an 11,000-review Steam listing stays capped and is never sent in one request', async () => {
  const sourceReviews = Array.from({ length: 11_000 }, (_, index) => ({
    id: `steam-${index}`,
    text: `Unique Steam review ${index}`,
  }));
  const sample = createAnalysisReviewSample(sourceReviews, {
    platform: 'steam',
    sourceReviewCount: sourceReviews.length,
  });
  const requestSizes = [];

  await requestReviewBatches(sample.reviews, {
    batchSize: sample.sampleInfo.batchSize,
    request: async (batch) => {
      requestSizes.push(batch.length);
      return { predictions: batch.map(() => 'Happy') };
    },
  });

  assert.equal(sample.sampleInfo.uniqueReviewCount, 11_000);
  assert.equal(sample.sampleInfo.selectedReviewCount, 200);
  assert.equal(sample.sampleInfo.omittedReviewCount, 10_800);
  assert.deepEqual(requestSizes, [100, 100]);
});

test('analysis counts exclude unsupported reviews while preserving the 20-record source batch', async () => {
  const reviews = [
    {
      id: 'japanese',
      text: 'この商品はとても良いです。使いやすくて満足しています。品質も高く、また購入したいです。',
    },
    ...Array.from({ length: 19 }, (_, index) => ({
      id: `english-${index}`,
      text: `The product is useful and works well for review ${index}.`,
    })),
  ];

  const prepared = await prepareReviewsForAnalysis(reviews);
  const sample = createAnalysisReviewSample(prepared.reviews, {
    platform: 'steam',
    sourceReviewCount: reviews.length,
  });

  assert.equal(reviews.length, 20);
  assert.equal(prepared.reviews.length, 19);
  assert.equal(prepared.skippedReviews.length, 1);
  assert.equal(prepared.skippedReviews[0].review.id, 'japanese');
  assert.equal(sample.sampleInfo.selectedReviewCount, 19);
  assert.equal(sample.sampleInfo.sourceReviewCount, 20);
});

test('sampling preserves original review objects and does not cap non-Steam sources', () => {
  const reviews = [
    { id: 'short', text: 'OK' },
    { id: 'emoji', text: '👍' },
  ];
  const plan = createAnalysisReviewSample(reviews, { platform: 'google' });

  assert.strictEqual(plan.reviews[0], reviews[0]);
  assert.strictEqual(plan.reviews[1], reviews[1]);
  assert.equal(plan.sampleInfo.selectedReviewCount, 2);
  assert.equal(plan.sampleInfo.duplicateReviewCount, 0);
});

test('review requests run in bounded batches, preserve result order, and report progress', async () => {
  const reviews = Array.from({ length: 120 }, (_, index) => `review-${index}`);
  const requestedBatchSizes = [];
  const progress = [];
  const responses = await requestReviewBatches(reviews, {
    request: async (batch) => {
      requestedBatchSizes.push(batch.length);
      return {
        predictions: batch.map((review) => Number(review.slice('review-'.length)) + 1),
        results: batch.map((review) => ({ review })),
      };
    },
    onProgress: (state) => progress.push(state),
  });

  const merged = mergeSvmBatchResponses(responses, reviews.length);
  assert.deepEqual(requestedBatchSizes, [100, 20]);
  assert.deepEqual(merged.predictions, reviews.map((_, index) => index + 1));
  assert.deepEqual(merged.results.map(({ review }) => review), reviews);
  assert.deepEqual(progress.map(({ completedReviews }) => completedReviews), [100, 120]);
  assert.throws(
    () => mergeSvmBatchResponses([{ predictions: [1] }], 2),
    /returned 1 predictions for 2 reviews/,
  );
});

test('emotion model provenance remains aligned across ordered request batches', () => {
  const selectionConfiguration = {
    environmentVariable: 'VOXREVIEW_EMOTION_MODEL',
    configuredValue: null,
    selectedWorker: 'logistic_regression',
  };
  const responses = [
    {
      predictions: [2, 1],
      results: [
        { category: 2, mode: 'baseline', routing_mode: 'baseline_default' },
        {
          category: 1,
          mode: 'specialist_trigger',
          routing_mode: 'specialist_override',
        },
      ],
      modelProvenance: {
        modelIdentifier: 'logistic_regression',
        artifactSha256: 'a'.repeat(64),
        selectionConfiguration,
        reviewPredictions: [
          { reviewIndex: 0, prediction: 2 },
          { reviewIndex: 1, prediction: 1 },
        ],
      },
    },
    {
      predictions: [6],
      results: [{
        category: 6,
        mode: 'baseline',
        routing_mode: 'baseline_default',
      }],
      modelProvenance: {
        modelIdentifier: 'logistic_regression',
        artifactSha256: 'a'.repeat(64),
        selectionConfiguration,
        reviewPredictions: [{ reviewIndex: 2, prediction: 6 }],
      },
    },
  ];

  const merged = mergeSvmBatchResponses([...responses].reverse(), 3);

  assert.deepEqual(merged.predictions, [2, 1, 6]);
  assert.deepEqual(merged.results.map(({ category }) => category), [2, 1, 6]);
  assert.deepEqual(merged.results.map(({ mode }) => mode), [
    'baseline',
    'specialist_trigger',
    'baseline',
  ]);
  assert.deepEqual(merged.results.map(({ routing_mode }) => routing_mode), [
    'baseline_default',
    'specialist_override',
    'baseline_default',
  ]);
  assert.equal(merged.modelProvenance.modelIdentifier, 'logistic_regression');
  assert.deepEqual(merged.modelProvenance.reviewPredictions, [
    { reviewIndex: 0, prediction: 2 },
    { reviewIndex: 1, prediction: 1 },
    { reviewIndex: 2, prediction: 6 },
  ]);
  assert.equal(getEmotionModelDisplayName(merged.modelProvenance.modelIdentifier), 'Logistic Regression');
  assert.equal(
    getCommonEmotionModelIdentifier({ runs: [merged.modelProvenance] }, 3),
    'logistic_regression',
  );
  assert.equal(getEmotionModelDisplayName(undefined), null);
  assert.equal(getEmotionModelDisplayName(''), null);
  assert.equal(getEmotionModelDisplayName('svm'), 'SVM');
  assert.equal(getEmotionModelDisplayName('SVM'), 'SVM');
  assert.equal(getEmotionModelDisplayName('logistic_regression'), 'Logistic Regression');
  assert.equal(getEmotionModelDisplayName('Logistic Regression'), 'Logistic Regression');
  assert.equal(getEmotionModelDisplayName('hybrid_oof_stacking'), 'Hybrid Emotion Classifier');
  assert.equal(getCommonEmotionModelIdentifier(undefined, 3), null);
});

test('hybrid batch merging restores per-review probabilities and recomputes actual counts', () => {
  const labels = ['Happy', 'Sad', 'Anger', 'Disgust', 'Fear', 'Sarcastic'];
  const selectionConfiguration = {
    inferencePolicy: 'hybrid_oof_stacking',
    configuredValue: null,
    selectedWorker: 'hybrid_oof_stacking',
  };
  const makeBatch = (reviewIndexes, categories) => ({
    predictions: categories,
    results: categories.map((category) => ({ category, emotionDrivers: [] })),
    totalReviews: categories.length,
    dominantEmotion: 'Happy',
    distribution: Object.fromEntries(labels.map((emotion) => [
      emotion,
      { count: 0, percentage: 100 / labels.length },
    ])),
    predictedCounts: Object.fromEntries(labels.map((emotion) => [emotion, 0])),
    perReview: categories.map((category, index) => ({
      reviewIndex: reviewIndexes[index],
      category,
      dominantEmotion: labels[category - 1],
      probabilities: Object.fromEntries(labels.map((emotion) => [emotion, 100 / labels.length])),
    })),
    modelProvenance: {
      modelIdentifier: 'hybrid_oof_stacking',
      artifactSha256: 'b'.repeat(64),
      inferencePolicy: 'hybrid_oof_stacking',
      architecture: 'word_char_tfidf_oof_stacking',
      specialistThresholds: { Disgust: {}, Fear: {}, Sarcastic: {} },
      selectionConfiguration,
      reviewPredictions: categories.map((prediction, index) => ({
        reviewIndex: reviewIndexes[index],
        prediction,
      })),
    },
  });
  const merged = mergeSvmBatchResponses([
    makeBatch([1, 2], [1, 6]),
    makeBatch([0], [2]),
  ], 3);

  assert.deepEqual(merged.predictions, [2, 1, 6]);
  assert.deepEqual(merged.perReview.map(({ reviewIndex }) => reviewIndex), [0, 1, 2]);
  assert.equal(merged.totalReviews, 3);
  assert.deepEqual(merged.predictedCounts, {
    Happy: 1,
    Sad: 1,
    Anger: 0,
    Disgust: 0,
    Fear: 0,
    Sarcastic: 1,
  });
  assert.deepEqual(
    Object.values(merged.distribution).map(({ count }) => count),
    [1, 1, 0, 0, 0, 1],
  );
  assert.ok(Object.values(merged.distribution).every(({ percentage }) => percentage > 0));
  assert.equal(
    Object.values(merged.distribution).reduce((sum, { percentage }) => sum + percentage, 0),
    100,
  );
  assert.equal(merged.modelProvenance.modelIdentifier, 'hybrid_oof_stacking');
  assert.equal(merged.modelProvenance.architecture, 'word_char_tfidf_oof_stacking');
});

test('batch provenance becomes unknown when model identity differs between batches', () => {
  const makeProvenance = (modelIdentifier, prediction, reviewIndex) => ({
    modelIdentifier,
    artifactSha256: 'a'.repeat(64),
    selectionConfiguration: { selectedWorker: modelIdentifier },
    reviewPredictions: [{ reviewIndex, prediction }],
  });
  const merged = mergeSvmBatchResponses([
    { predictions: [1], modelProvenance: makeProvenance('svm', 1, 0) },
    { predictions: [2], modelProvenance: makeProvenance('logistic_regression', 2, 1) },
  ], 2);

  assert.equal(merged.modelProvenance.modelIdentifier, null);
  assert.equal(merged.modelProvenance.artifactSha256, null);
  assert.equal(getCommonEmotionModelIdentifier({ runs: [merged.modelProvenance] }, 2), null);
});

test('batch boundaries cover 0, 1, 99, 100, 101, and 250 comments without loss or reordering', async () => {
  for (const [count, expectedSizes] of [
    [0, []],
    [1, [1]],
    [99, [99]],
    [100, [100]],
    [101, [100, 1]],
    [250, [100, 100, 50]],
  ]) {
    const comments = Array.from({ length: count }, (_, index) => ({
      id: `comment-${index}`,
      text: `Comment text ${index}`,
    }));
    const sizes = [];
    let activeRequests = 0;
    let maximumConcurrentRequests = 0;
    const responses = await requestReviewBatches(comments, {
      request: async (batch) => {
        sizes.push(batch.length);
        activeRequests += 1;
        maximumConcurrentRequests = Math.max(maximumConcurrentRequests, activeRequests);
        await Promise.resolve();
        activeRequests -= 1;
        return {
          predictions: batch.map(({ id }) => id),
          results: batch.map((comment) => ({ id: comment.id, analyzedText: comment.text })),
        };
      },
    });

    assert.deepEqual(sizes, expectedSizes, `${count} comments`);
    assert.equal(maximumConcurrentRequests, count === 0 ? 0 : 1);
    if (count === 0) {
      assert.deepEqual(responses, []);
      continue;
    }

    const merged = mergeSvmBatchResponses(responses, comments.length);
    assert.deepEqual(merged.predictions, comments.map(({ id }) => id));
    assert.deepEqual(
      merged.results.map(({ id, analyzedText }) => ({ id, analyzedText })),
      comments.map(({ id, text }) => ({ id, analyzedText: text })),
    );
  }
});

test('configured batch sizes above the maximum are capped at 100', async () => {
  const sample = createAnalysisReviewSample(['first', 'second'], {
    batchSize: 250,
  });
  assert.equal(sample.sampleInfo.batchSize, 100);

  const requestedSizes = [];
  await requestReviewBatches(Array.from({ length: 250 }, (_, index) => index), {
    batchSize: 250,
    request: async (batch) => {
      requestedSizes.push(batch.length);
      return { predictions: batch };
    },
  });
  assert.deepEqual(requestedSizes, [100, 100, 50]);
});

test('topic batch indexes are restored to their original review positions', () => {
  const merged = mergeTopicBatchResponses([
    { results: [{ reviewIndex: 0, topics: [] }, { reviewIndex: 1, topics: [] }] },
    { results: [{ reviewIndex: 0, topics: [] }] },
  ], 3);

  assert.deepEqual(merged.results.map(({ reviewIndex }) => reviewIndex), [0, 1, 2]);
  assert.throws(
    () => mergeTopicBatchResponses([{ results: [{ reviewIndex: 0, topics: [] }] }], 2),
    /returned 1 results for 2 reviews/,
  );
});

test('batch failures and cancellation propagate without returning a partial success', async () => {
  const reviews = ['first', 'second', 'third'];
  let requestCount = 0;
  await assert.rejects(requestReviewBatches(reviews, {
    batchSize: 1,
    request: async () => {
      requestCount += 1;
      if (requestCount === 2) throw new Error('batch timed out');
      return { predictions: [1] };
    },
  }), /Batch 2 of 3 failed: batch timed out/);
  assert.equal(requestCount, 2);

  const controller = new AbortController();
  let cancelledRequestCount = 0;
  await assert.rejects(requestReviewBatches(reviews, {
    batchSize: 1,
    signal: controller.signal,
    request: async () => {
      cancelledRequestCount += 1;
      controller.abort(new DOMException('cancelled', 'AbortError'));
      return { predictions: [1] };
    },
  }), { name: 'AbortError' });
  assert.equal(cancelledRequestCount, 1);
});

test('request timeouts remain explicit batch failures', async () => {
  const timeoutError = Object.assign(new Error('SVM batch timed out.'), {
    name: 'TimeoutError',
    code: 'ETIMEDOUT',
  });
  await assert.rejects(requestReviewBatches(['review-1', 'review-2'], {
    batchSize: 1,
    request: async () => { throw timeoutError; },
  }), (error) => error.name === 'TimeoutError' && error.code === 'ETIMEDOUT');
});

test('invalid batch limits are surfaced instead of silently falling back', async () => {
  assert.throws(
    () => createAnalysisReviewSample([], { platform: 'steam', maxSteamReviews: 0 }),
    /Steam analysis review limit must be a positive integer/,
  );
  await assert.rejects(
    requestReviewBatches(['review'], {
      batchSize: 0,
      request: async () => ({ predictions: [1] }),
    }),
    /analysis batch size must be a positive integer/,
  );
});
