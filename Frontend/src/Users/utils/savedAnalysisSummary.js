const EMOTION_LABELS = new Map([
  [1, 'Happy'],
  [2, 'Sad'],
  [3, 'Anger'],
  [4, 'Disgust'],
  [5, 'Fear'],
  [6, 'Sarcastic'],
]);

const EMOTION_CATEGORIES = new Map(
  [...EMOTION_LABELS].flatMap(([category, label]) => [
    [String(category), category],
    [label.toLowerCase(), category],
    ...(label === 'Anger' ? [['angry', category]] : []),
  ]),
);

function getEmotionCategory(value) {
  return EMOTION_CATEGORIES.get(String(value ?? '').trim().toLowerCase()) || null;
}

function getPredictionSummary(results, reviews) {
  if (!Array.isArray(results) || results.length === 0 ||
    (Array.isArray(reviews) && reviews.length > 0 && results.length !== reviews.length)) {
    return null;
  }

  const categories = results.map((result) => (
    getEmotionCategory(result?.category) || getEmotionCategory(result?.emotion)
  ));
  if (categories.some((category) => category === null)) return null;

  return summarizeCategories(categories);
}

function summarizeCategories(categories) {
  const counts = new Map([...EMOTION_LABELS.keys()].map((category) => [category, 0]));
  categories.forEach((category) => counts.set(category, counts.get(category) + 1));
  return summarizeCounts(counts);
}

function summarizeCounts(counts) {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (!total) return null;

  const dominantCategory = [...EMOTION_LABELS.keys()]
    .reduce((dominant, category) => (
      counts.get(category) > counts.get(dominant) ? category : dominant
    ));

  return {
    dominantEmotion: EMOTION_LABELS.get(dominantCategory),
    percentage: `${Math.round((counts.get(dominantCategory) / total) * 100)}%`,
  };
}

function getAggregateSummary(emotions) {
  if (!Array.isArray(emotions) || emotions.length === 0) return null;

  const counts = new Map([...EMOTION_LABELS.keys()].map((category) => [category, 0]));
  for (const emotion of emotions) {
    const category = getEmotionCategory(emotion?.category) ||
      getEmotionCategory(emotion?.id) ||
      getEmotionCategory(emotion?.label);
    const count = emotion?.count;
    if (category === null || !Number.isSafeInteger(count) || count < 0) return null;
    counts.set(category, counts.get(category) + count);
  }

  return summarizeCounts(counts);
}

export function getSavedAnalysisSummary(item) {
  const reviews = Array.isArray(item?.reviews) ? item.reviews : null;
  const reviewAnalysisSummary = getPredictionSummary(item?.reviewAnalysis, reviews);
  if (reviewAnalysisSummary) return reviewAnalysisSummary;

  const quoteSummary = getPredictionSummary(item?.emotionData?.quotes, reviews);
  if (quoteSummary) return quoteSummary;

  return getAggregateSummary(item?.emotionData?.emotions);
}
