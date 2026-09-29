const CATEGORY_LABELS = new Map([
  [1, 'happy'],
  [2, 'sad'],
  [3, 'anger'],
  [4, 'disgust'],
  [5, 'fear'],
  [6, 'sarcastic'],
]);

export const SAVED_PLATFORM_OPTIONS = ['Shopee', 'Lazada', 'Google', 'Google Play', 'Steam'];
export const SAVED_EMOTION_OPTIONS = ['Happy', 'Sad', 'Anger', 'Disgust', 'Fear', 'Sarcastic'];

export function toggleSavedFilterSelection(current, value, allOptions) {
  if (current.length === 0 || current.length === allOptions.length) return [value];
  if (current.includes(value)) {
    const remaining = current.filter((option) => option !== value);
    return remaining.length > 0 ? remaining : [...allOptions];
  }
  return [...current, value];
}

function normalizePlatform(value) {
  const normalized = String(value || '').trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
  if (['googlemaps', 'googlereviews'].includes(normalized)) return 'google';
  if (['googleplaystore', 'googleplay'].includes(normalized)) return 'googleplay';
  return normalized;
}

function normalizeEmotion(value) {
  if (typeof value === 'number' || /^\d+$/.test(String(value || ''))) {
    return CATEGORY_LABELS.get(Number(value)) || '';
  }
  const normalized = String(value || '').trim().toLocaleLowerCase();
  return normalized === 'angry' ? 'anger' : normalized;
}

function getSavedEmotionKeys(item) {
  const emotions = new Set();
  const addEmotion = (value) => {
    const normalized = normalizeEmotion(value);
    if (normalized) emotions.add(normalized);
  };

  addEmotion(item?.dominantEmotion);
  (Array.isArray(item?.reviewAnalysis) ? item.reviewAnalysis : []).forEach((review) => {
    addEmotion(review?.category);
    addEmotion(review?.emotion);
  });
  (Array.isArray(item?.emotionData?.emotions) ? item.emotionData.emotions : []).forEach((emotion) => {
    if (emotion?.count == null || emotion.count > 0) {
      addEmotion(emotion?.category);
      addEmotion(emotion?.label);
      addEmotion(emotion?.id);
    }
  });
  (Array.isArray(item?.emotionData?.quotes) ? item.emotionData.quotes : []).forEach((quote) => {
    addEmotion(quote?.category);
    addEmotion(quote?.emotion);
  });

  return emotions;
}

export function filterSavedAnalyses(items, {
  searchQuery = '',
  platforms = [],
  emotions = [],
} = {}) {
  const query = String(searchQuery || '').trim().toLocaleLowerCase();
  const selectedPlatformKeys = new Set(platforms.map(normalizePlatform).filter(Boolean));
  const selectedEmotionKeys = new Set(emotions.map(normalizeEmotion).filter(Boolean));
  const noPlatformRestriction = platforms.length === 0 ||
    selectedPlatformKeys.size >= SAVED_PLATFORM_OPTIONS.length;
  const noEmotionRestriction = emotions.length === 0 ||
    selectedEmotionKeys.size >= SAVED_EMOTION_OPTIONS.length;

  return items.filter((item) => {
    const title = [item?.targetTitle, item?.productTitle, item?.name, item?.title]
      .filter((value) => typeof value === 'string')
      .join(' ')
      .toLocaleLowerCase();
    const matchesSearch = !query || title.includes(query);
    const matchesPlatform = noPlatformRestriction || selectedPlatformKeys.has(normalizePlatform(item?.platform));
    const itemEmotions = getSavedEmotionKeys(item);
    const matchesEmotion = noEmotionRestriction || [...selectedEmotionKeys].some((emotion) => itemEmotions.has(emotion));
    return matchesSearch && matchesPlatform && matchesEmotion;
  });
}
