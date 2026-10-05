import { getReviewText } from './reviewTopics.js';

export const PRIORITY_CONFIG = {
  severityOrder: ['NONE', 'MINOR', 'MAJOR', 'CRITICAL'],
  basePriorityBySeverity: {
    NONE: 'LOW',
    MINOR: 'LOW',
    MAJOR: 'MEDIUM',
    CRITICAL: 'HIGH',
  },
  priorityOrder: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  criticalIssuePatterns: [
    { id: 'duplicate_charge', severity: 'CRITICAL', reason: 'duplicate charge', pattern: /\b(?:charged?\s+(?:me\s+)?twice|double[-\s]?charged|duplicate\s+charge|charged\s+for\s+the\s+same\s+(?:purchase|order)|na[-\s]?double\s+charge(?:d)?)\b/i },
    { id: 'financial_loss_or_fraud', severity: 'CRITICAL', reason: 'financial loss, fraud, or scam', pattern: /\b(?:financial\s+loss|lost\s+money|fraud|scam|unauthori[sz]ed\s+charge)\b/i },
    { id: 'data_or_security', severity: 'CRITICAL', reason: 'serious data, security, or privacy issue', pattern: /\b(?:data\s+breach|data\s+leak|data\s+loss|lost\s+all\s+(?:my\s+)?data|private\s+(?:data|information)\s+(?:leaked|exposed)|account\s+hacked|unauthori[sz]ed\s+access)\b/i },
    { id: 'missing_or_stolen_item', severity: 'CRITICAL', reason: 'missing or stolen item', pattern: /\b(?:phone|wallet|item|package|parcel|order|bag|luggage|belongings|device).{0,80}\b(?:stolen|missing|disappeared|never\s+arrived)\b|\b(?:stolen|missing|disappeared)\b.{0,80}\b(?:phone|wallet|item|package|parcel|order|bag|luggage|belongings|device)\b/i },
    { id: 'safety_issue', severity: 'CRITICAL', reason: 'safety issue', pattern: /\b(?:unsafe|safety\s+concern|injur(?:y|ed)|assault(?:ed)?|electric\s+shock|fire\s+hazard)\b/i },
    { id: 'login_failure', severity: 'CRITICAL', reason: 'unable to access an account', pattern: /\b(?:can't|cannot|unable\s+to|failed\s+to|won't|will\s+not|doesn't|does\s+not)\s+(?:log\s*in|sign\s*in|access\s+(?:my\s+)?account)\b|\b(?:hindi|di)\s+(?:ako\s+)?makapasok\b.{0,35}\b(?:account|akun|profile)\b/i },
    { id: 'payment_failure', severity: 'CRITICAL', reason: 'payment failure', pattern: /\bpayment\s+(?:failed|failure|was\s+declined|not\s+processed)\b|\b(?:can't|cannot|unable\s+to)\s+(?:pay|complete\s+(?:the\s+)?payment)\b/i },
    { id: 'repeated_app_crash', severity: 'CRITICAL', reason: 'repeated app crashes', pattern: /\b(?:app|application|game|system|site|website)\b.{0,55}\b(?:keeps?|constantly|repeatedly|every\s+time|always)\b.{0,35}\bcrash(?:es|ed|ing)?\b|\b(?:app|application|game|system|site|website)\b.{0,55}\bcrash(?:es|ed|ing)?\b.{0,35}\b(?:every\s+time|constantly|repeatedly|always)\b|\brepeated\s+(?:app|application|game)\s+crashes?\b/i },
    { id: 'core_unavailable', severity: 'CRITICAL', reason: 'core functionality completely unavailable', pattern: /\b(?:core|main|basic)\s+(?:feature|functionality)\s+(?:is\s+)?(?:broken|not\s+working|unavailable)\b|\b(?:app|application|service|website|site|system)\s+(?:is\s+)?(?:completely\s+)?(?:down|unavailable)\b|\b(?:can't|cannot|unable\s+to)\s+use\s+(?:the\s+)?(?:app|service|website|site)\s+at\s+all\b/i },
  ],
  majorIssuePatterns: [
    { id: 'severe_persistent_performance', severity: 'MAJOR', reason: 'persistent severe performance problem', pattern: /\b(?:constantly|continually|always|every\s+time|keeps?)\b.{0,60}\b(?:fps|frame\s*rate|lag|stutter|slow)\b|\b(?:fps|frame\s*rate)\b.{0,60}\b(?:drops?|dropping|stutter(?:s|ing)?|almost\s+impossible\s+to\s+play|unplayable)\b/i },
    { id: 'major_malfunction', severity: 'MAJOR', reason: 'major functionality malfunction', pattern: /\b(?:major|core|main)\s+(?:feature|functionality|function)\b.{0,35}\b(?:broken|malfunction(?:s|ing)?|not\s+working)\b|\b(?:broken|malfunction(?:s|ing)?)\b.{0,35}\b(?:app|application|game|feature|functionality)\b/i },
    { id: 'serious_service_failure', severity: 'MAJOR', reason: 'serious service or delivery failure', pattern: /\b(?:service|delivery|order)\b.{0,45}\b(?:failed|failure|severely\s+delayed|never\s+arrived|wrong\s+(?:item|order))\b|\b(?:wrong\s+(?:item|order)|severely\s+delayed)\b.{0,45}\b(?:delivery|order|transaction)\b/i },
    { id: 'major_incorrect_result', severity: 'MAJOR', reason: 'major incorrect transaction or result', pattern: /\b(?:incorrect|wrong|inaccurate)\s+(?:transaction|result|calculation|charge|order)\b|\b(?:transaction|result|calculation)\b.{0,35}\b(?:incorrect|wrong|inaccurate)\b/i },
    { id: 'repeated_unresolved_issue', severity: 'MAJOR', reason: 'repeated unresolved issue', pattern: /\b(?:reported|contacted\s+support|tried\s+to\s+fix)\b.{0,55}\b(?:still\s+not\s+fixed|keeps?\s+happening|unresolved|same\s+issue)\b/i },
  ],
  minorIssuePatterns: [
    { id: 'minor_performance', severity: 'MINOR', reason: 'slight or occasional slowness', pattern: /\b(?:occasionally|sometimes|once\s+in\s+a\s+while|a\s+little|slightly)\b.{0,35}\b(?:slow|laggy|lag|sluggish)\b|\b(?:slow|laggy|sluggish)\b.{0,30}\b(?:occasionally|sometimes|once\s+in\s+a\s+while)\b|\b(?:app|game|site|service)\b.{0,30}\b(?:slow|laggy|sluggish)\b|\b(?:slow|laggy|sluggish)\b.{0,30}\b(?:app|game|site|service)\b|\bmabagal\b.{0,25}\b(?:minsan|lang)\b|\bminsan\b.{0,25}\bmabagal\b/i },
    { id: 'minor_malfunction', severity: 'MINOR', reason: 'minor malfunction', pattern: /\b(?:bug|glitch|minor\s+malfunction|small\s+bug|not\s+working\s+well)\b/i },
    { id: 'usability_problem', severity: 'MINOR', reason: 'usability problem', pattern: /\b(?:interface|menu|navigation|controls?)\b.{0,35}\b(?:confusing|hard\s+to\s+use|difficult\s+to\s+use)\b|\b(?:confusing|hard\s+to\s+use|difficult\s+to\s+use)\b.{0,35}\b(?:interface|menu|navigation|controls?)\b/i },
    { id: 'small_quality_issue', severity: 'MINOR', reason: 'small quality or convenience issue', pattern: /\b(?:could\s+be\s+cleaner|not\s+(?:very\s+)?clean|unclean|rude|late\s+delivery|arrived\s+late|poor\s+quality|defective|inconvenient|minor\s+issue)\b/i },
  ],
  positiveReviewPattern: /\b(?:perfect|excellent|love(?:d|s)?|great|fantastic|wonderful|very\s+helpful|highly\s+recommend|enjoy(?:ed|ing)?|so\s+fun|works?\s+great)\b/i,
  topicRelevancePatterns: {
    Quality: /\b(?:quality|clean|cleaner|dirty|defect|broken|damag(?:e|ed))\b/i,
    'Performance / Functionality': /\b(?:crash|bug|glitch|lag|slow|fps|stutter|function|working)\b/i,
    'Service / Support': /\b(?:staff|support|service|rude|assistance)\b/i,
    'Delivery / Transaction': /\b(?:delivery|order|payment|charged|refund|transaction|purchase)\b/i,
    'Usability / Experience': /\b(?:interface|confusing|navigation|controls?|usability)\b/i,
    'Availability / Accessibility': /\b(?:log\s*in|sign\s*in|access|unavailable)\b/i,
  },
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
  if (Number.isInteger(review?.category) && review.category >= 1 && review.category <= 6) return review.category;
  return EMOTION_CATEGORY_BY_LABEL[String(review?.emotion || '').toLowerCase()] || null;
}

function findUnnegatedMatch(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  for (const match of text.matchAll(globalPattern)) {
    const precedingText = text.slice(Math.max(0, match.index - 45), match.index);
    if (!/(?:\b(?:doesn't|does not|didn't|did not|never|not|no|without|walang|hindi|di)\b(?:\s+[\w'-]+){0,3}\s*)$/i.test(precedingText)) {
      return match;
    }
  }
  return null;
}

function findSeverityRule(text) {
  const rules = [
    ...PRIORITY_CONFIG.criticalIssuePatterns,
    ...PRIORITY_CONFIG.majorIssuePatterns,
    ...PRIORITY_CONFIG.minorIssuePatterns,
  ];
  for (const rule of rules) {
    const match = findUnnegatedMatch(text, rule.pattern);
    if (match) return { ...rule, match: match[0] };
  }
  return null;
}

function getTopicAssignments(topicAnalysis) {
  const assignmentsByReview = new Map();
  const results = Array.isArray(topicAnalysis?.results) ? topicAnalysis.results : [];
  results.forEach((result, resultIndex) => {
    const reviewIndex = Number.isInteger(result?.reviewIndex) ? result.reviewIndex : resultIndex;
    if (reviewIndex < 0 || !Array.isArray(result?.topics)) return;
    assignmentsByReview.set(reviewIndex, new Set(result.topics.map((topic) => (
      typeof topic === 'string' ? topic : topic?.label
    )).filter((label) => typeof label === 'string')));
  });
  return assignmentsByReview;
}

function getTopicContext(text, labels) {
  return [...labels].find((label) => PRIORITY_CONFIG.topicRelevancePatterns[label]?.test(text)) || null;
}

function isClearlyPositive(text) {
  const negatedPraise = /\b(?:not|never|hardly|barely|isn't|wasn't|don't|doesn't|didn't)\s+(?:(?:a|an|very|really|that|too|so)\s+){0,2}(?:perfect|excellent|great|fantastic|wonderful|helpful|love|recommend|enjoy|fun)\b/i;
  return PRIORITY_CONFIG.positiveReviewPattern.test(text) && !negatedPraise.test(text);
}

function getRatingSupport(review) {
  const value = review?.rating;
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const rating = Number.parseFloat(value);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return 0;
  const roundedRating = Math.round(rating);
  return roundedRating === 1 ? 2 : roundedRating === 2 ? 1 : 0;
}

function getEngagementCount(review) {
  const candidates = [
    review?.helpfulCount, review?.helpfulVotes, review?.likes, review?.likeCount,
    review?.upvotes, review?.upvoteCount, review?.votes_up,
  ];
  const count = candidates.find((value) => value !== null && value !== undefined && value !== '');
  if (typeof count !== 'number' && typeof count !== 'string') return null;
  const numericCount = Number(count);
  return Number.isFinite(numericCount) && numericCount >= 0 ? numericCount : null;
}

function getPriorityRank(priority) {
  return PRIORITY_CONFIG.priorityOrder.indexOf(priority);
}

export function calculateReviewPriorities(reviews, topicAnalysis = null) {
  const assignmentsByReview = getTopicAssignments(topicAnalysis);
  const assessments = reviews.map((review, reviewIndex) => {
    const text = getReviewText(review);
    const rule = findSeverityRule(text);
    return {
      review,
      reviewIndex,
      text,
      rule,
      topicContext: rule
        ? getTopicContext(text, assignmentsByReview.get(review?.topicResultIndex ?? reviewIndex) || new Set())
        : null,
    };
  });

  const issueCounts = new Map();
  assessments.forEach(({ rule }) => {
    if (rule) issueCounts.set(rule.id, (issueCounts.get(rule.id) || 0) + 1);
  });

  return assessments.map(({ review, reviewIndex, text, rule, topicContext }) => {
    const severity = rule?.severity || 'NONE';
    const basePriority = PRIORITY_CONFIG.basePriorityBySeverity[severity];
    const emotionCategory = getEmotionCategory(review);
    const hasIssue = severity !== 'NONE';
    const emotionSupport = hasIssue && emotionCategory != null && emotionCategory !== 1 ? 1 : 0;
    const repetitionCount = rule ? issueCounts.get(rule.id) || 0 : 0;
    const repetition = hasIssue && repetitionCount >= 2 ? 1 : 0;
    const engagementCount = getEngagementCount(review);
    const engagement = hasIssue && engagementCount !== null && engagementCount >= 10
      ? 2
      : hasIssue && engagementCount !== null && engagementCount >= 3 ? 1 : 0;
    const rating = hasIssue ? getRatingSupport(review) : 0;
    const supports = [];
    const signals = [];

    if (rule) signals.push({ type: 'severity', id: rule.id, severity, reason: rule.reason });
    if (emotionSupport) {
      const emotion = Object.keys(EMOTION_CATEGORY_BY_LABEL).find((label) => EMOTION_CATEGORY_BY_LABEL[label] === emotionCategory);
      supports.push(`${emotion[0].toUpperCase()}${emotion.slice(1)} emotion`);
      signals.push({ type: 'emotion', category: emotionCategory });
    }
    if (repetition) {
      supports.push(`Similar issue reported repeatedly (${repetitionCount} reviews)`);
      signals.push({ type: 'repetition', issue: rule.id, reviewCount: repetitionCount });
    }
    if (engagement) {
      const engagementDescription = engagementCount >= 10 ? 'High helpful-vote count' : 'Helpful-vote support';
      supports.push(`${engagementDescription} (${engagementCount})`);
      signals.push({ type: 'engagement', count: engagementCount });
    }
    if (rating) {
      supports.push(`${Math.round(Number(review.rating))}-star rating`);
      signals.push({ type: 'rating', value: review.rating, score: rating });
    }
    if (topicContext) signals.push({ type: 'topic_context', label: topicContext });

    const supportScore = emotionSupport + repetition + engagement + rating;
    const baseRank = getPriorityRank(basePriority);
    const level = hasIssue && supportScore > 0
      ? PRIORITY_CONFIG.priorityOrder[Math.min(baseRank + 1, PRIORITY_CONFIG.priorityOrder.length - 1)]
      : basePriority;
    const severityRank = PRIORITY_CONFIG.severityOrder.indexOf(severity);
    const factors = {
      severity: severityRank,
      emotion: emotionSupport,
      topic: 0,
      repetition,
      engagement,
      rating,
    };
    const score = getPriorityRank(level) * 100 + severityRank * 10 + supportScore;
    const positive = !hasIssue && isClearlyPositive(text);
    if (positive) signals.push({ type: 'positive_guard', reason: 'Positive feedback with no actionable issue' });

    let explanation;
    if (!hasIssue) {
      explanation = positive
        ? 'LOW: positive review with no actionable issue detected.'
        : 'LOW: no actionable issue detected.';
    } else {
      const context = topicContext ? ` (${topicContext.toLowerCase()} context)` : '';
      const supportText = supports.length ? ` with ${supports.join(', ')}` : '';
      explanation = `${level}: ${rule.reason}${context}${supportText}.`;
    }

    return {
      reviewIndex,
      severity,
      score,
      level,
      factors,
      supportingFactors: supports,
      signals,
      explanation,
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