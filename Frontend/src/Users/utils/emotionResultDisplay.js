const EMOTION_LABELS = Object.freeze([
  'Happy',
  'Sad',
  'Anger',
  'Disgust',
  'Fear',
  'Sarcastic',
]);

// Producers use Math.round; this only allows floating-point serialization noise.
const PERCENTAGE_ROUNDING_TOLERANCE = 1e-9;

function isConsistentRoundedPercentage(percentage, count, totalReviews) {
  const exactPercentage = totalReviews === 0 ? 0 : (count / totalReviews) * 100;
  const roundedPercentage = Math.floor(exactPercentage + 0.5);
  return Math.abs(percentage - roundedPercentage) <= PERCENTAGE_ROUNDING_TOLERANCE;
}

export function isValidEmotionAnalysisData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (!Number.isSafeInteger(data.totalReviews) || data.totalReviews < 0) return false;
  if (!data.dominantEmotion || typeof data.dominantEmotion.label !== 'string') return false;
  if (!Number.isFinite(data.dominantEmotion.percentage) ||
      data.dominantEmotion.percentage < 0 ||
      data.dominantEmotion.percentage > 100) return false;
  if (!Array.isArray(data.emotions) || data.emotions.length === 0) return false;
  if (!Array.isArray(data.quotes)) return false;

  if (data.emotions.length !== EMOTION_LABELS.length) return false;
  const emotionByLabel = new Map();
  const validEmotions = data.emotions.every((emotion) => {
    if (!emotion ||
        typeof emotion.id !== 'string' ||
        typeof emotion.label !== 'string' ||
        !EMOTION_LABELS.includes(emotion.label) ||
        emotion.id !== emotion.label.toLowerCase() ||
        emotionByLabel.has(emotion.label) ||
        !Number.isSafeInteger(emotion.count) ||
        emotion.count < 0 ||
        !Number.isFinite(emotion.percentage) ||
        emotion.percentage < 0 ||
        emotion.percentage > 100 ||
        !isConsistentRoundedPercentage(
          emotion.percentage,
          emotion.count,
          data.totalReviews,
        )) return false;
    emotionByLabel.set(emotion.label, emotion);
    return true;
  });
  if (!validEmotions ||
      EMOTION_LABELS.some((label) => !emotionByLabel.has(label)) ||
      data.emotions.reduce((total, emotion) => total + emotion.count, 0) !== data.totalReviews) {
    return false;
  }

  if (data.totalReviews === 0) {
    return data.dominantEmotion.label === 'No included reviews' &&
      isConsistentRoundedPercentage(data.dominantEmotion.percentage, 0, 0);
  }

  const maximumCount = Math.max(...data.emotions.map((emotion) => emotion.count));
  const dominantCandidates = data.emotions.filter((emotion) => emotion.count === maximumCount);
  return dominantCandidates.some((emotion) => (
    emotion.label === data.dominantEmotion.label &&
    isConsistentRoundedPercentage(
      data.dominantEmotion.percentage,
      emotion.count,
      data.totalReviews,
    )
  ));
}

function getContextFallbackText(emotion) {
  if (emotion?.label === 'Sarcastic') {
    return 'Has no explicit keyword; sarcasm is inferred from contrasting sentence tone.';
  }
  return 'Has no single trigger keyword; emotion is inferred from overall sentence phrasing.';
}

export function getEmotionResultDisplay(emotion, evidencePhrases) {
  const model = typeof emotion?.model === 'string' && emotion.model.trim()
    ? emotion.model
    : null;
  const phrases = Array.isArray(evidencePhrases)
    ? [...new Set(evidencePhrases
      .filter((phrase) => typeof phrase === 'string' && phrase.trim())
      .map((phrase) => phrase.trim()))]
    : [];

  return {
    model,
    evidencePhrases: phrases,
    evidenceFallback: phrases.length === 0 && emotion?.count !== 0
      ? {
          title: 'Overall Sentence Context',
          description: getContextFallbackText(emotion),
        }
      : null,
    evidenceMessage: phrases.length === 0 && emotion?.count === 0
      ? `No reviews were classified into ${emotion.label}, so no emotion evidence phrases are available.`
      : null,
  };
}
