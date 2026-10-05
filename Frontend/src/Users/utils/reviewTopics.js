const TOPIC_LABELS = [
  'Quality', 'Performance / Functionality', 'Features / Content', 'Service / Support',
  'Delivery / Transaction', 'Price / Value', 'Usability / Experience',
  'Accuracy / Expectations', 'Availability / Accessibility', 'Environment / Location', 'Other / General',
];

const COMMON_REVIEW_WORDS = new Set([
  'about', 'after', 'again', 'also', 'ang', 'are', 'as', 'at', 'ba', 'be', 'been', 'but',
  'and', 'by', 'can', 'could', 'did', 'do', 'does', 'for', 'from', 'have', 'he', 'her', 'here',
  'how', 'i', 'if', 'in', 'into', 'is', 'it', 'ita', 'its', 'just', 'ko', 'kung', 'lang',
  'may', 'me', 'mga', 'mo', 'more', 'na', 'naman', 'ng', 'ni', 'not', 'of', 'on', 'only',
  'or', 'our', 'pa', 'para', 'pero', 'po', 'quite', 'really', 'rin', 'sa', 'she', 'siya',
  'so', 'sya', 'that', 'the', 'their', 'them', 'then', 'there', 'they', 'this', 'to', 'too',
  'very', 'was', 'we', 'were', 'with', 'would', 'yung', 'you', 'your', 'din', 'easily',
  'super', 'talaga', 'one', 'has', 'have', 'had', 'be', 'been', 'being', 'no',
]);
const GENERIC_REVIEW_WORDS = new Set([
  'app', 'apps', 'item', 'items', 'package', 'person', 'product', 'products', 'review',
  'reviews', 'stuff', 'thing', 'things',
]);
const ORDINARY_REVIEW_VERBS = new Set([
  'assemble', 'assembled', 'assembles', 'assembling', 'arrive', 'arrived', 'arrives', 'arriving',
  'bought', 'buy', 'buying', 'buys', 'came', 'come', 'comes', 'coming', 'deliver', 'delivered',
  'delivers', 'delivering', 'download', 'downloaded', 'downloading', 'downloads', 'feel', 'feels', 'felt', 'get', 'gets',
  'getting', 'got', 'has', 'have', 'had', 'is', 'are', 'was', 'were', 'include', 'included', 'includes', 'including',
  'install', 'installed', 'installing', 'installs', 'look', 'looked', 'looking',
  'looks', 'make', 'made', 'makes', 'making', 'order', 'ordered', 'ordering', 'orders', 'play',
  'played', 'playing', 'plays', 'receive', 'received', 'receives', 'receiving', 'send', 'sending',
  'see', 'seeing', 'sees', 'saw', 'sends', 'sent', 'ship', 'shipped', 'shipping', 'ships', 'use', 'used', 'uses', 'using', 'work',
  'worked', 'working', 'works', 'binili', 'bumili', 'dumating', 'ginamit', 'gumamit', 'gumana',
  'gumagana', 'nagdownload', 'naglaro', 'naglalaro', 'nabili', 'natanggap', 'nilaro', 'tinanggap',
]);
const REVIEW_URL_PATTERN = /https?:\/\/\S+|www\.\S+/gi;
const REVIEW_TOKEN_PATTERN = /[\p{L}]+(?:-[\p{L}]+)*/gu;
const PHRASE_CONNECTORS = new Set(['and', 'to']);
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

function unwrapReview(entry) {
  return Number.isInteger(entry?.topicResultIndex) ? entry.review : entry;
}

function topicLabelWords(label) {
  return new Set((label.match(REVIEW_TOKEN_PATTERN) || []).flatMap((word) => (
    word.toLocaleLowerCase().split('-')
  )));
}

function clauseAtPosition(clauses, position) {
  return clauses.find((clause) => (
    clause.index <= position && position < clause.index + clause[0].length
  ));
}

function isSubjectBeforePossessiveVerb(source, endPosition) {
  return /^\s+(?:[\p{L}-]+\s+){0,2}(?:has|have|had)\b/iu.test(source.slice(endPosition));
}

function isReadablePhrase(tokens) {
  const parts = tokens.flatMap((token) => token.toLocaleLowerCase().split('-'));
  if (!parts.length || parts.some((part) => part.length < 2)) return false;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const isInnerConnector = PHRASE_CONNECTORS.has(part) && index > 0 && index < parts.length - 1;
    const isLeadingNegation = part === 'no' && index === 0 && parts.length > 1;
    const isInfinitiveVerb = part === 'assemble' && parts[index - 1] === 'to' && index === parts.length - 1;
    if (isInnerConnector || isLeadingNegation || isInfinitiveVerb) continue;
    if (COMMON_REVIEW_WORDS.has(part) || ORDINARY_REVIEW_VERBS.has(part)) return false;
  }

  const contentParts = parts.filter((part, index) => (
    !PHRASE_CONNECTORS.has(part) && !(part === 'no' && index === 0)
  ));
  if (!contentParts.length || contentParts.length > 3) return false;
  return !(contentParts.length === 1 && GENERIC_REVIEW_WORDS.has(contentParts[0]));
}

export function getMeaningfulKeywords(reviews, selectedTopicLabel = null, topicAnalysis = null) {
  const frequencies = new Map();
  const topicResults = Array.isArray(topicAnalysis?.results) ? topicAnalysis.results : [];
  const targetTopicWords = selectedTopicLabel ? topicLabelWords(selectedTopicLabel) : new Set();

  reviews.forEach((entry, entryIndex) => {
    const reviewText = getReviewText(unwrapReview(entry));
    const { source, markupBoundaries } = prepareKeywordSource(reviewText);
    const tokens = [...source.matchAll(REVIEW_TOKEN_PATTERN)];
    const reviewTerms = new Map();
    const resultIndex = Number.isInteger(entry?.topicResultIndex) ? entry.topicResultIndex : entryIndex;
    const assignedLabels = topicResults[resultIndex]?.topics?.map((topic) => topic.label) || [];
    const competingTopicWords = new Set(assignedLabels
      .filter((label) => label !== selectedTopicLabel)
      .flatMap((label) => [...topicLabelWords(label)]));
    const clauses = [...source.matchAll(/[^.!?;\n]+/g)];
    const targetCueClauses = clauses.filter((clause) => (
      [...topicLabelWords(clause[0])].some((word) => targetTopicWords.has(word))
    ));

    for (let start = 0; start < tokens.length; start += 1) {
      const phraseTokens = [];
      for (let end = start; end < Math.min(tokens.length, start + 4); end += 1) {
        if (end > start) {
          const previous = tokens[end - 1];
          const previousEnd = previous.index + previous[0].length;
          const gap = source.slice(previousEnd, tokens[end].index);
          if (!/^\s+$/.test(gap) || markupBoundaries.has(previousEnd)) break;
        }

        const token = tokens[end][0];
        phraseTokens.push(token);
        if (!isReadablePhrase(phraseTokens)) continue;

        const term = source.slice(tokens[start].index, tokens[end].index + token.length);
        if (!source.toLocaleLowerCase().includes(term.toLocaleLowerCase())) continue;
        if (isSubjectBeforePossessiveVerb(source, tokens[end].index + token.length)) continue;
        const clause = clauseAtPosition(clauses, tokens[start].index);
        const clauseWords = clause ? topicLabelWords(clause[0]) : new Set();
        const hasTargetCue = [...clauseWords].some((word) => targetTopicWords.has(word));
        const hasCompetingCue = [...clauseWords].some((word) => competingTopicWords.has(word));
        if (targetCueClauses.length && !hasTargetCue) continue;
        if (hasCompetingCue && !hasTargetCue) continue;
        if (!hasTargetCue && phraseTokens.some((word) => competingTopicWords.has(word.toLocaleLowerCase()))) continue;

        const key = phraseTokens.map((word) => word.toLocaleLowerCase()).join(' ');
        const candidate = reviewTerms.get(key);
        if (candidate) candidate.occurrences += 1;
        else reviewTerms.set(key, { term, tokens: [...phraseTokens], occurrences: 1 });
      }
    }

    reviewTerms.forEach((candidate, key) => {
      const frequency = frequencies.get(key);
      if (frequency) {
        frequency.reviewCount += 1;
        frequency.occurrences += candidate.occurrences;
      } else {
        frequencies.set(key, {
          ...candidate,
          reviewCount: 1,
        });
      }
    });
  });

  const ranked = [...frequencies.entries()]
    .map(([key, candidate]) => ({
      key,
      ...candidate,
      score: candidate.reviewCount * 2 + Math.log1p(candidate.occurrences) * 0.25 +
        (candidate.tokens.length - 1) * 1 +
        (candidate.tokens.some((token) => PHRASE_CONNECTORS.has(token.toLocaleLowerCase())) ? 1 : 0),
    }))
    .sort((first, second) => second.score - first.score || first.key.localeCompare(second.key));
  const selected = [];
  for (const candidate of ranked) {
    if (selected.length === 8) break;
    const candidateTokens = candidate.tokens
      .map((token) => token.toLocaleLowerCase())
      .filter((token) => !PHRASE_CONNECTORS.has(token) && !COMMON_REVIEW_WORDS.has(token));
    if (selected.some((chosen) => {
      const chosenTokens = chosen.tokens
        .map((token) => token.toLocaleLowerCase())
        .filter((token) => !PHRASE_CONNECTORS.has(token) && !COMMON_REVIEW_WORDS.has(token));
      return candidateTokens.some((token) => chosenTokens.includes(token));
    })) continue;
    selected.push(candidate);
  }

  return selected.map(({ term }) => term);
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
    const topicReviews = eligibleReviews.filter((entry, index) => {
      const resultIndex = Number.isInteger(entry?.topicResultIndex) ? entry.topicResultIndex : index;
      const result = topicResults[resultIndex];
      return (result?.reviewIndex == null || result.reviewIndex === resultIndex) &&
        result?.topics?.some((topic) => topic.label === label);
    });
    const count = topicReviews.length;
    return {
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label,
      count,
      percentage: totalReviews ? Number(((count / totalReviews) * 100).toFixed(1)) : 0,
      keywords: getMeaningfulKeywords(topicReviews, label, topicAnalysis),
      reviews: topicReviews.slice(0, 3).map((entry) => getReviewText(unwrapReview(entry))).filter(Boolean),
    };
  });
}
