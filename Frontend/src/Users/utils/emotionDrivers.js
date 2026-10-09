import { getReviewKeywordPhrases, getReviewText } from './reviewTopics.js';

const EMOTION_DRIVER_STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any',
  'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between',
  'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'either', 'else', 'every', 'few', 'for', 'from', 'further', 'game', 'games',
  'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if',
  'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'keep', 'keeps', 'kept', 'keeping',
  'less', 'many', 'may', 'me', 'might', 'mine', 'more', 'most', 'must', 'my', 'myself',
  'neither', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves',
  'out', 'over', 'own', 'per', 'said', 'same', 'say', 'says', 'she', 'should', 'since',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'whose', 'why', 'will', 'with', 'would', 'you', 'your', 'yours',
  'yourself', 'yourselves', 'app', 'apps', 'product', 'products', 'review', 'reviews',
  'thing', 'things', 'time', 'times',
]);

export function filterEmotionDriver(driver) {
  if (typeof driver !== 'string') return '';

  return (driver.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || [])
    .filter((word) => !EMOTION_DRIVER_STOP_WORDS.has(word.toLocaleLowerCase()))
    .join(' ');
}

export function getSvmEmotionKeywords(explanationResults, category, reviews = []) {
  const phraseFrequencies = new Map();
  const driverFrequencies = new Map();
  const surfaces = new Map();
  const hasSourceReviews = reviews.length > 0 ||
    explanationResults.some((result) => result?.review != null);

  explanationResults.forEach((result, reviewIndex) => {
    if (result?.category !== category || !Array.isArray(result.emotionDrivers)) return;
    const reviewText = getReviewText(reviews[reviewIndex] ?? result.review);
    const filteredDrivers = new Set(
      result.emotionDrivers
        .map(filterEmotionDriver)
        .filter(Boolean),
    );
    const driverWords = new Set(
      [...filteredDrivers]
        .flatMap((driver) => driver.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || [])
        .map((word) => word.toLocaleLowerCase()),
    );
    const reviewPhrases = new Set(
      getReviewKeywordPhrases(reviewText)
        .filter((phrase) => phrase.trim().split(/\s+/u).length > 1),
    );

    reviewPhrases.forEach((phrase) => {
      const key = phrase.toLocaleLowerCase();
      const current = phraseFrequencies.get(key) || {
        phrase,
        reviewIndexes: new Set(),
        driverMatches: 0,
      };
      current.reviewIndexes.add(reviewIndex);
      const phraseWords = phrase.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || [];
      current.driverMatches = Math.max(
        current.driverMatches,
        phraseWords.filter((word) => driverWords.has(word.toLocaleLowerCase())).length,
      );
      phraseFrequencies.set(key, current);
    });

    filteredDrivers.forEach((driver) => {
      const normalizedDriver = driver.toLocaleLowerCase();
      const sourceWords = new Set(
        (reviewText.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || [])
          .map((word) => word.toLocaleLowerCase()),
      );
      const driverWordsForSource = normalizedDriver.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || [];
      const appearsInSource = !hasSourceReviews ||
        (Boolean(reviewText) && driverWordsForSource.every((word) => sourceWords.has(word)));
      if (!appearsInSource) return;
      driverFrequencies.set(normalizedDriver, (driverFrequencies.get(normalizedDriver) || 0) + 1);
      if (!surfaces.has(normalizedDriver)) surfaces.set(normalizedDriver, driver);
    });
  });

  const phrases = [...phraseFrequencies.values()];

  if (phrases.length > 0) {
    const nonRedundantPhrases = phrases.filter((candidate) => {
      const candidateWords = candidate.phrase.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || [];
      return !phrases.some((other) => {
        if (other === candidate || other.phrase.length <= candidate.phrase.length) return false;
        if (![...candidate.reviewIndexes].some((index) => other.reviewIndexes.has(index))) return false;
        const otherWords = other.phrase.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || [];
        return candidateWords.length < otherWords.length &&
          otherWords.some((_, start) => candidateWords.every((word, offset) => otherWords[start + offset] === word));
      });
    });

    return nonRedundantPhrases
      .sort((first, second) => (
        second.reviewIndexes.size - first.reviewIndexes.size ||
        second.driverMatches - first.driverMatches ||
        second.phrase.split(/\s+/u).length - first.phrase.split(/\s+/u).length ||
        first.phrase.localeCompare(second.phrase)
      ))
      .slice(0, 5)
      .map(({ phrase }) => phrase);
  }

  return [...driverFrequencies.entries()]
    .filter(([, count]) => count > 0)
    .sort(([leftTerm, leftCount], [rightTerm, rightCount]) => rightCount - leftCount || leftTerm.localeCompare(rightTerm))
    .slice(0, 5)
    .map(([term]) => surfaces.get(term));
}
