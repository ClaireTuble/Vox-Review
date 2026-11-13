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
const POSITIVE_EMOTION_CUE = /\b(?:amazing|beautiful|excellent|fantastic|good|great|happy|love(?:d|s)?|nice|perfect|pleased|recommend|satisfied|wonderful)\b/i;
const NEGATIVE_EMOTION_CUE = /\b(?:awful|bad|broken|bug(?:gy)?|can't|cannot|crash(?:es|ed|ing)?|disappoint(?:ed|ing)?|doesn't|does\s+not|downside|fail(?:s|ed|ure)?|freeze(?:s|d|ing)?|glitch(?:y)?|hate(?:s|d)?|issue|issues|lack(?:s|ed|ing)?|lag(?:gy)?|mad|missing|never|no|not|poor|problem|sad|scared|slow|stutter(?:s|ed|ing)?|terrible|unavailable|unsafe|upset|wasn't|won't|worried)\b/i;
const NEGATED_POSITIVE_EMOTION_CUE = /\b(?:doesn't|does\s+not|didn't|did\s+not|isn't|is\s+not|never|no|not|wasn't|was\s+not|without|won't)\b(?:\s+[\p{L}\p{N}'’,-]+){0,3}\s+\b(?:amazing|beautiful|excellent|fantastic|good|great|happy|love(?:d|s)?|nice|perfect|pleased|recommend|satisfied|wonderful)\b/i;
const REVIEW_CLAUSE_BOUNDARY = /\b(?:although|apart\s+from|but|however|though|whereas|yet)\b|[.!?;]+/giu;

function hasEmotionPolarityEvidence(phrase, category) {
  if (category === 1) {
    return POSITIVE_EMOTION_CUE.test(phrase) && !NEGATED_POSITIVE_EMOTION_CUE.test(phrase);
  }
  if (category < 2 || category > 6) return false;
  return NEGATIVE_EMOTION_CUE.test(phrase);
}

function getReviewClauses(reviewText) {
  const clauses = [];
  let start = 0;
  for (const boundary of reviewText.matchAll(REVIEW_CLAUSE_BOUNDARY)) {
    const text = reviewText.slice(start, boundary.index).trim();
    if (text) clauses.push(text);
    start = boundary.index + boundary[0].length;
  }
  const finalClause = reviewText.slice(start).trim();
  if (finalClause) clauses.push(finalClause);
  return clauses;
}

function findSourcePhraseSpans(sourceText, phrase) {
  const sourceTokens = [...sourceText.matchAll(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)];
  const phraseTokens = phrase.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)
    ?.map((token) => token.toLocaleLowerCase()) || [];
  if (!phraseTokens.length) return [];

  const spans = [];
  for (let start = 0; start <= sourceTokens.length - phraseTokens.length; start += 1) {
    if (phraseTokens.every((token, offset) => (
      sourceTokens[start + offset][0].toLocaleLowerCase() === token
    ))) {
      const first = sourceTokens[start];
      const last = sourceTokens[start + phraseTokens.length - 1];
      let spanStart = first.index;
      let spanEnd = last.index + last[0].length;
      if (spanStart > 0 && /['"“”‘’]/u.test(sourceText[spanStart - 1])) spanStart -= 1;
      if (/['"“”‘’]/u.test(sourceText[spanEnd] || '')) spanEnd += 1;
      spans.push({ start: spanStart, end: spanEnd });
    }
  }
  return spans;
}

function getContainingClause(phrase, clauses) {
  return clauses.find((clause) => findSourcePhraseSpans(clause, phrase).length > 0) || null;
}

function hasContextualEmotionEvidence(phrase, category, clause, driverWords) {
  if (hasEmotionPolarityEvidence(phrase, category)) return true;
  if (category < 2 || category > 6 || !clause ||
      !NEGATIVE_EMOTION_CUE.test(clause)) return false;
  const phraseWords = phrase.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || [];
  return phraseWords.some((word) => driverWords.has(word.toLocaleLowerCase()));
}

function mergeOverlappingSourcePhrases(reviewText, phrases) {
  const spans = [];
  const unmatchedPhrases = [];

  phrases.forEach((phrase) => {
    const [span] = findSourcePhraseSpans(reviewText, phrase);
    if (span) spans.push(span);
    else unmatchedPhrases.push(phrase);
  });

  spans.sort((first, second) => first.start - second.start || second.end - first.end);
  const mergedSpans = [];
  spans.forEach((span) => {
    const previous = mergedSpans.at(-1);
    if (previous && span.start < previous.end) {
      previous.end = Math.max(previous.end, span.end);
    } else {
      mergedSpans.push({ ...span });
    }
  });

  return [
    ...mergedSpans.map(({ start, end }) => reviewText.slice(start, end).trim()),
    ...unmatchedPhrases,
  ];
}

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
    const reviewClauses = getReviewClauses(reviewText);
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
    const sourceWords = new Set(
      (reviewText.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || [])
        .map((word) => word.toLocaleLowerCase()),
    );
    const hasSourceDriver = [...driverWords].some((word) => sourceWords.has(word));
    const candidatePhrases = getReviewKeywordPhrases(reviewText)
      .filter((phrase) => {
        if (!hasSourceDriver) return false;
        const clause = getContainingClause(phrase, reviewClauses);
        return Boolean(
          clause &&
          hasContextualEmotionEvidence(phrase, category, clause, driverWords),
        );
      });
    const reviewPhrases = new Set(
      mergeOverlappingSourcePhrases(reviewText, candidatePhrases),
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

  if (hasSourceReviews) return [];

  return [...driverFrequencies.entries()]
    .filter(([, count]) => count > 0)
    .sort(([leftTerm, leftCount], [rightTerm, rightCount]) => rightCount - leftCount || leftTerm.localeCompare(rightTerm))
    .slice(0, 5)
    .map(([term]) => surfaces.get(term));
}
