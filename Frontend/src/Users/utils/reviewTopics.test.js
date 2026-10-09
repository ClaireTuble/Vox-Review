import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  aggregateTopicsForReviews,
  getMeaningfulKeywords,
  getTopicKeywordDiagnostics,
  getReviewKeywordPhrases,
  getReviewText,
  getTopicKeywordCandidates,
} from './reviewTopics.js';

const DELIVERY = 'Delivery / Transaction';
const ALL_TOPIC_LABELS = [
  'Quality', 'Performance / Functionality', 'Features / Content',
  'Service / Support', DELIVERY, 'Price / Value', 'Usability / Experience',
  'Accuracy / Expectations', 'Availability / Accessibility', 'Environment / Location',
  'Other / General',
];

const entries = [
  { review: { text: 'combat review' }, category: 1, topicResultIndex: 0 },
  { review: { text: 'delivery review' }, category: 1, topicResultIndex: 1 },
  { review: { text: 'performance review' }, category: 2, topicResultIndex: 2 },
  { review: { text: 'duplicate row' }, category: 1, topicResultIndex: 1 },
];

const analysis = {
  results: [
    { reviewIndex: 0, topics: [{ label: 'Performance / Functionality', score: 0.9 }] },
    { reviewIndex: 1, topics: [{ label: DELIVERY, score: 0.8 }, { label: DELIVERY, score: 0.7 }] },
    { reviewIndex: 2, topics: [{ label: DELIVERY, score: 0.85 }] },
  ],
};

function getCandidates(review, label = 'Quality') {
  return getTopicKeywordCandidates(
    [{ review, topicResultIndex: 0 }],
    { results: [{ reviewIndex: 0, topics: [{ label, score: 0.8 }] }] },
  );
}

function makeTopicScores(topic, score, otherScore = 0.2) {
  return Object.fromEntries(ALL_TOPIC_LABELS.map((label) => [
    label,
    label === topic ? score : otherScore,
  ]));
}

test('extracts text from the existing Shopee and Lazada review object fields', () => {
  assert.equal(getReviewText({ text: 'Shopee review body', review: 'duplicate alias' }), 'Shopee review body');
  assert.equal(getReviewText({ text: 'Lazada review body', review: 'Lazada review body' }), 'Lazada review body');
});

test('accepts existing alternate review body aliases and ignores non-string fields', () => {
  assert.equal(getReviewText({ text: { value: 'not text' }, content: 'Review content' }), 'Review content');
  assert.equal(getReviewText({ body: 'Review body' }), 'Review body');
  assert.equal(getReviewText({ reviewBody: 'Review body field' }), 'Review body field');
  assert.equal(getReviewText({ text: '  ', review: null }), '');
});

test('counts unique review indexes once and shows only evidence assigned that topic', () => {
  const topic = aggregateTopicsForReviews(entries, analysis).find((item) => item.label === DELIVERY);

  assert.equal(topic.count, 2);
  assert.equal(topic.percentage, 66.7);
  assert.deepEqual(topic.reviews, ['delivery review', 'performance review']);
});

test('selected emotion scopes counts, percentages, and representative evidence', () => {
  const topic = aggregateTopicsForReviews(entries, analysis, 1).find((item) => item.label === DELIVERY);

  assert.equal(topic.count, 1);
  assert.equal(topic.percentage, 50);
  assert.deepEqual(topic.reviews, ['delivery review']);
});

test('does not align topic evidence to a different explicit review index', () => {
  const mismatchedAnalysis = {
    results: [
      { reviewIndex: 2, topics: [{ label: DELIVERY, score: 0.9 }] },
    ],
  };
  const topic = aggregateTopicsForReviews(
    [{ review: { text: 'misaligned' }, category: 1, topicResultIndex: 0 }],
    mismatchedAnalysis,
  ).find((item) => item.label === DELIVERY);

  assert.equal(topic.count, 0);
  assert.deepEqual(topic.reviews, []);
});

test('empty topic assignments preserve review coverage without inventing a category', () => {
  const topics = aggregateTopicsForReviews(
    [{ review: { text: 'A review with no detected topics' }, topicResultIndex: 0 }],
    { results: [{ reviewIndex: 0, topics: [] }] },
  );

  assert.equal(topics.length, 11);
  assert.ok(topics.every((topic) => topic.count === 0));
});

test('topic keywords preserve meaningful source phrases and hyphenation', () => {
  const review = 'This table is quite practical. The dark wood grain tabletop looks high-quality, and the metal legs are very sturdy. Assembly is simple; one person can easily assemble it.';
  const keywords = getCandidates({ text: review });

  for (const expected of ['table', 'practical', 'dark wood grain', 'high-quality', 'metal legs', 'sturdy']) {
    assert.ok(keywords.includes(expected), `missing keyword: ${expected}`);
  }
  assert.ok(!keywords.includes('tablequitepracticaldarkwoodgrain'));
  assert.ok(keywords.every((keyword) => review.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())));
  const joinedKeywords = keywords.join(' ');
  assert.ok(joinedKeywords.toLocaleLowerCase().includes('dark wood grain'));
  assert.equal(
    joinedKeywords.split(/\s+/).length,
    keywords.reduce((wordCount, keyword) => wordCount + keyword.trim().split(/\s+/).length, 0),
  );
});

test('topic keywords replace adjacent HTML and BBCode tags with word boundaries', () => {
  const review = '[h1]Hunting and gathering[hr]story everything like all Sky Breaker and Secrets of the Spires[list][\\*]able to explore Pandora[/list]another way to deal[/h1]';
  const keywords = getCandidates(review);
  const normalizedKeywords = keywords.map((keyword) => keyword.toLocaleLowerCase());

  assert.ok(normalizedKeywords.includes('hunting and gathering'));
  assert.ok(normalizedKeywords.includes('story'));
  assert.ok(normalizedKeywords.some((keyword) => keyword.includes('sky breaker')));
  assert.ok(normalizedKeywords.some((keyword) => keyword.includes('pandora')));
  assert.ok(!normalizedKeywords.some((keyword) => /^(?:h1|hr|list|\*)$/.test(keyword)));
  assert.ok(!normalizedKeywords.some((keyword) => /gatheringstory|storyeverything|secretsable/.test(keyword)));
});

test('topic keywords decode HTML entities before extracting phrases', () => {
  const keywords = getCandidates(
    'Hunting&nbsp;and&#32;gathering; quality &amp; workmanship.',
  );
  const normalizedKeywords = keywords.map((keyword) => keyword.toLocaleLowerCase());

  assert.ok(normalizedKeywords.includes('hunting and gathering'));
  assert.ok(!normalizedKeywords.some((keyword) => keyword.includes('amp')));
});

test('topic keywords preserve bracketed text that is not recognized markup', () => {
  const keywords = getCandidates('[DLC] adds a new area to explore.');

  assert.ok(keywords.some((keyword) => keyword.toLocaleLowerCase().includes('dlc')));
});

test('topic keyword candidates retain source phrases for later semantic ranking', () => {
  const review = 'The dark wood grain tabletop looks high-quality, and the metal legs are very sturdy.';

  const candidates = getCandidates(review);
  for (const expected of ['dark wood grain', 'metal legs', 'high-quality', 'sturdy', 'tabletop']) {
    assert.ok(candidates.includes(expected), `missing candidate: ${expected}`);
  }
});

test('topic keywords omit URLs and numbers', () => {
  const review = 'High-quality metal legs; details at https://example.com/review?item=123, quantity 123.';
  const keywords = getCandidates(review);

  assert.ok(keywords.includes('High-quality metal') || keywords.includes('High-quality') || keywords.includes('metal legs'));
  assert.ok(!keywords.some((keyword) => /https?|example|\d/.test(keyword)));
});

test('topic keywords are extracted from the whole review, not its first sentence', () => {
  const review = 'I bought and used the product. Dark wood grain looks practical and sturdy.';
  const keywords = getCandidates(review);

  assert.ok(keywords.some((keyword) => keyword.toLocaleLowerCase() === 'dark wood grain'));
  assert.ok(keywords.some((keyword) => keyword.toLocaleLowerCase().includes('practical')));
  assert.ok(!keywords.some((keyword) => ['bought', 'used', 'product'].includes(keyword.toLocaleLowerCase())));
});

test('topic keywords preserve Taglish and English evidence', () => {
  const review = 'Ang ganda ng customer service, pero delivery time: matagal talaga. Gumana rin ang app.';
  const keywords = getCandidates(review);

  assert.ok(keywords.includes('ganda'));
  assert.ok(keywords.includes('customer service'));
  assert.ok(keywords.includes('delivery time'));
  assert.ok(keywords.includes('matagal'));
  assert.ok(keywords.every((keyword) => review.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())));
});

test('topic keywords filter auxiliary and generic action verbs', () => {
  const review = 'The desk has have had a sturdy frame, is are was were secure, and got made used with care.';
  const keywords = getCandidates(review);
  const forbidden = new Set(['has', 'have', 'had', 'is', 'are', 'was', 'were', 'got', 'made', 'used']);

  assert.ok(keywords.some((keyword) => keyword.toLocaleLowerCase().includes('sturdy')));
  assert.ok(!keywords.some((keyword) => forbidden.has(keyword.toLocaleLowerCase())));
});

test('AnalysisResults renders keyword tags without explicit bullet separators', () => {
  const componentSource = readFileSync(new URL('../components/AnalysisResults.jsx', import.meta.url), 'utf8');

  assert.doesNotMatch(componentSource, /<span className="keyword-separator"/);
  assert.match(componentSource, /<span key=\{keyword\} className="keyword-tag">\{keyword\}<\/span>/);
});

test('one multi-topic review gets different keywords for Quality, Service, and Delivery', () => {
  const review = 'The logistics were excellent, with door-to-door delivery and installation included. Customer service was patient. The computer desk has a simple and elegant design, fine workmanship, thick materials, no odor, and is easy to assemble, sturdy and secure.';
  const labels = ['Quality', 'Service / Support', DELIVERY];
  const reviews = [{ review, topicResultIndex: 0 }];
  const topicAnalysis = {
    results: [{ reviewIndex: 0, topics: labels.map((label) => ({ label, score: 0.8 })) }],
  };
  const expectedByTopic = {
    Quality: ['fine workmanship', 'thick materials', 'no odor', 'elegant design', 'sturdy and secure'],
    'Service / Support': ['customer service', 'patient'],
    [DELIVERY]: ['delivery', 'door-to-door delivery', 'door-to-door'],
  };
  const candidates = getTopicKeywordCandidates(reviews, topicAnalysis);
  topicAnalysis.keywordScores = Object.fromEntries(candidates.map((candidate) => [
    candidate.toLocaleLowerCase(),
    Object.fromEntries(ALL_TOPIC_LABELS.map((label) => [
      label,
      labels.includes(label) && expectedByTopic[label].includes(candidate.toLocaleLowerCase())
        ? 0.85
        : 0.2,
    ])),
  ]));
  const originalAssignments = structuredClone(topicAnalysis.results);
  const topics = aggregateTopicsForReviews(reviews, topicAnalysis);
  const quality = topics.find((topic) => topic.label === 'Quality');
  const service = topics.find((topic) => topic.label === 'Service / Support');
  const delivery = topics.find((topic) => topic.label === DELIVERY);
  const qualityKeywords = quality.keywords.map((keyword) => keyword.toLocaleLowerCase());
  const serviceKeywords = service.keywords.map((keyword) => keyword.toLocaleLowerCase());
  const deliveryKeywords = delivery.keywords.map((keyword) => keyword.toLocaleLowerCase());

  assert.equal(quality.count, 1);
  assert.ok(qualityKeywords.includes('fine workmanship'));
  assert.ok(qualityKeywords.includes('thick materials'));
  assert.ok(qualityKeywords.includes('no odor'));
  assert.ok(qualityKeywords.some((keyword) => keyword.includes('elegant design')));
  assert.ok(qualityKeywords.includes('sturdy and secure'));
  assert.ok(!qualityKeywords.some((keyword) => /delivery|customer service|installation/.test(keyword)));
  assert.ok(serviceKeywords.includes('customer service'));
  assert.ok(!serviceKeywords.some((keyword) => /fine workmanship|thick materials|no odor/.test(keyword)));
  assert.deepEqual(deliveryKeywords, ['door-to-door delivery']);
  assert.notDeepEqual(qualityKeywords, serviceKeywords);
  assert.notDeepEqual(qualityKeywords, deliveryKeywords);
  assert.deepEqual(topicAnalysis.results, originalAssignments);
});

test('topic keywords require candidate-level semantic relevance and remain source-grounded', () => {
  const review = 'The customer support team never replied to my refund request.';
  const entries = [{ review, topicResultIndex: 0 }];
  const topicAnalysis = {
    results: [{
      reviewIndex: 0,
      topics: [{ label: 'Service / Support', score: 0.8 }],
    }],
    keywordScores: {
      'customer support': makeTopicScores('Service / Support', 0.88),
      'never replied': makeTopicScores('Service / Support', 0.84),
      'refund request': makeTopicScores('Service / Support', 0.82),
      customer: makeTopicScores('Service / Support', 0.89),
      team: makeTopicScores('Service / Support', 0.83),
    },
  };

  const keywords = getMeaningfulKeywords(entries, 'Service / Support', topicAnalysis);
  assert.deepEqual(keywords, ['customer support', 'never replied', 'refund request']);
  assert.ok(keywords.every((keyword) => review.toLocaleLowerCase().includes(keyword)));
});

test('long review diagnostics report sanitized score rejection counts and metadata', () => {
  const review = 'The logistics were excellent, with door-to-door delivery and installation included. Customer service was patient. The computer desk has a simple and elegant design, fine workmanship, thick materials, no odor, and is easy to assemble, sturdy and secure.';
  const entries = [{ review, topicResultIndex: 0 }];
  const labels = [
    'Quality', 'Performance / Functionality', 'Features / Content',
    'Service / Support', DELIVERY, 'Price / Value',
    'Usability / Experience', 'Accuracy / Expectations',
    'Availability / Accessibility', 'Environment / Location', 'Other / General',
  ];
  const topicAnalysis = {
    results: [{
      reviewIndex: 0,
      topics: ['Quality', 'Service / Support', DELIVERY].map((label) => ({ label, score: 0.8 })),
    }],
  };
  const candidates = getTopicKeywordCandidates(entries, topicAnalysis);
  topicAnalysis.keywordScores = Object.fromEntries(candidates.map((candidate) => [
    candidate.toLocaleLowerCase(),
    Object.fromEntries(labels.map((label) => [label, label === 'Quality' ? 0.76 : 0.74])),
  ]));
  topicAnalysis.keywordScores['fine workmanship'].Quality = 0.82;
  topicAnalysis.keywordScores['fine workmanship']['Service / Support'] = 0.79;
  topicAnalysis.keywordScores['thick materials'].Quality = 0.74;
  topicAnalysis.keywordScores['thick materials']['Service / Support'] = 0.72;
  topicAnalysis.keywordScores['no odor'].Quality = 0.8;
  topicAnalysis.keywordScores['no odor']['Service / Support'] = 0.9;

  const diagnostics = getTopicKeywordDiagnostics(entries, 'Quality', topicAnalysis);
  const reasonCounts = Object.groupBy(
    diagnostics.rejectedCandidates,
    (candidate) => candidate.rejectionReason,
  );
  const serialized = JSON.stringify(diagnostics);

  assert.equal(diagnostics.candidateOccurrenceCount, candidates.length);
  assert.equal(diagnostics.uniqueCandidateCount, candidates.length);
  assert.equal(diagnostics.scoredCandidateOccurrenceCount, candidates.length);
  assert.equal(diagnostics.relevancePassingCandidateCount, candidates.length - 2);
  assert.ok(diagnostics.relevanceScoreSummary.minimum >= 0.74);
  assert.ok(reasonCounts.below_minimum_relevance?.length >= 1);
  assert.ok(reasonCounts.competing_topic_too_close?.length >= 1);
  assert.ok(reasonCounts.overlapped_by_longer_relevant_phrase?.length >= 1);
  assert.ok(diagnostics.rejectedCandidates.every((candidate) => (
    Number.isInteger(candidate.reviewIndex) &&
    candidate.selectedTopicLabel === 'Quality' &&
    Number.isInteger(candidate.candidateTokenCount) &&
    Number.isInteger(candidate.candidateCharacterLength) &&
    typeof candidate.rejectionReason === 'string'
  )));
  assert.doesNotMatch(serialized, /logistics|fine workmanship|thick materials|no odor/);
});

test('topic keyword candidates preserve action phrases and omit generic function words', () => {
  const review = 'The game keeps crashing after the latest update.';
  const candidates = getCandidates(review, 'Performance / Functionality');
  assert.ok(candidates.includes('keeps crashing'));
  assert.ok(candidates.includes('crashing'));
  assert.ok(candidates.includes('latest update'));
  assert.ok(!candidates.includes('the'));
  assert.ok(!candidates.includes('after'));
  assert.ok(!candidates.includes('keeps'));
});

test('topic candidates include meaningful source phrases with natural function words', () => {
  const review = 'Almost perfect. Server issues persist. Huge update keeps crashing. Support never replied. Not worth it.';
  const phrases = getReviewKeywordPhrases(review).map((phrase) => phrase.toLocaleLowerCase());

  for (const expected of [
    'almost perfect',
    'server issues',
    'huge update',
    'keeps crashing',
    'never replied',
    'not worth it',
  ]) {
    assert.ok(phrases.includes(expected), `missing phrase: ${expected}`);
  }
  assert.ok(!phrases.includes('the'));
});

test('selected topic keywords score meaningful phrases from the long review for their assigned topics', () => {
  const review = `Been playing this game for almost a year now, and I could say it's 'almost' perfect. The gameplay is as expected from a hack and slash, lots of mini games and events to grind on so you never run out of things to do in-game, and the gacha can be forgiving (sometimes). The downside is the update, everytime. Though it's not as frequent as other games (2 months or so between each update), the update is so huge it feels as if you're re-installing the game. The network and server issues don't help`;
  const entries = [{ review, topicResultIndex: 0 }];
  const expectedByTopic = {
    Quality: { 'almost perfect': 0.84 },
    'Features / Content': {
      gameplay: 0.8,
      'mini games': 0.82,
      events: 0.81,
      gacha: 0.83,
    },
    'Performance / Functionality': {
      'network and server issues': 0.86,
      're-installing the game': 0.85,
    },
    'Service / Support': { 'network and server issues': 0.74 },
  };
  const labels = Object.keys(expectedByTopic);
  const topicAnalysis = {
    results: [{
      reviewIndex: 0,
      topics: labels.map((label) => ({ label, score: 0.8 })),
    }],
  };
  const candidates = getTopicKeywordCandidates(entries, topicAnalysis);
  const candidateKeys = new Set(candidates.map((candidate) => candidate.toLocaleLowerCase()));
  for (const phrase of Object.values(expectedByTopic).flatMap(Object.keys)) {
    assert.ok(candidateKeys.has(phrase), 'expected phrase to reach topic scoring');
  }

  topicAnalysis.keywordScores = Object.fromEntries(candidates.map((candidate) => [
    candidate.toLocaleLowerCase(),
    makeTopicScores('Other / General', 0.2),
  ]));
  for (const [label, phraseScores] of Object.entries(expectedByTopic)) {
    for (const [phrase, score] of Object.entries(phraseScores)) {
      topicAnalysis.keywordScores[phrase][label] = score;
    }
  }

  const keywordsByTopic = Object.fromEntries(labels.map((label) => [
    label,
    getMeaningfulKeywords(entries, label, topicAnalysis),
  ]));
  for (const [label, phraseScores] of Object.entries(expectedByTopic)) {
    for (const phrase of Object.keys(phraseScores)) {
      if (phraseScores[phrase] >= 0.75) {
        assert.ok(keywordsByTopic[label].includes(phrase));
      } else {
        assert.ok(!keywordsByTopic[label].includes(phrase));
      }
    }
  }
  assert.ok(!keywordsByTopic['Features / Content'].includes('almost perfect'));
  assert.ok(!keywordsByTopic['Service / Support'].includes('network and server issues'));
});

test('missing keyword scores keep successful topic assignments and safe empty keywords', () => {
  const topicAnalysis = {
    results: [{
      reviewIndex: 0,
      topics: [{ label: 'Service / Support', score: 0.8 }],
    }],
  };
  const [serviceTopic] = aggregateTopicsForReviews(
    [{ review: 'Customer support was unhelpful.', topicResultIndex: 0 }],
    topicAnalysis,
  ).filter((topic) => topic.label === 'Service / Support');

  assert.equal(serviceTopic.count, 1);
  assert.deepEqual(serviceTopic.keywords, []);
});

test('topic keywords remove relevant standalone words when a longer phrase covers them', () => {
  const review = 'This is not worth it.';
  const topicAnalysis = {
    keywordScores: {
      'not worth it': makeTopicScores('Price / Value', 0.86),
      'not worth': makeTopicScores('Price / Value', 0.85),
      worth: makeTopicScores('Price / Value', 0.84),
    },
  };

  assert.deepEqual(
    getMeaningfulKeywords([review], 'Price / Value', topicAnalysis),
    ['not worth it'],
  );
});

test('topic keyword selection rejects scores below the relevance floor', () => {
  const topicAnalysis = {
    keywordScores: {
      refund: makeTopicScores('Service / Support', 0.74),
      'refund request': makeTopicScores('Service / Support', 0.75, 0.74),
    },
  };
  assert.deepEqual(
    getMeaningfulKeywords(
      ['The refund request was ignored.'],
      'Service / Support',
      topicAnalysis,
    ),
    ['refund request'],
  );
});

test('topic keywords reject high cosine scores that are not distinctive to the topic', () => {
  const review = 'Customer service ignored my message.';
  const topicAnalysis = {
    keywordScores: {
      'customer service': makeTopicScores('Service / Support', 0.84, 0.87),
    },
  };
  assert.deepEqual(
    getMeaningfulKeywords([review], 'Service / Support', topicAnalysis),
    [],
  );
});