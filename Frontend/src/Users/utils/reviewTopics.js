const TOPIC_LABELS = [
  'Quality', 'Performance / Functionality', 'Features / Content', 'Service / Support',
  'Delivery / Transaction', 'Price / Value', 'Usability / Experience',
  'Accuracy / Expectations', 'Availability / Accessibility', 'Environment / Location', 'Other / General',
];

export function getTopicAssignmentCounts(topicAnalysis) {
  const results = Array.isArray(topicAnalysis?.results) ? topicAnalysis.results : [];
  const topicsByResult = results.map((result) => (
    Array.isArray(result?.topics) ? result.topics : []
  ));
  return {
    resultCount: results.length,
    resultsWithTopics: topicsByResult.filter((topics) => topics.length > 0).length,
    topicAssignmentCount: topicsByResult.reduce((count, topics) => count + topics.length, 0),
    reviewsWithoutTopics: topicsByResult.filter((topics) => topics.length === 0).length,
  };
}

const COMMON_REVIEW_WORDS = new Set([
  'about', 'after', 'again', 'also', 'ang', 'are', 'as', 'at', 'ba', 'be', 'been', 'but',
  'and', 'by', 'can', 'could', 'did', 'do', 'does', 'for', 'from', 'have', 'he', 'her', 'here',
  'how', 'i', 'if', 'in', 'into', 'is', 'it', 'ita', 'its', 'just', 'ko', 'kung', 'lang',
  'may', 'me', 'mga', 'mo', 'more', 'na', 'naman', 'ng', 'ni', 'not', 'of', 'on', 'only',
  'or', 'our', 'pa', 'para', 'pero', 'po', 'quite', 'really', 'rin', 'sa', 'she', 'siya',
  'so', 'sya', 'that', 'the', 'their', 'them', 'then', 'there', 'they', 'this', 'to', 'too',
  'very', 'was', 'we', 'were', 'with', 'would', 'yung', 'you', 'your', 'din', 'easily',
  'super', 'talaga', 'one', 'has', 'have', 'had', 'be', 'been', 'being', 'no', 'a',
  'an', 'any', 'because', 'before', 'between', 'both', 'each', 'either', 'else', 'every',
  'few', 'hers', 'herself', 'him', 'himself', 'his', 'itself', 'many', 'might', 'mine',
  'most', 'must', 'my', 'myself', 'neither', 'once', 'other', 'ours', 'ourselves', 'own',
  'same', 'should', 'since', 'some', 'such', 'than', 'these', 'those', 'through', 'under',
  'until', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'whose', 'why', 'will',
  'yours', 'yourself', 'yourselves', 'keep', 'kept', 'keeping',
  'say', 'says', 'said', "it's", "that's", "you're", "they're", "we're", "i'm",
  'everytime', 'month', 'months', 'year', 'years',
  'thank', 'thanks', 'tysm',
  "aren't", "can't", "couldn't", "didn't", "doesn't", "don't", "hadn't", "hasn't",
  "haven't", "isn't", "mustn't", "shouldn't", "wasn't", "weren't", "won't", "wouldn't",
]);
const GENERIC_REVIEW_WORDS = new Set([
  'app', 'apps', 'item', 'items', 'package', 'person', 'product', 'products', 'review',
  'reviews', 'stuff', 'thing', 'things', 'game', 'games', 'customer', 'team', 'teams',
  'new', 'latest',
]);
const GENERIC_PRAISE_WORDS = new Set([
  'almost', 'amazing', 'awesome', 'enjoy', 'enjoyable', 'enjoyed', 'excellent', 'fun', 'good',
  'great', 'love', 'loved', 'lovely', 'nice', 'perfect', 'perfectly', 'wonderful',
]);
const GENERIC_STANDALONE_TOPIC_WORDS = new Set([
  'support', 'service', 'request', 'replied', 'refund', 'update', 'latest', 'new',
  'good', 'great', 'nice', 'best', 'love', 'perfect', 'awesome',
  'thank', 'thanks', 'tysm', 'help', 'seller',
]);
const CONCATENATED_FILLER_FRAGMENTS = [
  'everytime', 'months', 'month', 'years', 'year', 'thanks', 'thank', 'seller',
  'almost', 'perfect', 'great', 'good', 'help', 'issues', 'issue', 'say', 'said',
];
const INCOMPLETE_PHRASE_ENDINGS = new Set(['never', 'not', 'very', 'and', 'to', 'with']);
const ORDINARY_REVIEW_VERBS = new Set([
  'assemble', 'assembled', 'assembles', 'assembling', 'arrive', 'arrived', 'arrives', 'arriving',
  'bought', 'buy', 'buying', 'buys', 'came', 'come', 'comes', 'coming', 'deliver', 'delivered',
  'delivers', 'delivering', 'download', 'downloaded', 'downloading', 'downloads', 'feel', 'feels', 'felt', 'get', 'gets',
  'getting', 'got', 'has', 'have', 'had', 'is', 'are', 'was', 'were', 'include', 'included', 'includes', 'including',
  'install', 'installed', 'installing', 'installs', 'look', 'looked', 'looking',
  'looks', 'make', 'made', 'makes', 'making', 'order', 'ordered', 'ordering', 'orders', 'play',
  'played', 'playing', 'plays', 'receive', 'received', 'receives', 'receiving', 'send', 'sending',
  'see', 'seeing', 'sees', 'saw', 'sends', 'sent', 'ship', 'shipped', 'shipping', 'ships', 'use', 'used', 'uses', 'using', 'work',
  'worked', 'working', 'works', 'keep', 'keeps', 'kept', 'keeping', 'binili', 'bumili', 'dumating', 'ginamit', 'gumamit', 'gumana',
  'gumagana', 'nagdownload', 'naglaro', 'naglalaro', 'nabili', 'natanggap', 'nilaro', 'tinanggap',
]);
const REVIEW_URL_PATTERN = /https?:\/\/\S+|www\.\S+/gi;
const REVIEW_TOKEN_PATTERN = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
const PHRASE_CONNECTORS = new Set(['and', 'to']);
const EVIDENCE_PHRASE_FUNCTION_WORDS = new Set(['is', 'the', 'so']);
const HTML_ENTITY_VALUES = {
  amp: '&',
  apos: "'",
  copy: '©',
  emsp: ' ',
  ensp: ' ',
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  mdash: '—',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  reg: '®',
  rdquo: '”',
  rsquo: '’',
  trade: '™',
};
const HTML_ENTITY_PATTERN = /&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi;
const HTML_MARKUP_PATTERN = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi;
const BBCODE_TAG_NAMES = 'b|i|u|s|strike|sub|sup|color|size|font|url|email|img|image|quote|code|php|html|pre|spoiler|center|left|right|justify|list|li|hr|br|h[1-6]|p|table|tr|td|th|youtube|video|user|mention';
const BBCODE_MARKUP_PATTERN = new RegExp(
  `\\[\\s*\\/?\\s*(?:${BBCODE_TAG_NAMES})(?:\\s*=\\s*[^\\]]*)?\\s*\\]|\\[\\s*\\\\?\\*\\s*\\]`,
  'gi',
);
const MARKUP_BOUNDARY = '\uE000';
const TOPIC_KEYWORD_RELEVANCE_THRESHOLD = 0.75;
const TOPIC_KEYWORD_MAX_SCORE_GAP = 0.025;
const TOPIC_KEYWORD_LIMITED_RELEVANCE_THRESHOLD = 0.65;
const TOPIC_KEYWORD_LIMITED_SCORE_GAP = 0.1;
const MAX_CANDIDATES_PER_TOPIC = 40;
const MALFORMED_COMPOUND_PATTERN = /[a-z][A-Z][a-z]/u;
const MAX_TOPIC_EVIDENCE_EXCERPT_LENGTH = 180;
const HTML_ENTITY_DECODER = typeof document === 'undefined'
  ? null
  : document.createElement('textarea');

function decodeHtmlEntity(entity, value) {
  if (HTML_ENTITY_DECODER) {
    HTML_ENTITY_DECODER.innerHTML = entity;
    return HTML_ENTITY_DECODER.value;
  }
  if (value[0] !== '#') return HTML_ENTITY_VALUES[value.toLocaleLowerCase()] || entity;

  const hexadecimal = value[1]?.toLocaleLowerCase() === 'x';
  const codePoint = Number.parseInt(value.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
  if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return '\uFFFD';
  }
  return String.fromCodePoint(codePoint);
}

function prepareKeywordSource(reviewText) {
  const sourceWithBoundaries = reviewText
    .replace(REVIEW_URL_PATTERN, ' ')
    .replace(HTML_ENTITY_PATTERN, decodeHtmlEntity)
    .replace(HTML_MARKUP_PATTERN, MARKUP_BOUNDARY)
    .replace(BBCODE_MARKUP_PATTERN, MARKUP_BOUNDARY);
  const sourceParts = sourceWithBoundaries.split(MARKUP_BOUNDARY);
  const markupBoundaries = new Set();
  let source = '';
  let pendingMarkupBoundary = false;

  sourceParts.forEach((part, partIndex) => {
    if (partIndex > 0) pendingMarkupBoundary = true;
    const normalizedPart = part.replace(/\s+/gu, ' ').trim();
    if (!normalizedPart) {
      pendingMarkupBoundary = true;
      return;
    }
    if (source) {
      source += ' ';
      if (pendingMarkupBoundary) markupBoundaries.add(source.length - 1);
    }
    source += normalizedPart;
    pendingMarkupBoundary = false;
  });

  return { source, markupBoundaries };
}

export function getReviewText(review) {
  if (typeof review === 'string') return review;
  if (review && typeof review === 'object') {
    const textFields = [
      review.text,
      review.reviewText,
      review.comment,
      review.review,
      review.content,
      review.body,
      review.reviewBody,
    ];
    return textFields.find((value) => typeof value === 'string' && value.trim()) || '';
  }
  return '';
}

export function isSubstantiveReviewText(text) {
  if (typeof text !== 'string' || !text.trim()) return false;

  const remainingText = text
    .replace(/\b[A-Z]?\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?=\s|Helpful|$|[^\p{L}\p{N}_])/giu, ' ')
    .replace(/\bHelpful\s*\(\s*[\d,]+\s*\)/giu, ' ')
    .replace(/\b(?:verified\s+purchase|anonymous|lazada\s+buyer|seller\s+response|response\s+from\s+seller)\b/giu, ' ')
    .trim();

  return /[\p{L}\p{N}]/u.test(remainingText) || /\p{Extended_Pictographic}/u.test(remainingText);
}

export function filterSubstantiveReviews(reviews) {
  return Array.isArray(reviews)
    ? reviews.filter((review) => isSubstantiveReviewText(getReviewText(review)))
    : [];
}

export function getReviewId(_review, fallbackIndex = 0) {
  return fallbackIndex + 1;
}

function isMalformedConcatenatedToken(token) {
  const normalized = token.toLocaleLowerCase();
  return normalized.length >= 10 && CONCATENATED_FILLER_FRAGMENTS.some((fragment) => (
    normalized !== fragment &&
    normalized.includes(fragment) &&
    normalized.length - fragment.length >= 4
  ));
}

function isReadableKeywordPhrase(term) {
  if (typeof term !== 'string' || term !== term.trim() || term.length > 100 ||
      /\s{2,}/u.test(term) || !/\p{L}/u.test(term)) return false;
  const tokens = term.match(REVIEW_TOKEN_PATTERN) || [];
  const negated = ['no', 'not', 'never'].includes(tokens[0]?.toLocaleLowerCase());
  const meaningfulTokens = tokens.flatMap((token) => token.toLocaleLowerCase().split('-'))
    .filter((token) => (
      !COMMON_REVIEW_WORDS.has(token) &&
      !GENERIC_REVIEW_WORDS.has(token) &&
      (!GENERIC_PRAISE_WORDS.has(token) || negated) &&
      !ORDINARY_REVIEW_VERBS.has(token) &&
      !PHRASE_CONNECTORS.has(token)
    ));
  return tokens.length > 0 &&
    tokens.length <= 5 &&
    tokens.every((token) => !isMalformedConcatenatedToken(token)) &&
    meaningfulTokens.length > 0;
}

function getTopicReviewKeywordCandidates(reviewText) {
  return new Map([...getReviewKeywordCandidates(reviewText)].filter(([, term]) => (
    isReadableKeywordPhrase(term)
  )));
}

function unwrapReview(entry) {
  return Number.isInteger(entry?.topicResultIndex) ? entry.review : entry;
}

function getReviewKeywordCandidates(reviewText) {
  const { source, markupBoundaries } = prepareKeywordSource(reviewText);
  const tokens = [...source.matchAll(REVIEW_TOKEN_PATTERN)];
  const candidates = new Map();

  for (let start = 0; start < tokens.length; start += 1) {
    for (let end = start; end < Math.min(tokens.length, start + 5); end += 1) {
      if (end > start) {
        const previous = tokens[end - 1];
        const previousEnd = previous.index + previous[0].length;
        const gap = source.slice(previousEnd, tokens[end].index);
        const gapWithoutQuotes = gap.replace(/['"“”‘’]/gu, '');
        if ((!/^\s+$/.test(gap) && !/^\s+$/.test(gapWithoutQuotes)) ||
            markupBoundaries.has(previousEnd)) break;
      }

      const rawCandidateTokens = tokens.slice(start, end + 1)
        .map((token) => token[0].toLocaleLowerCase());
      const preservesMiniGames = rawCandidateTokens.length === 2 &&
        rawCandidateTokens[0] === 'mini' && rawCandidateTokens[1] === 'games';
      const preservesFreeToPlay = rawCandidateTokens.length >= 3 &&
        rawCandidateTokens[0] === 'free' &&
        rawCandidateTokens[1] === 'to' &&
        rawCandidateTokens[2] === 'play';
      const preservesReinstallingGame = rawCandidateTokens.length === 3 &&
        rawCandidateTokens[0] === 're-installing' &&
        rawCandidateTokens[1] === 'the' &&
        rawCandidateTokens[2] === 'game';
      let firstToken = start;
      let lastToken = end;
      const startsWithNegation = ['never', 'no', 'not'].includes(
        tokens[firstToken][0].toLocaleLowerCase(),
      );
      const preservesNegativeIt = startsWithNegation &&
        tokens[lastToken][0].toLocaleLowerCase() === 'it';
      const isBoundaryWord = (token) => {
        const normalized = token[0].toLocaleLowerCase();
        return COMMON_REVIEW_WORDS.has(normalized);
      };
      while (firstToken < lastToken && (
        isBoundaryWord(tokens[firstToken]) &&
        !['never', 'no', 'not'].includes(tokens[firstToken][0].toLocaleLowerCase())
      )) firstToken += 1;
      while (lastToken > firstToken && (
        isBoundaryWord(tokens[lastToken]) ||
        GENERIC_REVIEW_WORDS.has(tokens[lastToken][0].toLocaleLowerCase())
      ) && !(preservesNegativeIt && lastToken === end) &&
          !preservesMiniGames && !preservesReinstallingGame) lastToken -= 1;
      const candidateTokens = tokens.slice(firstToken, lastToken + 1).map((token) => token[0]);
      if (candidateTokens.some((token) => /^\p{N}+$/u.test(token))) continue;
      const contentTokens = candidateTokens
        .flatMap((token) => token.toLocaleLowerCase().split('-'))
        .filter((token) => (
          !COMMON_REVIEW_WORDS.has(token) &&
          (!GENERIC_REVIEW_WORDS.has(token) ||
            (preservesMiniGames && token === 'games') ||
              (preservesFreeToPlay && token === 'play') ||
              (preservesReinstallingGame && token === 'game')) &&
            !PHRASE_CONNECTORS.has(token) &&
            !ORDINARY_REVIEW_VERBS.has(token) &&
            /\p{L}/u.test(token) &&
            !(candidateTokens.length === 1 && GENERIC_STANDALONE_TOPIC_WORDS.has(token))
        ));
      if (!contentTokens.length || contentTokens.some((token) => token.length < 2)) continue;
      if (candidateTokens.length === 1 &&
        (ORDINARY_REVIEW_VERBS.has(contentTokens[0]) ||
          GENERIC_STANDALONE_TOPIC_WORDS.has(contentTokens[0]) ||
          INCOMPLETE_PHRASE_ENDINGS.has(contentTokens[0]))) continue;
      const containsGenericActionVerb = candidateTokens.some((token) => (
        token.toLocaleLowerCase().split('-').some((part) => (
          ORDINARY_REVIEW_VERBS.has(part) &&
          !(contentTokens.length >= 2 && EVIDENCE_PHRASE_FUNCTION_WORDS.has(part))
        ))
      ));
      const isMeaningfulActionPhrase = (
        candidateTokens[0].toLocaleLowerCase() === 'keeps' &&
        candidateTokens.slice(1).some((token) => (
          token.toLocaleLowerCase().split('-').some((part) => (
            !COMMON_REVIEW_WORDS.has(part) &&
            !GENERIC_REVIEW_WORDS.has(part) &&
            !ORDINARY_REVIEW_VERBS.has(part)
          ))
        ))
      ) || (
        candidateTokens.at(-1).toLocaleLowerCase() === 'assemble' &&
        candidateTokens.includes('to') &&
        contentTokens.some((token) => token !== 'assemble')
      ) || preservesFreeToPlay || preservesReinstallingGame;
      if (containsGenericActionVerb && !isMeaningfulActionPhrase) continue;
      if (INCOMPLETE_PHRASE_ENDINGS.has(candidateTokens.at(-1).toLocaleLowerCase())) continue;
      const hasUnhelpfulFunctionWord = candidateTokens.some((token) => (
        token.toLocaleLowerCase().split('-').some((part) => (
          COMMON_REVIEW_WORDS.has(part) &&
          !PHRASE_CONNECTORS.has(part) &&
          !(contentTokens.length >= 2 && EVIDENCE_PHRASE_FUNCTION_WORDS.has(part)) &&
          !['no', 'not', 'never'].includes(part) &&
          !(preservesReinstallingGame && part === 'the') &&
          !(part === 'it' && preservesNegativeIt && token === candidateTokens.at(-1))
        ))
      ));
      if (hasUnhelpfulFunctionWord) continue;

      const sourceTerm = source.slice(
        tokens[firstToken].index,
        tokens[lastToken].index + tokens[lastToken][0].length,
      );
      const term = sourceTerm.replace(/['"“”‘’](?=\s)|(?<=\s)['"“”‘’]/gu, '');
      const key = term.toLocaleLowerCase();
      candidates.set(key, term);
    }
  }

  return candidates;
}

export function getReviewKeywordPhrases(reviewText) {
  return [...getReviewKeywordCandidates(reviewText).values()];
}

export function getTopicKeywordCandidates(reviews, topicAnalysis) {
  const topicResults = Array.isArray(topicAnalysis?.results) ? topicAnalysis.results : [];
  const candidatesByTopic = new Map(TOPIC_LABELS.map((label) => [label, new Map()]));

  reviews.forEach((entry, entryIndex) => {
    const resultIndex = Number.isInteger(entry?.topicResultIndex) ? entry.topicResultIndex : entryIndex;
    const result = topicResults[resultIndex];
    if (result?.reviewIndex != null && result.reviewIndex !== resultIndex) return;

    const candidates = getTopicReviewKeywordCandidates(getReviewText(unwrapReview(entry)));
    new Set((result?.topics || []).map(({ label }) => label)).forEach((label) => {
      const topicCandidates = candidatesByTopic.get(label);
      if (!topicCandidates) return;
      candidates.forEach((term, key) => {
        const candidate = topicCandidates.get(key);
        topicCandidates.set(key, {
          term,
          reviewCount: (candidate?.reviewCount || 0) + (candidate ? 0 : 1),
        });
      });
    });
  });

  const uniqueCandidates = new Map();
  candidatesByTopic.forEach((topicCandidates) => {
    [...topicCandidates.entries()]
      .sort(([, first], [, second]) => (
        second.reviewCount - first.reviewCount ||
        first.term.split(/\s+/).length - second.term.split(/\s+/).length ||
        first.term.localeCompare(second.term)
      ))
      .slice(0, MAX_CANDIDATES_PER_TOPIC)
      .forEach(([key, candidate]) => uniqueCandidates.set(key, candidate.term));
  });
  return [...uniqueCandidates.values()];
}

export function createTopicReviewEntries(quotes, emotionCategoryById = {}) {
  return quotes.map((quote, index) => ({
    review: quote,
    category: quote.category ?? emotionCategoryById[quote.emotion?.toLowerCase()],
    topicResultIndex: Number.isInteger(quote.topicResultIndex) ? quote.topicResultIndex : index,
  }));
}

function getPhraseTokenSpans(reviewText, phrase) {
  const reviewTokens = [...reviewText.matchAll(REVIEW_TOKEN_PATTERN)]
    .map((match) => match[0].toLocaleLowerCase());
  const phraseTokens = phrase.match(REVIEW_TOKEN_PATTERN)
    ?.map((token) => token.toLocaleLowerCase()) || [];
  const spans = [];

  for (let start = 0; start <= reviewTokens.length - phraseTokens.length; start += 1) {
    if (phraseTokens.every((token, offset) => reviewTokens[start + offset] === token)) {
      spans.push([start, start + phraseTokens.length]);
    }
  }

  return spans;
}

function hasSingleTokenBoundaryOverlap(firstSpans, secondSpans) {
  return firstSpans.some(([firstStart, firstEnd]) => secondSpans.some(([secondStart, secondEnd]) => {
    const overlapStart = Math.max(firstStart, secondStart);
    const overlapEnd = Math.min(firstEnd, secondEnd);
    return overlapEnd - overlapStart === 1 &&
      (firstEnd === secondStart + 1 || secondEnd === firstStart + 1);
  }));
}

function getSourceExcerptForPhrase(reviewText, phrase) {
  const { source } = prepareKeywordSource(reviewText);
  const sourceTokens = [...source.matchAll(REVIEW_TOKEN_PATTERN)];
  const phraseTokens = phrase.match(REVIEW_TOKEN_PATTERN)
    ?.map((token) => token.toLocaleLowerCase()) || [];
  if (!phraseTokens.length) return '';

  for (let start = 0; start <= sourceTokens.length - phraseTokens.length; start += 1) {
    if (!phraseTokens.every((token, offset) => (
      sourceTokens[start + offset][0].toLocaleLowerCase() === token
    ))) continue;

    const phraseStart = sourceTokens[start].index;
    const phraseEnd = sourceTokens[start + phraseTokens.length - 1].index +
      sourceTokens[start + phraseTokens.length - 1][0].length;
    const previousBoundary = Math.max(
      source.lastIndexOf('.', phraseStart - 1),
      source.lastIndexOf('!', phraseStart - 1),
      source.lastIndexOf('?', phraseStart - 1),
      source.lastIndexOf(';', phraseStart - 1),
    );
    const nextBoundaries = ['.', '!', '?', ';']
      .map((boundary) => source.indexOf(boundary, phraseEnd))
      .filter((index) => index >= 0);
    const sentenceStart = previousBoundary + 1;
    const sentenceEnd = nextBoundaries.length ? Math.min(...nextBoundaries) + 1 : source.length;
    let excerpt = source.slice(sentenceStart, sentenceEnd).trim();

    if (excerpt.length > MAX_TOPIC_EVIDENCE_EXCERPT_LENGTH) {
      const contextStart = Math.max(
        sentenceStart,
        phraseStart - Math.floor((MAX_TOPIC_EVIDENCE_EXCERPT_LENGTH - phrase.length) / 2),
      );
      const contextEnd = Math.min(
        sentenceEnd,
        contextStart + MAX_TOPIC_EVIDENCE_EXCERPT_LENGTH,
      );
      excerpt = source.slice(contextStart, contextEnd).trim();
      if (contextStart > sentenceStart) excerpt = `…${excerpt}`;
      if (contextEnd < sentenceEnd) excerpt = `${excerpt}…`;
    }
    return excerpt;
  }

  return '';
}

function getTopicKeywordSelection(
  reviews,
  selectedTopicLabel,
  topicAnalysis,
  { minimumRelevance = TOPIC_KEYWORD_RELEVANCE_THRESHOLD, maximumScoreGap = TOPIC_KEYWORD_MAX_SCORE_GAP } = {},
) {
  const diagnostics = {
    reviewCount: reviews.length,
    selectedTopicLabel,
    candidateOccurrenceCount: 0,
    uniqueCandidateCount: 0,
    scoredCandidateOccurrenceCount: 0,
    relevancePassingCandidateCount: 0,
    minimumRelevanceThreshold: minimumRelevance,
    maximumCompetingScoreGap: maximumScoreGap,
    relevanceScoreSummary: null,
    competingScoreGapSummary: null,
    nonRedundantCandidateCount: 0,
    displayedKeywordCount: 0,
    rejectedCandidates: [],
  };
  if (!selectedTopicLabel || !topicAnalysis?.keywordScores) {
    return { keywords: [], evidence: [], fallbackEvidence: [], diagnostics };
  }

  const topicResults = Array.isArray(topicAnalysis.results) ? topicAnalysis.results : [];
  const scopedReviews = topicResults.length
    ? reviews.filter((entry, entryIndex) => {
        const resultIndex = Number.isInteger(entry?.topicResultIndex)
          ? entry.topicResultIndex
          : entryIndex;
        const result = topicResults[resultIndex];
        return (result?.reviewIndex == null || result.reviewIndex === resultIndex) &&
          result?.topics?.some((topic) => topic.label === selectedTopicLabel);
      })
    : reviews;
  diagnostics.reviewCount = scopedReviews.length;
  const frequencies = new Map();
  const scores = [];
  const scoreGaps = [];

  scopedReviews.forEach((entry, reviewIndex) => {
    const reviewText = getReviewText(unwrapReview(entry));
    const reviewTerms = getTopicReviewKeywordCandidates(reviewText);
    reviewTerms.forEach((term, key) => {
      if (term.length >= 18 && MALFORMED_COMPOUND_PATTERN.test(term)) {
        diagnostics.candidateOccurrenceCount += 1;
        diagnostics.rejectedCandidates.push({
          reviewIndex: Number.isInteger(entry?.topicResultIndex)
            ? entry.topicResultIndex
            : reviewIndex,
          selectedTopicLabel,
          candidateTokenCount: (term.match(REVIEW_TOKEN_PATTERN) || []).length,
          candidateCharacterLength: term.length,
          relevanceScore: null,
          strongestCompetingTopicScore: null,
          scoreGap: null,
          rejectionReason: 'malformed_source_token',
        });
        return;
      }
      const topicScores = topicAnalysis.keywordScores[key];
      const relevance = topicScores?.[selectedTopicLabel];
      const alternatives = Object.entries(topicScores || {})
        .filter(([label, score]) => label !== selectedTopicLabel && Number.isFinite(score))
        .map(([, score]) => score);
      const strongestCompetingScore = alternatives.length ? Math.max(...alternatives) : null;
      const scoreGap = typeof relevance === 'number' && strongestCompetingScore != null
        ? strongestCompetingScore - relevance
        : null;
      const reviewIndexValue = Number.isInteger(entry?.topicResultIndex)
        ? entry.topicResultIndex
        : reviewIndex;
      const candidateTokenCount = (term.match(REVIEW_TOKEN_PATTERN) || []).length;
      diagnostics.candidateOccurrenceCount += 1;
      if (Number.isFinite(relevance)) {
        diagnostics.scoredCandidateOccurrenceCount += 1;
        scores.push(relevance);
      }
      if (scoreGap != null) scoreGaps.push(scoreGap);
      const rejectionReason = !Number.isFinite(relevance)
        ? 'topic_score_missing'
        : relevance < minimumRelevance
          ? 'below_minimum_relevance'
          : strongestCompetingScore == null
            ? 'competing_topic_scores_missing'
            : scoreGap > maximumScoreGap
              ? 'competing_topic_too_close'
              : null;
      if (rejectionReason) {
        diagnostics.rejectedCandidates.push({
          reviewIndex: reviewIndexValue,
          selectedTopicLabel,
          candidateTokenCount,
          candidateCharacterLength: term.length,
          relevanceScore: Number.isFinite(relevance) ? relevance : null,
          strongestCompetingTopicScore: strongestCompetingScore,
          scoreGap,
          rejectionReason,
        });
        return;
      }
      const current = frequencies.get(key) || {
        term,
        relevance,
        reviewCount: 0,
        reviewIndexes: new Set(),
        reviewSpans: new Map(),
        strongestCompetingScore,
        scoreGap,
      };
      current.reviewCount += 1;
      current.relevance = Math.max(current.relevance, relevance);
      if (strongestCompetingScore > current.strongestCompetingScore) {
        current.strongestCompetingScore = strongestCompetingScore;
        current.scoreGap = scoreGap;
      }
      current.reviewIndexes.add(reviewIndexValue);
      current.reviewSpans.set(reviewIndexValue, getPhraseTokenSpans(reviewText, term));
      frequencies.set(key, current);
    });
  });

  diagnostics.uniqueCandidateCount = new Set(
    scopedReviews.flatMap((entry) => [...getTopicReviewKeywordCandidates(getReviewText(unwrapReview(entry))).keys()]),
  ).size;
  diagnostics.relevancePassingCandidateCount = frequencies.size;
  if (scores.length) {
    const sortedScores = [...scores].sort((first, second) => first - second);
    diagnostics.relevanceScoreSummary = {
      minimum: sortedScores[0],
      median: sortedScores[Math.floor(sortedScores.length / 2)],
      maximum: sortedScores.at(-1),
    };
  }
  if (scoreGaps.length) {
    const sortedGaps = [...scoreGaps].sort((first, second) => first - second);
    diagnostics.competingScoreGapSummary = {
      minimum: sortedGaps[0],
      median: sortedGaps[Math.floor(sortedGaps.length / 2)],
      maximum: sortedGaps.at(-1),
    };
  }

  const relevantCandidates = [...frequencies.values()];
  const nonRedundantCandidates = relevantCandidates.filter((candidate) => {
    const candidateTokens = candidate.term.toLocaleLowerCase().match(REVIEW_TOKEN_PATTERN) || [];
    const isRedundant = relevantCandidates.some((other) => {
      if (other === candidate) return false;
      const sharedReviewIndexes = [...candidate.reviewIndexes]
        .filter((index) => other.reviewIndexes.has(index));
      if (!sharedReviewIndexes.length) return false;

      const otherTokens = other.term.toLocaleLowerCase().match(REVIEW_TOKEN_PATTERN) || [];
      if (candidateTokens.length < otherTokens.length &&
          otherTokens.some((_, start) => candidateTokens.every((token, offset) => (
            otherTokens[start + offset] === token
          )))) return true;

      if (otherTokens.length <= candidateTokens.length ||
          candidateTokens.length !== 2) return false;
      return sharedReviewIndexes.some((index) => (
        hasSingleTokenBoundaryOverlap(
          other.reviewSpans.get(index) || [],
          candidate.reviewSpans.get(index) || [],
        )
      ));
    });
    if (isRedundant) {
      const reviewIndex = [...candidate.reviewIndexes][0] ?? null;
      diagnostics.rejectedCandidates.push({
        reviewIndex,
        selectedTopicLabel,
        candidateTokenCount: candidateTokens.length,
        candidateCharacterLength: candidate.term.length,
        relevanceScore: candidate.relevance,
        strongestCompetingTopicScore: candidate.strongestCompetingScore,
        scoreGap: candidate.scoreGap,
        rejectionReason: 'overlapped_by_longer_relevant_phrase',
      });
    }
    return !isRedundant;
  });

  diagnostics.nonRedundantCandidateCount = nonRedundantCandidates.length;
  const sortedCandidates = nonRedundantCandidates
    .sort((first, second) => (
      second.relevance - first.relevance
    ) ||
      second.term.split(/\s+/u).length - first.term.split(/\s+/u).length ||
      second.reviewCount - first.reviewCount ||
      first.term.localeCompare(second.term));
  const displayedCandidates = sortedCandidates.slice(0, 5);
  diagnostics.displayedKeywordCount = displayedCandidates.length;
  sortedCandidates.slice(5).forEach((candidate) => {
    diagnostics.rejectedCandidates.push({
      reviewIndex: [...candidate.reviewIndexes][0] ?? null,
      selectedTopicLabel,
      candidateTokenCount: (candidate.term.match(REVIEW_TOKEN_PATTERN) || []).length,
      candidateCharacterLength: candidate.term.length,
      relevanceScore: candidate.relevance,
      strongestCompetingTopicScore: candidate.strongestCompetingScore,
      scoreGap: candidate.scoreGap,
      rejectionReason: 'display_limit',
    });
  });

  const phraseEvidenceIndexes = new Set(displayedCandidates.flatMap(
    ({ reviewIndexes }) => [...reviewIndexes],
  ));
  const fallbackEvidence = [];
  scopedReviews.forEach((entry, reviewIndex) => {
    const resultIndex = Number.isInteger(entry?.topicResultIndex)
      ? entry.topicResultIndex
      : reviewIndex;
    if (phraseEvidenceIndexes.has(resultIndex)) return;
    const result = topicResults[resultIndex];
    if (!result?.topics?.some((topic) => topic.label === selectedTopicLabel)) return;

    const reviewText = getReviewText(unwrapReview(entry));
    const candidates = [...getTopicReviewKeywordCandidates(reviewText).values()]
      .map((term) => ({
        term,
        relevance: topicAnalysis.keywordScores[term.toLocaleLowerCase()]?.[selectedTopicLabel],
      }))
      .filter(({ term, relevance }) => (
        isReadableKeywordPhrase(term) &&
        Number.isFinite(relevance) &&
        relevance >= TOPIC_KEYWORD_LIMITED_RELEVANCE_THRESHOLD
      ))
      .sort((first, second) => second.relevance - first.relevance ||
        second.term.length - first.term.length);
    const excerpt = candidates.length
      ? getSourceExcerptForPhrase(reviewText, candidates[0].term)
      : '';
    if (excerpt) fallbackEvidence.push({ topicResultIndex: resultIndex, excerpt });
  });

  return {
    keywords: displayedCandidates.map(({ term }) => term),
    evidence: displayedCandidates.map((candidate) => ({
      phrase: candidate.term,
      confidence: minimumRelevance === TOPIC_KEYWORD_RELEVANCE_THRESHOLD ? 'strong' : 'limited',
      topicResultIndexes: [...candidate.reviewIndexes],
    })),
    fallbackEvidence,
    diagnostics,
  };
}

export function getTopicKeywordDiagnostics(reviews, selectedTopicLabel, topicAnalysis) {
  return getTopicKeywordSelection(reviews, selectedTopicLabel, topicAnalysis).diagnostics;
}

export function getTopicEvidenceDiagnostics(
  reviews,
  topicAnalysis,
  selectedCategory,
  selectedTopicLabel,
) {
  const categoryReviews = reviews.filter((entry) => (
    selectedCategory == null || entry.category === selectedCategory
  ));
  const strongSelection = getTopicKeywordSelection(
    categoryReviews,
    selectedTopicLabel,
    topicAnalysis,
  );
  const limitedSelection = getTopicKeywordSelection(
    categoryReviews,
    selectedTopicLabel,
    topicAnalysis,
    {
      minimumRelevance: TOPIC_KEYWORD_LIMITED_RELEVANCE_THRESHOLD,
      maximumScoreGap: TOPIC_KEYWORD_LIMITED_SCORE_GAP,
    },
  );
  const topic = aggregateTopicsForReviews(
    reviews,
    topicAnalysis,
    selectedCategory,
  ).find((candidate) => candidate.label === selectedTopicLabel);
  const keywordScoreEntryCount = topicAnalysis?.keywordScores &&
      typeof topicAnalysis.keywordScores === 'object'
    ? Object.keys(topicAnalysis.keywordScores).length
    : 0;
  const summarizeSelection = (selection) => ({
    candidateOccurrenceCount: selection.diagnostics.candidateOccurrenceCount,
    scoredCandidateOccurrenceCount: selection.diagnostics.scoredCandidateOccurrenceCount,
    selectedKeywordCount: selection.keywords.length,
    rejectionCounts: selection.diagnostics.rejectedCandidates.reduce((counts, candidate) => {
      counts[candidate.rejectionReason] = (counts[candidate.rejectionReason] || 0) + 1;
      return counts;
    }, {}),
  });

  return {
    inputReviewCount: reviews.length,
    categoryReviewCount: categoryReviews.length,
    assignedReviewCount: topic?.count || 0,
    keywordScoreDataAvailable: keywordScoreEntryCount > 0,
    keywordScoreEntryCount,
    strong: summarizeSelection(strongSelection),
    limited: summarizeSelection(limitedSelection),
    displayedEvidenceCount: topic?.reviewEvidence?.length || 0,
  };
}

export function getMeaningfulKeywords(reviews, selectedTopicLabel = null, topicAnalysis = null) {
  return getTopicKeywordSelection(reviews, selectedTopicLabel, topicAnalysis).keywords;
}

export function aggregateTopicsForReviews(reviews, topicAnalysis, selectedCategory = null) {
  const topicResults = Array.isArray(topicAnalysis?.results) ? topicAnalysis.results : [];
  const seenReviewIndexes = new Set();
  const uniqueReviews = reviews.filter((entry, index) => {
    const resultIndex = Number.isInteger(entry?.topicResultIndex) ? entry.topicResultIndex : index;
    if (seenReviewIndexes.has(resultIndex)) return false;
    seenReviewIndexes.add(resultIndex);
    return true;
  });
  const eligibleReviews = uniqueReviews.filter((entry) => (
    selectedCategory == null || entry.category === selectedCategory
  ));
  const totalReviews = eligibleReviews.length;

  return TOPIC_LABELS.map((label) => {
    const topicReviews = eligibleReviews.flatMap((entry, index) => {
      const resultIndex = Number.isInteger(entry?.topicResultIndex) ? entry.topicResultIndex : index;
      const result = topicResults[resultIndex];
      if ((result?.reviewIndex != null && result.reviewIndex !== resultIndex) ||
          !result?.topics?.some((topic) => topic.label === label)) return [];
      return [Number.isInteger(entry?.topicResultIndex)
        ? entry
        : { review: entry, category: entry?.category, topicResultIndex: resultIndex }];
    });
    const count = topicReviews.length;
    const strongSelection = getTopicKeywordSelection(topicReviews, label, topicAnalysis);
    const limitedSelection = strongSelection.keywords.length
      ? { keywords: [], evidence: [] }
      : getTopicKeywordSelection(topicReviews, label, topicAnalysis, {
          minimumRelevance: TOPIC_KEYWORD_LIMITED_RELEVANCE_THRESHOLD,
          maximumScoreGap: TOPIC_KEYWORD_LIMITED_SCORE_GAP,
        });
    const evidenceSelection = strongSelection.keywords.length ? strongSelection : limitedSelection;
    const evidenceReviewIndexes = new Set(evidenceSelection.evidence.flatMap(
      ({ topicResultIndexes }) => topicResultIndexes,
    ));
    const phraseEvidenceLevels = new Map();
    [...strongSelection.evidence, ...limitedSelection.evidence].forEach((evidence) => {
      evidence.topicResultIndexes.forEach((index) => {
        phraseEvidenceLevels.set(index, evidence.confidence);
      });
    });
    const fallbackByReviewIndex = new Map(evidenceSelection.fallbackEvidence.map((item) => (
      [item.topicResultIndex, item.excerpt]
    )));
    const representativeEvidence = topicReviews.flatMap((entry) => {
      const level = phraseEvidenceLevels.get(entry.topicResultIndex);
      if (level) {
        return [{
          review: getReviewText(unwrapReview(entry)),
          topicResultIndex: entry.topicResultIndex,
          level,
        }];
      }
      if (evidenceReviewIndexes.has(entry.topicResultIndex)) return [];
      const excerpt = fallbackByReviewIndex.get(entry.topicResultIndex);
      return excerpt
        ? [{ review: excerpt, topicResultIndex: entry.topicResultIndex, level: 'excerpt' }]
        : [];
    });
    const visibleRepresentativeEvidence = representativeEvidence.slice(0, 3);
    const representativeReviews = topicReviews
      .map((entry) => {
        const topicResult = topicResults[entry.topicResultIndex];
        const topicScore = topicResult?.topics?.find((topic) => topic.label === label)?.score;
        return {
          review: getReviewText(unwrapReview(entry)),
          topicResultIndex: entry.topicResultIndex,
          topicScore: Number.isFinite(topicScore) ? topicScore : 0,
        };
      })
      .filter(({ review }) => review.trim())
      .sort((first, second) => (
        second.topicScore - first.topicScore ||
        first.topicResultIndex - second.topicResultIndex
      ))
      .slice(0, 3)
      .map(({ review, topicResultIndex }) => ({ review, topicResultIndex }));
    return {
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label,
      count,
      percentage: totalReviews ? Number(((count / totalReviews) * 100).toFixed(1)) : 0,
      keywords: strongSelection.keywords,
      relatedPhrases: limitedSelection.keywords,
      evidence: evidenceSelection.evidence,
      reviews: visibleRepresentativeEvidence.map(({ review }) => review).filter(Boolean),
      reviewEvidence: visibleRepresentativeEvidence,
      representativeReviews,
      reviewEvidenceLevel: strongSelection.keywords.length ? 'strong' : 'limited',
    };
  });
}

export function getSelectedTopicView(reviews, topicAnalysis, selectedCategory, selectedTopicId) {
  const topics = aggregateTopicsForReviews(reviews, topicAnalysis, selectedCategory);
  const visibleTopics = topics.filter((topic) => topic.count > 0);
  return {
    visibleTopics,
    activeTopic: visibleTopics.find((topic) => topic.id === selectedTopicId) ||
      topics.find((topic) => topic.id === selectedTopicId) ||
      visibleTopics[0] ||
      null,
  };
}
