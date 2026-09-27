import { getReviewText } from './reviewTopics.js';

export const PRIORITY_CONFIG = {
  thresholds: {
    critical: 80,
    high: 60,
    medium: 30,
  },
  emotionScores: {
    1: 0,
    2: 3,
    3: 5,
    4: 4,
    5: 4,
    6: 2,
  },
  ratingScores: {
    1: 5,
    2: 3,
    3: 1,
    4: 0,
    5: 0,
  },
  topicWeights: {
    'Quality': 6,
    'Performance / Functionality': 10,
    'Features / Content': 1,
    'Service / Support': 6,
    'Delivery / Transaction': 8,
    'Price / Value': 3,
    'Usability / Experience': 4,
    'Accuracy / Expectations': 6,
    'Availability / Accessibility': 7,
    'Environment / Location': 2,
    'Other / General': 0,
  },
  topicRelevancePatterns: {
    'Quality': /\b(?:quality|clean|cleaner|dirty|defect(?:ive)?|broken|damag(?:e|ed)|material|durab(?:le|ility)|taste)\b/i,
    'Performance / Functionality': /\b(?:crash(?:es|ed|ing)?|bug|glitch|lag|slow|fps|frame\s*rate|stutter|not\s+working|not\s+showing|function(?:s|ality)?|damage\s+and\s+healing\s+numbers|performance\s+(?:is\s+)?(?:unreliable|poor|bad|slow))\b/i,
    'Features / Content': /\b(?:feature|dark\s+mode|level|content|gameplay|option|add\s+(?:a\s+)?(?:feature|mode))\b/i,
    'Service / Support': /\b(?:staff|support|customer\s+service|seller|helpful|approachable|rude|assistance|service)\b/i,
    'Delivery / Transaction': /\b(?:shipping|delivery|delivered|checkout|order|payment|charged|refund|transaction|purchase)\b/i,
    'Price / Value': /\b(?:price|cost|expensive|cheap|afford|worth|value|charged|money)\b/i,
    'Usability / Experience': /\b(?:interface|confusing|easy\s+to\s+use|hard\s+to\s+use|difficult\s+to\s+use|navigation|controls?|experience)\b/i,
    'Accuracy / Expectations': /\b(?:expected|expectation|description|not\s+as\s+(?:shown|described)|incorrect|inaccurate|wrong\s+(?:item|size|color|result))\b/i,
    'Availability / Accessibility': /\b(?:available|availability|access(?:ible)?|log\s*in|sign\s*in|opening\s+hours|unavailable)\b/i,
    'Environment / Location': /\b(?:room|location|place|environment|atmosphere|noise|view|surroundings)\b/i,
  },
  minimumTopicConfidence: 0.6,
  maxTopicScore: 10,
  repetitionBonuses: [
    { minimumReviews: 2, score: 5 },
    { minimumReviews: 5, score: 10 },
    { minimumReviews: 10, score: 15 },
  ],
  maxRepetitionScore: 15,
  positiveReviewPattern: /\b(?:perfect|excellent|love(?:d|s)?|great|fantastic|wonderful|very\s+helpful|highly\s+recommend|enjoy(?:ed|ing)?|so\s+fun|works?\s+great)\b/i,
  severeIssueThreshold: 45,
  issueSignalRules: [
    { id: 'duplicate_charge', pattern: /\b(?:charged?\s+(?:me\s+)?twice|double[-\s]?charged|duplicate\s+charge|charged\s+for\s+the\s+same\s+(?:purchase|order))\b/i },
    { id: 'payment_failure', pattern: /\b(?:payment\s+(?:failed|failure|was\s+declined|not\s+processed)|(?:can't|cannot|unable\s+to)\s+(?:pay|complete\s+(?:the\s+)?payment))\b/i },
    { id: 'login_failure', pattern: /\b(?:can't|cannot|unable\s+to|failed\s+to|won't|will\s+not)\s+(?:log\s*in|sign\s*in|access\s+(?:my\s+)?account)\b/i },
    { id: 'repeated_crash', pattern: /\b(?:every\s+time|constantly|keeps?\s+|repeatedly).{0,35}\b(?:crash(?:es|ed|ing)?|close(?:s|d)?\s+unexpectedly)\b|\b(?:crash(?:es|ed|ing)?|close(?:s|d)?\s+unexpectedly).{0,35}\b(?:every\s+time|constantly|keeps?\s+|repeatedly)\b/i },
    { id: 'fps_performance', pattern: /\b(?:fps|frame\s*rate).{0,45}\b(?:drop(?:s|ped|ping)?|stutter(?:s|ing)?|unplayable|impossible\s+to\s+play)|\b(?:drop(?:s|ped|ping)?|stutter(?:s|ing)?|unplayable|impossible\s+to\s+play).{0,45}\b(?:fps|frame\s*rate)\b/i },
    { id: 'performance_unreliable', pattern: /\bperformance\s+(?:is\s+)?(?:unreliable|poor|bad|slow)\b/i },
    { id: 'missing_item', pattern: /\b(?:phone|wallet|item|package|parcel|order|bag|luggage|belongings|device).{0,80}(?:stolen|missing|nowhere\s+to\s+be\s+found|disappeared|never\s+arrived)|(?:stolen|missing|nowhere\s+to\s+be\s+found|disappeared).{0,80}(?:phone|wallet|item|package|parcel|order|bag|luggage|belongings|device)\b/i },
    { id: 'data_security_safety', pattern: /\b(?:fraud|scam|financial\s+loss|lost\s+money|data\s+breach|data\s+leak|data\s+loss|lost\s+all\s+(?:my\s+)?data|account\s+hacked|unauthori[sz]ed\s+access|unsafe|safety\s+concern|injur(?:y|ed)|assault(?:ed)?|electric\s+shock|fire\s+hazard)\b/i },
    { id: 'room_cleanliness', pattern: /\b(?:room|place|bathroom|hotel).{0,45}\b(?:not\s+(?:very\s+)?clean|dirty|unclean|could\s+be\s+cleaner)\b/i },
    { id: 'interface_confusion', pattern: /\b(?:interface|menu|navigation|controls?).{0,45}\b(?:confusing|hard\s+to\s+use|difficult\s+to\s+use)\b/i },
  ],
  severityRules: [
    {
      id: 'financial_loss_or_fraud',
      score: 60,
      minimumLevel: 'CRITICAL',
      reason: 'a duplicate charge, financial loss, fraud, or scam',
      pattern: /\b(?:charged?\s+(?:me\s+)?twice|double[-\s]?charged|duplicate\s+charge|charged\s+for\s+the\s+same\s+(?:purchase|order)|financial\s+loss|lost\s+money|fraud|scam|unauthori[sz]ed\s+charge)\b/i,
    },
    {
      id: 'missing_or_stolen_belonging',
      score: 60,
      minimumLevel: 'CRITICAL',
      reason: 'a missing or stolen personal belonging',
      pattern: /\b(?:phone|wallet|item|package|parcel|order|bag|luggage|belongings|device).{0,80}(?:stolen|missing|nowhere\s+to\s+be\s+found|disappeared|never\s+arrived)|(?:stolen|missing|nowhere\s+to\s+be\s+found|disappeared).{0,80}(?:phone|wallet|item|package|parcel|order|bag|luggage|belongings|device)\b/i,
    },
    {
      id: 'safety_or_security',
      score: 60,
      minimumLevel: 'CRITICAL',
      reason: 'a serious safety, security, or privacy concern',
      pattern: /\b(?:unsafe|safety\s+concern|injur(?:y|ed)|assault(?:ed)?|electric\s+shock|fire\s+hazard|data\s+breach|data\s+leak|data\s+loss|lost\s+all\s+(?:my\s+)?data|private\s+(?:data|information)\s+(?:leaked|exposed)|account\s+hacked|unauthori[sz]ed\s+access)\b/i,
    },
    {
      id: 'account_or_payment_failure',
      score: 60,
      minimumLevel: 'CRITICAL',
      reason: 'an account, login, or payment failure',
      pattern: /\b(?:can't|cannot|unable\s+to|failed\s+to|fail(?:s)?\s+to|won't|will\s+not|doesn't|does\s+not)\s+(?:log\s*in|sign\s*in|access\s+(?:my\s+)?account|complete\s+(?:the\s+)?payment|make\s+a\s+payment|pay)\b|\bpayment\s+(?:failed|failure|was\s+declined|not\s+processed)\b/i,
    },
    {
      id: 'crash_or_core_failure',
      score: 60,
      minimumLevel: 'CRITICAL',
      reason: 'an app crash or broken core function',
      pattern: /\b(?:app|application|game|site|website)?\s*(?:keeps?\s+)?crash(?:es|ed|ing)?\b|\b(?:core|main|basic)\s+(?:feature|functionality)\s+(?:is\s+)?(?:broken|not\s+working)\b|\b(?:doesn't|does\s+not|won't|will\s+not)\s+work\s+at\s+all\b/i,
    },
    {
      id: 'service_unavailable',
      score: 45,
      minimumLevel: 'HIGH',
      reason: 'a service that is unavailable',
      pattern: /\b(?:service|app|application|website|site|system)\s+(?:is\s+)?(?:completely\s+)?(?:down|unavailable)\b|\b(?:can't|cannot|unable\s+to)\s+use\s+(?:the\s+)?(?:app|service|website|site)\s+at\s+all\b/i,
    },
    {
      id: 'severe_persistent_performance',
      score: 45,
      minimumLevel: 'HIGH',
      reason: 'a persistent performance problem that makes normal use difficult',
      pattern: /\b(?:constantly|continually|always|every\s+time).{0,60}\b(?:fps|frame\s*rate|lag|stutter|slow)|\b(?:fps|frame\s*rate).{0,60}\b(?:impossible\s+to\s+play|unplayable|almost\s+impossible)\b/i,
    },
    {
      id: 'moderate_service_or_quality_issue',
      score: 25,
      reason: 'a service or quality issue that may need attention',
      pattern: /\b(?:could\s+be\s+cleaner|not\s+(?:very\s+)?clean|unclean|rude|not\s+approachable|late\s+delivery|arrived\s+late|poor\s+quality|defective|doesn't\s+work\s+well)\b/i,
    },
    {
      id: 'moderate_performance_or_functionality',
      score: 25,
      reason: 'a malfunction or moderate performance issue',
      pattern: /\b(?:numbers?|damage|healing|health|score|text|image|audio|video).{0,45}\b(?:not\s+showing|missing|not\s+displayed|not\s+working)|\b(?:bug|glitch|lag|fps\s+drop|slow)\b|\b(?:interface|controls?|navigation).{0,30}\b(?:confusing|hard\s+to\s+use|difficult\s+to\s+use)\b/i,
    },
    {
      id: 'general_negative_feedback',
      score: 8,
      reason: 'general negative feedback',
      pattern: /\b(?:bad\s+experience|disappoint(?:ed|ing)|not\s+happy|poor\s+experience)\b/i,
    },
  ],
};

const EMOTION_CATEGORY_BY_LABEL = {
  happy: 1,
  sad: 2,
  anger: 3,
  disgust: 4,
  fear: 5,
  sarcastic: 6,
};

function getEmotionCategory(review) {
  if (Number.isInteger(review?.category) && review.category >= 1 && review.category <= 6) {
    return review.category;
  }
  return EMOTION_CATEGORY_BY_LABEL[String(review?.emotion || '').toLowerCase()] || null;
}

function getTopicAssignments(topicAnalysis) {
  const assignmentsByReview = new Map();
  const results = Array.isArray(topicAnalysis?.results) ? topicAnalysis.results : [];

  results.forEach((result, resultIndex) => {
    const reviewIndex = Number.isInteger(result?.reviewIndex) ? result.reviewIndex : resultIndex;
    if (reviewIndex < 0 || !Array.isArray(result?.topics)) return;

    const assignments = new Map(assignmentsByReview.get(reviewIndex) || []);
    result.topics.forEach((topic) => {
      const label = typeof topic === 'string' ? topic : topic?.label;
      const score = typeof topic === 'string' ? null : topic?.score;
      if (!Object.hasOwn(PRIORITY_CONFIG.topicWeights, label) ||
        typeof score !== 'number' || score < PRIORITY_CONFIG.minimumTopicConfidence) return;
      assignments.set(label, Math.max(score, assignments.get(label) || 0));
    });
    assignmentsByReview.set(reviewIndex, assignments);
  });

  return assignmentsByReview;
}

function getTopicSignal(text, assignments) {
  const relevantTopics = [...assignments.entries()]
    .filter(([label]) => PRIORITY_CONFIG.topicRelevancePatterns[label]?.test(text))
    .sort((first, second) => PRIORITY_CONFIG.topicWeights[second[0]] - PRIORITY_CONFIG.topicWeights[first[0]]);
  const strongestTopic = relevantTopics[0];
  return strongestTopic
    ? { label: strongestTopic[0], confidence: strongestTopic[1], score: PRIORITY_CONFIG.topicWeights[strongestTopic[0]] }
    : null;
}

function getIssueSignal(text) {
  return PRIORITY_CONFIG.issueSignalRules.find((rule) => rule.pattern.test(text)) || null;
}

function isClearlyPositive(text) {
  const negatedPraise = /\b(?:not|never|hardly|barely|isn't|wasn't|don't|doesn't)\s+(?:(?:a|an|very|really|that|too|so)\s+){0,2}(?:perfect|excellent|great|fantastic|wonderful|helpful|love|recommend|enjoy|fun)\b/i;
  return PRIORITY_CONFIG.positiveReviewPattern.test(text) && !negatedPraise.test(text);
}

function getRatingScore(review) {
  const rawRating = typeof review === 'number' ? review : review?.rating;
  if (typeof rawRating !== 'number' && typeof rawRating !== 'string') return 0;
  const numericRating = Number.parseFloat(rawRating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) return 0;
  return PRIORITY_CONFIG.ratingScores[Math.round(numericRating)] || 0;
}

function getLevelRank(level) {
  return { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }[level] ?? 0;
}

function getMinimumLevel(scoreLevel, minimumLevel) {
  return getLevelRank(minimumLevel) > getLevelRank(scoreLevel) ? minimumLevel : scoreLevel;
}

function getPriorityLevel(score) {
  if (score >= PRIORITY_CONFIG.thresholds.critical) return 'CRITICAL';
  if (score >= PRIORITY_CONFIG.thresholds.high) return 'HIGH';
  if (score >= PRIORITY_CONFIG.thresholds.medium) return 'MEDIUM';
  return 'LOW';
}

export function calculateReviewPriorities(reviews, topicAnalysis = null) {
  const assignmentsByReview = getTopicAssignments(topicAnalysis);
  const assessments = reviews.map((review, reviewIndex) => {
    const topicResultIndex = Number.isInteger(review?.topicResultIndex)
      ? review.topicResultIndex
      : reviewIndex;
    const text = getReviewText(review);
    const severityRule = PRIORITY_CONFIG.severityRules.find((rule) => rule.pattern.test(text));
    const topicSignal = getTopicSignal(text, assignmentsByReview.get(topicResultIndex) || new Map());
    const issueSignal = getIssueSignal(text);
    const positive = isClearlyPositive(text) &&
      (severityRule?.score || 0) < PRIORITY_CONFIG.severeIssueThreshold;

    return {
      review,
      reviewIndex,
      text,
      severityRule,
      topicSignal,
      issueSignal,
      positive,
    };
  });

  const issueCounts = new Map();
  assessments.forEach((assessment) => {
    if (!assessment.positive && assessment.issueSignal) {
      issueCounts.set(assessment.issueSignal.id, (issueCounts.get(assessment.issueSignal.id) || 0) + 1);
    }
  });

  return assessments.map((assessment) => {
    const { review, reviewIndex, severityRule, topicSignal, issueSignal, positive } = assessment;
    const severity = severityRule?.score || 0;
    const emotionCategory = getEmotionCategory(review);
    const rating = getRatingScore(review);
    const repetitionCount = !positive && issueSignal ? issueCounts.get(issueSignal.id) || 0 : 0;
    const repetitionTier = PRIORITY_CONFIG.repetitionBonuses
      .filter(({ minimumReviews }) => repetitionCount >= minimumReviews)
      .at(-1);
    const minimumLevel = severityRule?.minimumLevel || null;
    const topic = positive ? 0 : Math.min(PRIORITY_CONFIG.maxTopicScore, topicSignal?.score || 0);
    const emotion = positive || emotionCategory == null
      ? 0
      : PRIORITY_CONFIG.emotionScores[emotionCategory] || 0;
    const repetition = positive ? 0 : Math.min(
      PRIORITY_CONFIG.maxRepetitionScore,
      repetitionTier?.score || 0,
    );
    const ratingScore = positive ? 0 : rating;
    const factors = { severity, emotion, topic, repetition, rating: ratingScore };
    const score = Math.max(0, Math.min(100, Object.values(factors).reduce((total, value) => total + value, 0)));
    const thresholdLevel = getPriorityLevel(score);
    const level = positive
      ? 'LOW'
      : minimumLevel
        ? getMinimumLevel(thresholdLevel, minimumLevel)
        : thresholdLevel;
    const signals = [];
    if (severityRule) signals.push({ type: 'severity', id: severityRule.id, reason: severityRule.reason });
    if (emotionCategory != null && !positive) signals.push({ type: 'emotion', category: emotionCategory });
    if (topicSignal && !positive) {
      signals.push({ type: 'topic', label: topicSignal.label, confidence: topicSignal.confidence });
    }
    if (repetitionCount >= 2 && issueSignal && !positive) {
      signals.push({ type: 'repetition', issue: issueSignal.id, reviewCount: repetitionCount });
    }
    if (ratingScore > 0) signals.push({ type: 'rating', value: review?.rating, score: ratingScore });
    if (positive) signals.push({ type: 'positive_guard', reason: 'Positive feedback without a severe incident' });

    const reasons = [];
    if (positive) {
      reasons.push('positive review');
      reasons.push('no severe incident detected');
      reasons.push('lower-level signals did not raise urgency');
    } else {
      if (severityRule) reasons.push(severityRule.reason);
      if (topicSignal) reasons.push(`relevant ${topicSignal.label.toLowerCase()} topic`);
      if (repetitionCount >= 2 && issueSignal) {
        reasons.push(`the same ${issueSignal.id.replaceAll('_', ' ')} issue appears in ${repetitionCount} reviews`);
      }
      if (ratingScore > 0) reasons.push(`${review.rating}-star rating`);
      if (reasons.length === 0) reasons.push('no strong actionable issue detected');
    }

    return {
      reviewIndex,
      score,
      level,
      factors,
      signals,
      explanation: `${level[0]}${level.slice(1).toLowerCase()} priority: ${reasons.join('; ')}.`,
    };
  });
}

export function attachReviewPriorities(reviews, topicAnalysis = null) {
  const priorities = calculateReviewPriorities(reviews, topicAnalysis);
  return reviews.map((review, index) => ({ ...review, priority: priorities[index] }));
}

function getReviewTimestamp(review) {
  const dateValue = typeof review === 'string'
    ? review
    : review?.date || review?.reviewDate || review?.posted || review?.createdAt || '';
  if (!dateValue) return null;

  const parsed = Date.parse(dateValue);
  if (Number.isFinite(parsed)) return parsed;

  const normalized = String(dateValue).trim().toLowerCase();
  if (normalized === 'today') return Date.now();
  if (normalized === 'yesterday') return Date.now() - 24 * 60 * 60 * 1000;
  const relative = normalized.match(/^(?:posted\s+)?(a|an|\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (!relative) return null;

  const amount = relative[1] === 'a' || relative[1] === 'an' ? 1 : Number(relative[1]);
  const unitMilliseconds = {
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  }[relative[2]];
  return Date.now() - amount * unitMilliseconds;
}

export function sortPriorityReviews(entries, sortMode = 'priority') {
  const priorityRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return [...entries].sort((first, second) => {
    if (sortMode === 'newest' || sortMode === 'oldest') {
      const firstDate = getReviewTimestamp(first.sourceReview || first.quote);
      const secondDate = getReviewTimestamp(second.sourceReview || second.quote);
      if (firstDate == null && secondDate != null) return 1;
      if (firstDate != null && secondDate == null) return -1;
      if (firstDate != null && secondDate != null && firstDate !== secondDate) {
        return sortMode === 'newest' ? secondDate - firstDate : firstDate - secondDate;
      }
      return first.originalIndex - second.originalIndex;
    }

    const firstRank = priorityRank[first.priority?.level] ?? priorityRank.LOW;
    const secondRank = priorityRank[second.priority?.level] ?? priorityRank.LOW;
    return firstRank - secondRank ||
      (second.priority?.score || 0) - (first.priority?.score || 0) ||
      first.originalIndex - second.originalIndex;
  });
}