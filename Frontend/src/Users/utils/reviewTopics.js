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
  'super', 'talaga', 'one', 'has', 'have', 'had', 'be', 'been', 'being', 'no', 'a',
  'an', 'any', 'because', 'before', 'between', 'both', 'each', 'either', 'else', 'every',
  'few', 'hers', 'herself', 'him', 'himself', 'his', 'itself', 'many', 'might', 'mine',
  'most', 'must', 'my', 'myself', 'neither', 'once', 'other', 'ours', 'ourselves', 'own',
  'same', 'should', 'since', 'some', 'such', 'than', 'these', 'those', 'through', 'under',
  'until', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'whose', 'why', 'will',
  'yours', 'yourself', 'yourselves', 'keep', 'kept', 'keeping',
  "aren't", "can't", "couldn't", "didn't", "doesn't", "don't", "hadn't", "hasn't",
  "haven't", "isn't", "mustn't", "shouldn't", "wasn't", "weren't", "won't", "wouldn't",
]);
const GENERIC_REVIEW_WORDS = new Set([
  'app', 'apps', 'item', 'items', 'package', 'person', 'product', 'products', 'review',
  'reviews', 'stuff', 'thing', 'things', 'game', 'games', 'customer', 'team', 'teams',
  'new', 'latest',
]);
const GENERIC_STANDALONE_TOPIC_WORDS = new Set([
  'support', 'service', 'request', 'replied', 'refund', 'update', 'latest', 'new',
]);
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
const REVIEW_TOKEN_PATTERN = /[\p{L}]+(?:[-'’][\p{L}]+)*/gu;
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
const TOPIC_KEYWORD_RELEVANCE_THRESHOLD = 0.75;
const TOPIC_KEYWORD_MAX_SCORE_GAP = 0.025;
const MAX_CANDIDATES_PER_TOPIC = 40;
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

function getReviewKeywordCandidates(reviewText) {
  const { source, markupBoundaries } = prepareKeywordSource(reviewText);
  const tokens = [...source.matchAll(REVIEW_TOKEN_PATTERN)];
  const candidates = new Map();

  for (let start = 0; start < tokens.length; start += 1) {
    for (let end = start; end < Math.min(tokens.length, start + 4); end += 1) {
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
      const contentTokens = candidateTokens
        .flatMap((token) => token.toLocaleLowerCase().split('-'))
        .filter((token) => (
          !COMMON_REVIEW_WORDS.has(token) &&
          (!GENERIC_REVIEW_WORDS.has(token) ||
            (preservesMiniGames && token === 'games') ||
            (preservesReinstallingGame && token === 'game')) &&
          !PHRASE_CONNECTORS.has(token) &&
          !ORDINARY_REVIEW_VERBS.has(token) &&
          !(candidateTokens.length === 1 && GENERIC_STANDALONE_TOPIC_WORDS.has(token))
        ));
      if (!contentTokens.length || contentTokens.some((token) => token.length < 2)) continue;
      if (candidateTokens.length === 1 &&
        (ORDINARY_REVIEW_VERBS.has(contentTokens[0]) ||
          GENERIC_STANDALONE_TOPIC_WORDS.has(contentTokens[0]) ||
          INCOMPLETE_PHRASE_ENDINGS.has(contentTokens[0]))) continue;
      const containsGenericActionVerb = candidateTokens.some((token) => (
        token.toLocaleLowerCase().split('-').some((part) => ORDINARY_REVIEW_VERBS.has(part))
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
      ) || preservesReinstallingGame;
      if (containsGenericActionVerb && !isMeaningfulActionPhrase) continue;
      if (INCOMPLETE_PHRASE_ENDINGS.has(candidateTokens.at(-1).toLocaleLowerCase())) continue;
      const hasUnhelpfulFunctionWord = candidateTokens.some((token) => (
        token.toLocaleLowerCase().split('-').some((part) => (
          COMMON_REVIEW_WORDS.has(part) &&
          !PHRASE_CONNECTORS.has(part) &&
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

    const candidates = getReviewKeywordCandidates(getReviewText(unwrapReview(entry)));
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
        second.term.split(/\s+/).length - first.term.split(/\s+/).length ||
        first.term.localeCompare(second.term)
      ))
      .slice(0, MAX_CANDIDATES_PER_TOPIC)
      .forEach(([key, candidate]) => uniqueCandidates.set(key, candidate.term));
  });
  return [...uniqueCandidates.values()];
}

function getTopicKeywordSelection(reviews, selectedTopicLabel, topicAnalysis) {
  const diagnostics = {
    reviewCount: reviews.length,
    selectedTopicLabel,
    candidateOccurrenceCount: 0,
    uniqueCandidateCount: 0,
    scoredCandidateOccurrenceCount: 0,
    relevancePassingCandidateCount: 0,
    minimumRelevanceThreshold: TOPIC_KEYWORD_RELEVANCE_THRESHOLD,
    maximumCompetingScoreGap: TOPIC_KEYWORD_MAX_SCORE_GAP,
    relevanceScoreSummary: null,
    competingScoreGapSummary: null,
    nonRedundantCandidateCount: 0,
    displayedKeywordCount: 0,
    rejectedCandidates: [],
  };
  if (!selectedTopicLabel || !topicAnalysis?.keywordScores) {
    return { keywords: [], diagnostics };
  }

  const frequencies = new Map();
  const scores = [];
  const scoreGaps = [];

  reviews.forEach((entry, reviewIndex) => {
    const reviewTerms = getReviewKeywordCandidates(getReviewText(unwrapReview(entry)));
    reviewTerms.forEach((term, key) => {
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
        : relevance < TOPIC_KEYWORD_RELEVANCE_THRESHOLD
          ? 'below_minimum_relevance'
          : strongestCompetingScore == null
            ? 'competing_topic_scores_missing'
            : scoreGap > TOPIC_KEYWORD_MAX_SCORE_GAP
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
        strongestCompetingScore,
        scoreGap,
      };
      current.reviewCount += 1;
      current.relevance = Math.max(current.relevance, relevance);
      if (strongestCompetingScore > current.strongestCompetingScore) {
        current.strongestCompetingScore = strongestCompetingScore;
        current.scoreGap = scoreGap;
      }
      current.reviewIndexes.add(reviewIndex);
      frequencies.set(key, current);
    });
  });

  diagnostics.uniqueCandidateCount = new Set(
    reviews.flatMap((entry) => [...getReviewKeywordCandidates(getReviewText(unwrapReview(entry))).keys()]),
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
      if (other === candidate || other.term.length <= candidate.term.length) return false;
      if (![...candidate.reviewIndexes].some((index) => other.reviewIndexes.has(index))) return false;

      const otherTokens = other.term.toLocaleLowerCase().match(REVIEW_TOKEN_PATTERN) || [];
      return candidateTokens.length < otherTokens.length &&
        otherTokens.some((_, start) => candidateTokens.every((token, offset) => (
          otherTokens[start + offset] === token
        )));
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
      (second.relevance + Math.min(second.term.split(/\s+/).length - 1, 2) * 0.01) -
      (first.relevance + Math.min(first.term.split(/\s+/).length - 1, 2) * 0.01)
    ) ||
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

  return {
    keywords: displayedCandidates.map(({ term }) => term),
    diagnostics,
  };
}

export function getTopicKeywordDiagnostics(reviews, selectedTopicLabel, topicAnalysis) {
  return getTopicKeywordSelection(reviews, selectedTopicLabel, topicAnalysis).diagnostics;
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
