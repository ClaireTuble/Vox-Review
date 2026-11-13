export const DEFAULT_STEAM_ANALYSIS_REVIEW_LIMIT = 200;
export const MAX_ANALYSIS_REVIEW_BATCH_SIZE = 100;
export const DEFAULT_ANALYSIS_REVIEW_BATCH_SIZE = MAX_ANALYSIS_REVIEW_BATCH_SIZE;

function readPositiveInteger(value, fallback, name) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function resolveAnalysisReviewBatchSize(
  value = DEFAULT_ANALYSIS_REVIEW_BATCH_SIZE,
  name = 'analysis batch size',
) {
  return Math.min(
    readPositiveInteger(value, DEFAULT_ANALYSIS_REVIEW_BATCH_SIZE, name),
    MAX_ANALYSIS_REVIEW_BATCH_SIZE,
  );
}

function reviewText(review) {
  if (typeof review === 'string') return review;
  return [
    review?.text,
    review?.reviewText,
    review?.comment,
    review?.review,
    review?.content,
    review?.body,
    review?.reviewBody,
  ].find((value) => typeof value === 'string' && value.trim()) || '';
}

function normalizeReviewText(text) {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

const EMOTION_MODEL_NAMES = {
  hybrid_oof_stacking: 'Hybrid Emotion Classifier',
  logistic_regression: 'Logistic Regression',
  'logistic-regression': 'Logistic Regression',
  'logistic regression': 'Logistic Regression',
  svm: 'SVM',
};
const EMOTION_LABELS = ['Happy', 'Sad', 'Anger', 'Disgust', 'Fear', 'Sarcastic'];
const PROBABILITY_FLOOR = 0.01;

export function getEmotionModelDisplayName(modelIdentifier) {
  if (typeof modelIdentifier !== 'string') return null;
  const normalized = modelIdentifier.trim().toLowerCase();
  return EMOTION_MODEL_NAMES[normalized] || (normalized === 'svm' ? 'SVM' : null);
}

export function getCommonEmotionModelIdentifier(provenance, reviewCount) {
  if (!Array.isArray(provenance?.runs) || !Number.isInteger(reviewCount) || reviewCount < 1) {
    return null;
  }
  const modelByReview = Array(reviewCount).fill(null);
  for (const run of provenance.runs) {
    if (!getEmotionModelDisplayName(run?.modelIdentifier) ||
      !Array.isArray(run.reviewPredictions)) return null;
    for (const entry of run.reviewPredictions) {
      if (!Number.isInteger(entry?.reviewIndex) ||
        entry.reviewIndex < 0 ||
        entry.reviewIndex >= reviewCount ||
        !Number.isInteger(entry.prediction) ||
        entry.prediction < 1 ||
        entry.prediction > 6 ||
        modelByReview[entry.reviewIndex] !== null) return null;
      modelByReview[entry.reviewIndex] = run.modelIdentifier;
    }
  }
  if (modelByReview.some((modelIdentifier) => modelIdentifier === null)) return null;
  return modelByReview.every((modelIdentifier) => modelIdentifier === modelByReview[0])
    ? modelByReview[0]
    : null;
}

function deduplicateSteamReviews(reviews) {
  const seenTexts = new Set();
  const uniqueReviews = [];
  let duplicateReviewCount = 0;

  reviews.forEach((review) => {
    const text = reviewText(review);
    const normalizedText = normalizeReviewText(text);
    if (normalizedText && seenTexts.has(normalizedText)) {
      duplicateReviewCount += 1;
      return;
    }
    if (normalizedText) seenTexts.add(normalizedText);
    uniqueReviews.push(review);
  });

  return { reviews: uniqueReviews, duplicateReviewCount };
}

export function createAnalysisReviewSample(reviews, {
  platform = '',
  offset = 0,
  maxSteamReviews = import.meta.env?.VITE_STEAM_ANALYSIS_MAX_REVIEWS,
  batchSize = import.meta.env?.VITE_ANALYSIS_REVIEW_BATCH_SIZE,
  sourceReviewCount = Array.isArray(reviews) ? reviews.length : 0,
} = {}) {
  if (!Array.isArray(reviews)) throw new TypeError('reviews must be an array.');
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError('sample offset must be a non-negative integer.');
  }
  const resolvedBatchSize = resolveAnalysisReviewBatchSize(
    batchSize,
    'analysis batch size',
  );
  const isSteam = String(platform).toLowerCase() === 'steam';
  const reviewLimit = isSteam
    ? readPositiveInteger(
        maxSteamReviews,
        DEFAULT_STEAM_ANALYSIS_REVIEW_LIMIT,
        'Steam analysis review limit',
      )
    : reviews.length;
  const deduplicated = isSteam
    ? deduplicateSteamReviews(reviews)
    : { reviews, duplicateReviewCount: 0 };
  const sampleOffset = isSteam ? Math.min(offset, deduplicated.reviews.length) : 0;
  const selectedReviews = deduplicated.reviews.slice(sampleOffset, sampleOffset + reviewLimit);
  const nextOffset = sampleOffset + selectedReviews.length;
  const sampleInfo = {
    platform: String(platform).toLowerCase(),
    sourceReviewCount,
    extractedReviewCount: sourceReviewCount,
    usableReviewCount: reviews.length,
    uniqueReviewCount: deduplicated.reviews.length,
    duplicateReviewCount: deduplicated.duplicateReviewCount,
    reviewLimit,
    batchSize: resolvedBatchSize,
    sampleOffset,
    sampleStart: selectedReviews.length ? sampleOffset + 1 : 0,
    sampleEnd: nextOffset,
    selectedReviewCount: selectedReviews.length,
    supportedReviewCount: 0,
    uncertainReviewCount: 0,
    analyzedReviewCount: 0,
    unsupportedReviewCount: 0,
    failedReviewCount: 0,
    cancelledReviewCount: 0,
    topicFailedReviewCount: 0,
    omittedReviewCount: Math.max(0, deduplicated.reviews.length - selectedReviews.length),
    hasMore: nextOffset < deduplicated.reviews.length,
    nextOffset,
  };

  return { reviews: selectedReviews, sampleInfo };
}

export async function requestReviewBatches(reviews, {
  batchSize = DEFAULT_ANALYSIS_REVIEW_BATCH_SIZE,
  signal,
  request,
  onProgress = () => {},
} = {}) {
  if (!Array.isArray(reviews) || typeof request !== 'function') {
    throw new TypeError('A review array and batch request function are required.');
  }
  const resolvedBatchSize = resolveAnalysisReviewBatchSize(batchSize);
  const batchCount = Math.ceil(reviews.length / resolvedBatchSize);
  const responses = [];

  for (let start = 0; start < reviews.length; start += resolvedBatchSize) {
    if (signal?.aborted) {
      throw signal.reason || new DOMException('Analysis was cancelled.', 'AbortError');
    }
    const end = Math.min(start + resolvedBatchSize, reviews.length);
    const batchIndex = responses.length;
    let response;
    try {
      response = await request(reviews.slice(start, end), {
        batchIndex,
        batchCount,
        start,
        end,
        signal,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason || new DOMException('Analysis was cancelled.', 'AbortError');
      }
      const cause = error instanceof Error ? error : new Error(String(error));
      const batchError = new Error(
        `Batch ${batchIndex + 1} of ${batchCount} failed: ${cause.message}`,
        { cause },
      );
      for (const property of ['code', 'httpStatus', 'name']) {
        if (property in cause) batchError[property] = cause[property];
      }
      throw batchError;
    }
    if (signal?.aborted) {
      throw signal.reason || new DOMException('Analysis was cancelled.', 'AbortError');
    }
    responses.push(response);
    await onProgress({
      completedReviews: end,
      totalReviews: reviews.length,
      completedBatches: responses.length,
      totalBatches: batchCount,
      batchSize: resolvedBatchSize,
    });
  }

  return responses;
}

export function mergeSvmBatchResponses(responses, expectedReviewCount) {
  if (!responses.length) throw new Error('SVM returned no batch responses.');
  const merged = {
    ...responses[0],
    predictions: responses.flatMap((response) => response?.predictions || []),
  };
  if (responses.every((response) => Array.isArray(response?.results))) {
    merged.results = responses.flatMap((response) => response.results);
  } else {
    delete merged.results;
  }
  if (responses.every((response) => response?.categoryDrivers &&
      typeof response.categoryDrivers === 'object')) {
    merged.categoryDrivers = Object.assign({}, ...responses.map((response) => response.categoryDrivers));
  } else {
    delete merged.categoryDrivers;
  }
  const richDetailKeys = [
    'totalReviews',
    'dominantEmotion',
    'distribution',
    'predictedCounts',
    'perReview',
  ];
  const hasRichDetails = responses.some((response) =>
    richDetailKeys.some((key) => response?.[key] !== undefined));
  if (hasRichDetails) {
    const completeRichDetails = responses.every((response) => (
      response?.totalReviews === response.predictions?.length &&
      typeof response?.dominantEmotion === 'string' &&
      response?.distribution &&
      response?.predictedCounts &&
      Array.isArray(response?.perReview) &&
      response.perReview.length === response.predictions.length
    ));
    if (!completeRichDetails) {
      throw new Error('Emotion batches returned incomplete hybrid prediction details.');
    }
    const indexedDetails = responses.flatMap((response) => (
      response.perReview.map((row, localIndex) => {
        if (row?.category !== response.predictions[localIndex]) {
          throw new Error('Emotion batches returned misaligned hybrid prediction details.');
        }
        return {
          row,
          result: response.results?.[localIndex],
        };
      })
    ));
    const perReview = indexedDetails.map(({ row }) => row);
    const orderedPerReview = [...perReview].sort(
      (first, second) => first.reviewIndex - second.reviewIndex,
    );
    const orderedDetails = [...indexedDetails].sort(
      (first, second) => first.row.reviewIndex - second.row.reviewIndex,
    );
    const expectedCount = Number.isInteger(expectedReviewCount)
      ? expectedReviewCount
      : merged.predictions.length;
    if (
      orderedPerReview.length !== expectedCount ||
      orderedPerReview.some((row, index) => (
        row?.reviewIndex !== index ||
        row?.dominantEmotion !== EMOTION_LABELS[row.category - 1] ||
        !row?.probabilities ||
        Object.keys(row.probabilities).length !== EMOTION_LABELS.length ||
        EMOTION_LABELS.some((emotion) => (
          !Number.isFinite(row.probabilities[emotion]) ||
          row.probabilities[emotion] <= 0
        )) ||
        Math.abs(
          Object.values(row.probabilities).reduce((sum, value) => sum + value, 0) - 100,
        ) > 0.02
      ))
    ) {
      throw new Error('Emotion batches returned misaligned hybrid prediction details.');
    }
    merged.predictions = orderedPerReview.map(({ category }) => category);
    if (responses.every((response) => Array.isArray(response?.results))) {
      merged.results = orderedDetails.map(({ result }) => result);
    }
    const counts = Object.fromEntries(EMOTION_LABELS.map((emotion) => [emotion, 0]));
    merged.predictions.forEach((category) => {
      const emotion = EMOTION_LABELS[category - 1];
      if (emotion) counts[emotion] += 1;
    });
    const raw = EMOTION_LABELS.map((emotion) => counts[emotion] / expectedCount);
    const fixed = raw.map((value) => value < PROBABILITY_FLOOR);
    let smoothed;
    while (true) {
      const remainingMass = 1 - PROBABILITY_FLOOR * fixed.filter(Boolean).length;
      const availableMass = raw.reduce(
        (sum, value, index) => sum + (fixed[index] ? 0 : value),
        0,
      );
      smoothed = raw.map((value, index) => (
        fixed[index] ? PROBABILITY_FLOOR : value * remainingMass / availableMass
      ));
      const newlyFixed = smoothed.map(
        (value, index) => !fixed[index] && value < PROBABILITY_FLOOR,
      );
      if (!newlyFixed.some(Boolean)) break;
      newlyFixed.forEach((value, index) => {
        if (value) fixed[index] = true;
      });
    }
    const dominantIndex = raw.indexOf(Math.max(...raw));
    const percentages = smoothed.map((value) => Math.round(value * 10000) / 100);
    percentages[dominantIndex] += 100 - percentages.reduce((sum, value) => sum + value, 0);
    merged.totalReviews = expectedCount;
    merged.predictedCounts = counts;
    merged.dominantEmotion = EMOTION_LABELS[dominantIndex];
    merged.distribution = Object.fromEntries(EMOTION_LABELS.map((emotion, index) => [
      emotion,
      { count: counts[emotion], percentage: percentages[index] },
    ]));
    merged.perReview = orderedPerReview;
  } else {
    richDetailKeys.forEach((key) => delete merged[key]);
  }
  const hasIndexedProvenance = responses.every((response) => (
    Array.isArray(response?.modelProvenance?.reviewPredictions) &&
    response.modelProvenance.reviewPredictions.length === response.predictions?.length &&
    response.modelProvenance.reviewPredictions.every((entry, index) => (
      Number.isSafeInteger(entry?.reviewIndex) &&
      entry.reviewIndex >= 0 &&
      entry?.prediction === response.predictions[index]
    ))
  ));
  const indexedPredictions = hasIndexedProvenance
    ? responses.flatMap((response) => response.modelProvenance.reviewPredictions.map(
        (entry, localIndex) => ({
          reviewIndex: entry.reviewIndex,
          prediction: entry.prediction,
          result: response.results?.[localIndex],
        }),
      ))
    : [];
  const expectedIndexes = Number.isInteger(expectedReviewCount)
    ? expectedReviewCount
    : merged.predictions.length;
  const hasCompleteUniqueIndexes = indexedPredictions.length === expectedIndexes &&
    indexedPredictions.every(({ reviewIndex }) => reviewIndex < expectedIndexes) &&
    new Set(indexedPredictions.map(({ reviewIndex }) => reviewIndex)).size === expectedIndexes;
  if (hasIndexedProvenance && hasCompleteUniqueIndexes) {
    const orderedPredictions = [...indexedPredictions].sort(
      (first, second) => first.reviewIndex - second.reviewIndex,
    );
    merged.predictions = orderedPredictions.map(({ prediction }) => prediction);
    if (responses.every((response) => Array.isArray(response?.results))) {
      merged.results = orderedPredictions.map(({ result }) => result);
    }
    const firstProvenance = responses[0].modelProvenance;
    const consistentModelMetadata = responses.every((response) => (
      response.modelProvenance.modelIdentifier === firstProvenance.modelIdentifier &&
      response.modelProvenance.artifactSha256 === firstProvenance.artifactSha256 &&
      JSON.stringify(response.modelProvenance.selectionConfiguration) ===
        JSON.stringify(firstProvenance.selectionConfiguration) &&
      response.modelProvenance.inferencePolicy === firstProvenance.inferencePolicy &&
      response.modelProvenance.architecture === firstProvenance.architecture &&
      JSON.stringify(response.modelProvenance.specialistThresholds) ===
        JSON.stringify(firstProvenance.specialistThresholds)
    ));
    merged.modelProvenance = {
      modelIdentifier: consistentModelMetadata ? firstProvenance.modelIdentifier : null,
      artifactSha256: consistentModelMetadata ? firstProvenance.artifactSha256 : null,
      inferencePolicy: consistentModelMetadata ? firstProvenance.inferencePolicy : null,
      ...(consistentModelMetadata && firstProvenance.architecture
        ? { architecture: firstProvenance.architecture }
        : {}),
      ...(consistentModelMetadata && firstProvenance.specialistThresholds
        ? { specialistThresholds: firstProvenance.specialistThresholds }
        : {}),
      selectionConfiguration: consistentModelMetadata
        ? firstProvenance.selectionConfiguration
        : null,
      reviewPredictions: orderedPredictions.map(({ reviewIndex, prediction }) => ({
        reviewIndex,
        prediction,
      })),
    };
  } else {
    delete merged.modelProvenance;
  }
  if (Number.isInteger(expectedReviewCount) &&
      merged.predictions.length !== expectedReviewCount) {
    throw new Error(
      `SVM returned ${merged.predictions.length} predictions for ${expectedReviewCount} reviews.`,
    );
  }
  return merged;
}

export function mergeTopicBatchResponses(responses, expectedReviewCount) {
  if (!responses.length) throw new Error('Topic analysis returned no batch responses.');
  let reviewOffset = 0;
  const results = [];
  for (const response of responses) {
    if (!Array.isArray(response?.results)) {
      throw new Error('Topic analysis returned an invalid batch result.');
    }
    response.results.forEach((result, index) => {
      const localIndex = Number.isInteger(result?.reviewIndex) ? result.reviewIndex : index;
      results.push({ ...result, reviewIndex: reviewOffset + localIndex });
    });
    reviewOffset += response.results.length;
  }
  if (Number.isInteger(expectedReviewCount) && results.length !== expectedReviewCount) {
    throw new Error(`Topic analysis returned ${results.length} results for ${expectedReviewCount} reviews.`);
  }
  return { ...responses[0], results };
}
