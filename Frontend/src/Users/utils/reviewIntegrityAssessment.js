export const REVIEW_INTEGRITY_SCHEMA_VERSION = '2.0';
export const REVIEW_INTEGRITY_RULE_VERSION = '1.0.0';

export const PROVISIONAL_NEAR_DUPLICATE_THRESHOLD = 0.85;
export const MIN_NEAR_DUPLICATE_TOKEN_COUNT = 6;

export const MIN_TEMPLATE_PHRASE_WORDS = 3;
export const MAX_TEMPLATE_PHRASE_WORDS = 6;
export const MIN_REVIEWS_FOR_TEMPLATE_SHARING = 2;
// Common wording is filtered below; a match needs four distinct informative terms.
const MIN_DISTINCTIVE_TEMPLATE_TERMS = 4;

export const REVIEW_INTEGRITY_RULES = Object.freeze({
  INCENTIVIZED_SOLICITATION: {
    id: 'RIA-A',
    name: 'Explicit Incentivized Review Solicitation',
    plainName: 'Incentivized Review Mentions',
    description: 'Flags mentions of requests for positive ratings or reviews in exchange for benefits, discounts, or gifts.',
    explanation: 'This review mentions a request for a positive rating or review in exchange for a benefit. This does not show whether the reviewer accepted it or whether the review is deceptive.',
  },
  WITHIN_REVIEW_REPETITION: {
    id: 'RIA-B',
    name: 'Unusual Within-Review Repetition',
    plainName: 'Repeated Words & Phrases',
    description: 'Flags words or phrases that occur unusually often within a single review.',
    explanation: 'A word or phrase occurs unusually often within this review.',
  },
  CHARACTER_ELONGATION: {
    id: 'RIA-C',
    name: 'Unusual Character Elongation',
    plainName: 'Character Elongation',
    description: 'Flags unnaturally long repeated letters (e.g., "soooo good").',
    explanation: 'This review contains an unusually long run of the same letter.',
  },
  EXCESSIVE_PUNCTUATION: {
    id: 'RIA-D',
    name: 'Excessive Punctuation',
    plainName: 'Excessive Punctuation',
    description: 'Flags unusually dense or repeated punctuation patterns.',
    explanation: 'This review uses an unusually dense or repeated punctuation pattern.',
  },
  NEAR_DUPLICATE_SIMILARITY: {
    id: 'RIA-E',
    name: 'Near-Duplicate Text Similarity',
    plainName: 'Near-Duplicate Review Text',
    description: 'Flags reviews in the current batch that have unusually similar wording to another review.',
    explanation: 'This review shares unusually similar wording with another review in this batch. Text similarity does not confirm that a review is fake or copied.',
  },
  CROSS_REVIEW_TEMPLATE: {
    id: 'RIA-F',
    name: 'Cross-Review Phrase/Template Sharing',
    plainName: 'Shared Phrase or Template',
    description: 'Flags specific phrases or template structures with multiple distinctive terms shared across reviews.',
    explanation: 'This review shares a distinctive phrase or template structure with another review in this batch. Shared phrasing alone does not confirm copied or coordinated reviews.',
  },
});

export const DEFAULT_RIA_RULE_IDS = Object.freeze([
  'RIA-A',
  'RIA-B',
  'RIA-C',
  'RIA-D',
]);

export const ALL_RIA_RULE_IDS = Object.freeze([
  'RIA-A',
  'RIA-B',
  'RIA-C',
  'RIA-D',
  'RIA-E',
  'RIA-F',
]);

export function toggleReviewIntegrityRuleSelection(currentRuleIds, ruleId) {
  if (!Array.isArray(currentRuleIds) || !ALL_RIA_RULE_IDS.includes(ruleId)) {
    throw new TypeError('A valid Review Integrity rule selection is required.');
  }
  const isEnabled = currentRuleIds.includes(ruleId);
  if (isEnabled && currentRuleIds.length <= 1) return currentRuleIds;
  return isEnabled
    ? currentRuleIds.filter((currentRuleId) => currentRuleId !== ruleId)
    : [...currentRuleIds, ruleId];
}

/**
 * Curated list of common, generic, or platform-specific boilerplate expressions.
 * Documented categories:
 * - Delivery & packaging arrival comments (e.g., "item arrived in good condition")
 * - Standard seller & courier gratitude (e.g., "thank you seller and rider")
 * - Repetitive repurchase promises (e.g., "will order again next time")
 * - Generic price/quality evaluation clichés (e.g., "good quality for its price")
 */
export const COMMON_BOILERPLATE_PHRASES = new Set([
  // Delivery & packaging expressions
  'item arrived in good condition',
  'received the item in good condition',
  'order received in good condition',
  'package arrived safely and securely',
  'fast delivery and well packed',
  'fast shipping and well packaged',
  'well packaged and fast delivery',
  'well packed and fast shipping',
  'delivered earlier than expected date',
  'delivered faster than expected thank',
  'mabilis ang delivery at maayos',
  'maayos ang pagkakabalot ng item',
  'dumating nang maayos ang item',
  'mabilis dumating ang order ko',
  'nakabalot nang maayos ang produkto',
  'salamat sa maayos na pagkakabalot',

  // Seller, rider, courier service gratitude
  'thank you seller and rider',
  'thank you seller and courier',
  'salamat seller and delivery rider',
  'salamat seller at delivery rider',
  'salamat seller at sa rider',
  'maraming salamat seller and rider',
  'thank you very much seller',
  'thank you so much seller',
  'maraming salamat po sa seller',

  // Repurchase intention & satisfaction clichés
  'will order again next time',
  'will definitely order again thank',
  'will surely order again next',
  'order ulit ako next time',
  'sa uulitin order ulit ako',
  'sulit ang bayad highly recommended',
  'highly recommended to everyone thank',
  'good quality for its price',
  'worth the price thank you',
  'maganda ang quality para sa presyo',
  'sulit na sulit ang bayad',
]);

const ASSESSMENT_STATUSES = Object.freeze({
  PATTERNS_DETECTED: 'Patterns Detected',
  NO_PATTERNS: 'No Selected Patterns Detected',
  UNABLE_TO_ASSESS: 'Unable to Assess',
});

const PRIVACY_PLACEHOLDER_PATTERN = /\[(?:EMAIL|PHONE|ORDER_ID|ADDRESS|NAME)\]/gu;
const TAGLISH_STOP_WORDS = new Set([
  'and', 'lang', 'nga', 'naman', 'opo', 'po', 'talaga', 'the',
]);
const GENERIC_TEMPLATE_TOKENS = new Set([
  'a', 'an', 'and', 'arrived', 'as', 'at', 'for', 'good', 'great', 'in',
  'all', 'battery', 'day', 'excellent', 'highly', 'item', 'lasts', 'life',
  'of', 'on', 'order', 'package', 'performance', 'product', 'quality',
  'recommended', 'the', 'this', 'to', 'use', 'very', 'was', 'well', 'with',
  'works',
]);

const ACTION_PATTERNS = [
  /(?:leave|write|post|give|provide)\s+(?:us\s+)?(?:a\s+)?(?:positive|good|great|5[\s-]?star|five[\s-]?star)\s+(?:review|rating|feedback)/iu,
  /(?:give|rate)\s+(?:it\s+)?(?:5[\s-]?stars?|five[\s-]?stars?|a\s+positive\s+rating)/iu,
  /(?:5[\s-]?stars?|five[\s-]?stars?)\s+(?:review|rating)/iu,
  /(?:magbigay|bigyan)\s+(?:ng\s+)?(?:5[\s-]?stars?|limang\s+bituin|magandang\s+(?:review|rating))/iu,
  /mag[-\s]?iwan\s+(?:ng\s+)?(?:magandang|positive|5[\s-]?star)\s+(?:review|rating|feedback)/iu,
  /paki[-\s]?(?:rate|review)\s+(?:ng\s+)?(?:5[\s-]?stars?|magandang\s+(?:review|rating))/iu,
  /(?:5[\s-]?stars?|limang\s+bituin)/iu,
];

const BENEFIT_PATTERN = /(?:^|[^\p{L}\p{N}])(?:voucher|discount|cashback|freebie|free\s+item|gift|reward|points?|load|regalo|libreng\s+(?:item|produkto|gamit)|pa[-\s]?raffle|raffle|incentive|refund)(?=$|[^\p{L}\p{N}])/iu;
const RELATIONSHIP_PATTERNS = [
  /(?:^|[^\p{L}\p{N}])(?:in\s+exchange\s+for|in\s+return\s+for|kapalit(?:\s+ng)?|basta|kapag|kung|if|when|upon|for|para(?:\s+makakuha)?|to\s+get)(?=$|[^\p{L}\p{N}])/iu,
];
const CONDITIONAL_PREFIX_PATTERN = /^(?:if|when|basta|kapag|kung)\b/iu;
const NEGATED_SOLICITATION_PATTERNS = [
  /(?:^|[^\p{L}\p{N}])(?:no|not|never|did\s+not|didn't|was\s+not|wasn't)(?:(?![.!?;]).){0,55}(?:ask(?:ed)?|request(?:ed)?|offer(?:ed)?|promise(?:d)?)(?=$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])(?:no|not|never|did\s+not|didn't|was\s+not|wasn't)(?:(?![.!?;]).){0,55}(?:voucher|discount|cashback|freebie|free\s+item|gift|reward|points?|load|regalo)(?:(?![.!?;]).){0,30}(?:offer(?:ed)?|ask(?:ed)?|request(?:ed)?)(?=$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])(?:hindi|wala|walang)(?:(?![.!?;]).){0,55}(?:nag[-\s]?alok|inalok|nanghingi|humingi|hiningi|pinakiusapan|hingi|offer|request)(?=$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])(?:hindi|wala|walang)(?:(?![.!?;]).){0,55}(?:voucher|discount|cashback|freebie|gift|reward|regalo)(?:(?![.!?;]).){0,30}(?:alok|hingi|kapalit)(?=$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])(?:not|hindi)\s+(?:in\s+exchange\s+for|kapalit(?:\s+ng)?)(?=$|[^\p{L}\p{N}])/iu,
];

function removeKnownPrivacyPlaceholders(text) {
  return text.replace(PRIVACY_PLACEHOLDER_PATTERN, ' ').replace(/\s+/gu, ' ').trim();
}

function findPatternSpans(text, pattern) {
  const matcher = new RegExp(pattern.source, `${pattern.flags.replaceAll('g', '')}g`);
  return Array.from(text.matchAll(matcher), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function hasSolicitationRelationship(clause) {
  if (NEGATED_SOLICITATION_PATTERNS.some((pattern) => pattern.test(clause))) return false;

  const actions = ACTION_PATTERNS.flatMap((pattern) => findPatternSpans(clause, pattern));
  const benefits = findPatternSpans(clause, BENEFIT_PATTERN);
  const relationships = RELATIONSHIP_PATTERNS.flatMap((pattern) => findPatternSpans(clause, pattern));

  return actions.some((action) => benefits.some((benefit) => {
    const earlier = action.end <= benefit.start ? action : benefit;
    const later = earlier === action ? benefit : action;
    const relationshipBetweenSignals = relationships.some((relationship) => (
      relationship.start >= earlier.end && relationship.end <= later.start
    ));
    const conditionalBeforeAction = action.end <= benefit.start &&
      CONDITIONAL_PREFIX_PATTERN.test(clause.trim()) &&
      relationships.some((relationship) => relationship.end <= action.start);
    return relationshipBetweenSignals || conditionalBeforeAction;
  }));
}

function detectsIncentivizedSolicitation(text) {
  return text.split(/[.!?;\n]+/u).some((clause) => hasSolicitationRelationship(clause));
}

function tokenize(text) {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*(?:-[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*)*/gu) || [];
}

function isNaturalReduplication(token) {
  const [first, second, ...rest] = token.split('-');
  return Boolean(second && rest.length === 0 && first === second);
}

function detectsWithinReviewRepetition(text) {
  const tokens = tokenize(text.normalize('NFKC').toLowerCase());
  const eligibleTokens = tokens.filter((token) => (
    !TAGLISH_STOP_WORDS.has(token) && !isNaturalReduplication(token)
  ));
  if (eligibleTokens.length === 0) return false;

  const tokenCounts = new Map();
  eligibleTokens.forEach((token) => tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1));
  if (Array.from(tokenCounts.values()).some((count) => (
    count >= 4 && count / eligibleTokens.length >= 0.2
  ))) return true;

  for (let phraseLength = 2; phraseLength <= 5 && phraseLength <= tokens.length; phraseLength += 1) {
    const phraseStarts = new Map();
    for (let start = 0; start <= tokens.length - phraseLength; start += 1) {
      const phraseTokens = tokens.slice(start, start + phraseLength);
      if (phraseTokens.some(isNaturalReduplication) ||
          phraseTokens.filter((token) => !TAGLISH_STOP_WORDS.has(token)).length < 2) continue;
      const phrase = phraseTokens.join(' ');
      const starts = phraseStarts.get(phrase) || [];
      starts.push(start);
      phraseStarts.set(phrase, starts);
    }

    for (const starts of phraseStarts.values()) {
      let occurrences = 0;
      let nextAvailableStart = 0;
      for (const start of starts) {
        if (start < nextAvailableStart) continue;
        occurrences += 1;
        nextAvailableStart = start + phraseLength;
        if (occurrences >= 3) return true;
      }
    }
  }
  return false;
}

function detectsCharacterElongation(text) {
  return /(\p{L})\1{4,}/iu.test(text.normalize('NFKC').toLowerCase());
}

function detectsExcessivePunctuation(text) {
  const nonWhitespaceCharacters = Array.from(text).filter((character) => !/\s/u.test(character));
  const punctuationCount = nonWhitespaceCharacters.filter((character) => /\p{P}/u.test(character)).length;
  if (/\p{P}{4,}/u.test(text)) return true;
  return nonWhitespaceCharacters.length >= 40 &&
    punctuationCount >= 8 &&
    punctuationCount / nonWhitespaceCharacters.length >= 0.15;
}

function makeUnableToAssess(reviewIndex, assessmentReason) {
  return {
    reviewIndex,
    assessmentStatus: ASSESSMENT_STATUSES.UNABLE_TO_ASSESS,
    triggeredRules: [],
    evaluatedRuleIds: [],
    assessmentReason,
    ruleVersion: REVIEW_INTEGRITY_RULE_VERSION,
  };
}

/**
 * Helper: Jaccard similarity between two token arrays
 */
function calculateTokenJaccardSimilarity(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Helper: determine if a phrase is generic/boilerplate
 */
function isGenericOrBoilerplatePhrase(phrase) {
  const normalized = phrase.trim().toLowerCase();
  if (COMMON_BOILERPLATE_PHRASES.has(normalized)) return true;
  return [...COMMON_BOILERPLATE_PHRASES].some((boilerplate) => (
    ` ${boilerplate} `.includes(` ${normalized} `)
  ));
}

function hasDistinctiveTemplateContent(tokens) {
  const distinctiveTokens = new Set(tokens.filter((token) => (
    token.length > 1 &&
    !GENERIC_TEMPLATE_TOKENS.has(token) &&
    !TAGLISH_STOP_WORDS.has(token)
  )));
  return distinctiveTokens.size >= MIN_DISTINCTIVE_TEMPLATE_TERMS;
}

/**
 * Detect near-duplicate reviews within a batch
 */
function detectNearDuplicateReviews(reviews, options = {}) {
  const {
    threshold = PROVISIONAL_NEAR_DUPLICATE_THRESHOLD,
    minTokenCount = MIN_NEAR_DUPLICATE_TOKEN_COUNT,
  } = options;

  const detections = [];
  const tokenized = reviews.map((review) => {
    const tokens = tokenize(review.text.normalize('NFKC').toLowerCase()).filter(t => t.length > 0);
    return { index: review.reviewIndex, tokens };
  });

  for (let i = 0; i < tokenized.length; i++) {
    const { index: idxA, tokens: toksA } = tokenized[i];
    if (toksA.length < minTokenCount) continue;
    for (let j = i + 1; j < tokenized.length; j++) {
      const { index: idxB, tokens: toksB } = tokenized[j];
      if (toksB.length < minTokenCount) continue;
      const similarity = calculateTokenJaccardSimilarity(toksA, toksB);
      if (similarity >= threshold) {
        detections.push({ reviewIndices: [idxA, idxB], similarity });
      }
    }
  }
  return detections;
}

/**
 * Detect shared phrase/template across reviews
 */
function detectCrossReviewTemplateSharing(reviews, options = {}) {
  const {
    minWords = MIN_TEMPLATE_PHRASE_WORDS,
    maxWords = MAX_TEMPLATE_PHRASE_WORDS,
    minReviews = MIN_REVIEWS_FOR_TEMPLATE_SHARING,
  } = options;

  const phraseMap = new Map();

  reviews.forEach((review) => {
    const tokens = tokenize(review.text.normalize('NFKC').toLowerCase());
    const len = tokens.length;
    for (let size = minWords; size <= maxWords; size++) {
      if (size > len) break;
      for (let start = 0; start <= len - size; start++) {
        const phraseTokens = tokens.slice(start, start + size);
        const phrase = phraseTokens.join(' ');
        if (isGenericOrBoilerplatePhrase(phrase) || !hasDistinctiveTemplateContent(phraseTokens)) continue;
        const set = phraseMap.get(phrase) ?? new Set();
        set.add(review.reviewIndex);
        phraseMap.set(phrase, set);
      }
    }
  });

  const detections = [];
  for (const [phrase, idxSet] of phraseMap.entries()) {
    if (idxSet.size >= minReviews) {
      detections.push({ phrase, reviewIndices: Array.from(idxSet) });
    }
  }
  return detections;
}

/**
 * Assess review integrity, now including batch‑level rules RIA‑E and RIA‑F.
 */
export function assessReviewIntegrity(indexedReviews, { enabledRuleIds = DEFAULT_RIA_RULE_IDS } = {}) {
  // Validate input
  if (!Array.isArray(indexedReviews)) {
    throw new TypeError('Review Integrity Assessment input must be an array.');
  }
  if (!enabledRuleIds || !Array.isArray(enabledRuleIds)) {
    throw new TypeError('enabledRuleIds must be an array of rule identifiers.');
  }

  const requestedRuleIdSet = new Set(enabledRuleIds);
  const activeRuleIds = ALL_RIA_RULE_IDS.filter((id) => requestedRuleIdSet.has(id));

  if (activeRuleIds.length === 0) {
    throw new RangeError('At least one RIA rule must remain enabled.');
  }

  const activeRuleIdSet = new Set(activeRuleIds);
  const seenReviewIndexes = new Set();

  const ruleCheckMap = [
    { rule: REVIEW_INTEGRITY_RULES.INCENTIVIZED_SOLICITATION, fn: detectsIncentivizedSolicitation },
    { rule: REVIEW_INTEGRITY_RULES.WITHIN_REVIEW_REPETITION, fn: detectsWithinReviewRepetition },
    { rule: REVIEW_INTEGRITY_RULES.CHARACTER_ELONGATION, fn: detectsCharacterElongation },
    { rule: REVIEW_INTEGRITY_RULES.EXCESSIVE_PUNCTUATION, fn: detectsExcessivePunctuation },
  ];

  // Per‑review evaluation
  const results = indexedReviews.map((review) => {
    const reviewIndex = review?.reviewIndex;
    if (!Number.isSafeInteger(reviewIndex) || reviewIndex < 0 || seenReviewIndexes.has(reviewIndex)) {
      throw new TypeError('Review Integrity Assessment input contains an invalid reviewIndex.');
    }
    seenReviewIndexes.add(reviewIndex);

    if (!Object.hasOwn(review, 'text')) return makeUnableToAssess(reviewIndex, 'missing_text');
    if (typeof review.text !== 'string') return makeUnableToAssess(reviewIndex, 'invalid_text');

    const text = removeKnownPrivacyPlaceholders(review.text);
    if (!text) return makeUnableToAssess(reviewIndex, 'empty_after_sanitization');

    const triggeredRules = [];
    for (const check of ruleCheckMap) {
      if (activeRuleIdSet.has(check.rule.id) && check.fn(text)) {
        triggeredRules.push({
          id: check.rule.id,
          name: check.rule.name,
          plainName: check.rule.plainName,
          explanation: check.rule.explanation,
        });
      }
    }

    return {
      reviewIndex,
      assessmentStatus: triggeredRules.length > 0 ? ASSESSMENT_STATUSES.PATTERNS_DETECTED : ASSESSMENT_STATUSES.NO_PATTERNS,
      triggeredRules,
      evaluatedRuleIds: [...activeRuleIds],
      ruleVersion: REVIEW_INTEGRITY_RULE_VERSION,
    };
  });

  // Batch‑level rules
  if (activeRuleIdSet.has('RIA-E') || activeRuleIdSet.has('RIA-F')) {
    const validReviews = indexedReviews.filter((r) => typeof r.text === 'string' && r.text.trim().length > 0);

    // Near‑duplicate (RIA‑E)
    if (activeRuleIdSet.has('RIA-E')) {
      const nearDup = detectNearDuplicateReviews(validReviews);
      const ruleInfo = REVIEW_INTEGRITY_RULES.NEAR_DUPLICATE_SIMILARITY;
      const matchesByReview = new Map();
      nearDup.forEach(({ reviewIndices, similarity }) => {
        reviewIndices.forEach((revIdx) => {
          const peerIndex = reviewIndices.find((index) => index !== revIdx);
          const matches = matchesByReview.get(revIdx) ?? new Map();
          matches.set(peerIndex, Math.max(matches.get(peerIndex) ?? 0, similarity));
          matchesByReview.set(revIdx, matches);
        });
      });
      matchesByReview.forEach((matches, reviewIndex) => {
        const result = results.find((reviewResult) => reviewResult.reviewIndex === reviewIndex);
        if (!result) return;
        const matchedReviews = [...matches].map(([peerReviewIndex, score]) => ({
          reviewIndex: peerReviewIndex,
          similarity: score,
        }));
        const maximumSimilarity = Math.max(...matchedReviews.map(({ similarity }) => similarity));
        result.triggeredRules.push({
          id: ruleInfo.id,
          name: ruleInfo.name,
          plainName: ruleInfo.plainName,
          matchedReviews,
          explanation: `${ruleInfo.explanation} (similarity ${Math.round(maximumSimilarity * 100)}%; similar to ${matchedReviews.map(({ reviewIndex: peer }) => `review ${peer + 1}`).join(', ')}).`,
        });
      });
    }

    // Cross‑review template (RIA‑F)
    if (activeRuleIdSet.has('RIA-F')) {
      const templates = detectCrossReviewTemplateSharing(validReviews);
      const ruleInfo = REVIEW_INTEGRITY_RULES.CROSS_REVIEW_TEMPLATE;
      const phrasesByReview = new Map();
      templates.forEach(({ phrase, reviewIndices }) => {
        reviewIndices.forEach((revIdx) => {
          const phrases = phrasesByReview.get(revIdx) ?? new Set();
          phrases.add(phrase);
          phrasesByReview.set(revIdx, phrases);
        });
      });
      phrasesByReview.forEach((matchedPhrases, reviewIndex) => {
        const result = results.find((reviewResult) => reviewResult.reviewIndex === reviewIndex);
        if (!result) return;
        const phrases = [...matchedPhrases];
        result.triggeredRules.push({
          id: ruleInfo.id,
          name: ruleInfo.name,
          plainName: ruleInfo.plainName,
          matchedPhrases: phrases,
          explanation: `${ruleInfo.explanation} Shared phrases: ${phrases.map((phrase) => `"${phrase}"`).join('; ')}.`,
        });
      });
    }

    // Update overall assessment status after batch detections
    results.forEach((r) => {
      if (r.triggeredRules && r.triggeredRules.length > 0) {
        r.assessmentStatus = ASSESSMENT_STATUSES.PATTERNS_DETECTED;
      }
    });
  }

  // Attach metadata
  Object.assign(results, {
    schemaVersion: REVIEW_INTEGRITY_SCHEMA_VERSION,
    ruleVersion: REVIEW_INTEGRITY_RULE_VERSION,
    activeRuleIds: [...activeRuleIds],
    results,
  });

  return results;
}
