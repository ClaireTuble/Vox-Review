import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  aggregateTopicsForReviews,
  createTopicReviewEntries,
  getTopicAssignmentCounts,
  getTopicEvidenceDiagnostics,
  getMeaningfulKeywords,
  getTopicKeywordDiagnostics,
  getReviewKeywordPhrases,
  getReviewId,
  getReviewText,
  isSubstantiveReviewText,
  filterSubstantiveReviews,
  getTopicKeywordCandidates,
  getSelectedTopicView,
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

function makeKeywordAnalysis(review, scoresByTopic) {
  const candidates = getReviewKeywordPhrases(review);
  const keywordScores = Object.fromEntries(candidates.map((candidate) => [
    candidate.toLocaleLowerCase(),
    makeTopicScores('Other / General', 0.2),
  ]));
  const topicLabels = Object.keys(scoresByTopic);

  Object.entries(scoresByTopic).forEach(([label, scores]) => {
    Object.entries(scores).forEach(([phrase, score]) => {
      if (keywordScores[phrase.toLocaleLowerCase()]) {
        keywordScores[phrase.toLocaleLowerCase()][label] = score;
      }
    });
  });

  return {
    results: [{
      reviewIndex: 0,
      topics: topicLabels.map((label) => ({ label, score: 0.8 })),
    }],
    keywordScores,
  };
}

test('extracts text from the existing Shopee and Lazada review object fields', () => {
  assert.equal(getReviewText({ text: 'Shopee review body', review: 'duplicate alias' }), 'Shopee review body');
  assert.equal(getReviewText({ text: 'Lazada review body', review: 'Lazada review body' }), 'Lazada review body');
});

test('review identity uses only an analysis-local positional index', () => {
  assert.equal(getReviewId({ id: 'steam-review-42' }, 0), 1);
  assert.equal(getReviewId({ reviewId: 'review-7' }, 6), 7);
  assert.equal(getReviewId({ text: 'review without an ID' }, 2), 3);
});

test('accepts existing alternate review body aliases and ignores non-string fields', () => {
  assert.equal(getReviewText({ text: { value: 'not text' }, content: 'Review content' }), 'Review content');
  assert.equal(getReviewText({ body: 'Review body' }), 'Review body');
  assert.equal(getReviewText({ reviewBody: 'Review body field' }), 'Review body field');
  assert.equal(getReviewText({ text: '  ', review: null }), '');
});

test('metadata-only Lazada entries are not substantive review text', () => {
  assert.equal(isSubstantiveReviewText('R2026-08-23Helpful(0)'), false);
  assert.equal(isSubstantiveReviewText('E2026-07-16Helpful(0)'), false);
  assert.deepEqual(filterSubstantiveReviews([
    { text: 'R2026-08-23Helpful(0)' },
    { text: 'E2026-07-16Helpful(0)' },
    { text: 'A' },
    { text: '👍' },
  ]).map(getReviewText), ['A', '👍']);
});

test('preserves short and emoji-only review text', () => {
  assert.equal(isSubstantiveReviewText('OK'), true);
  assert.equal(isSubstantiveReviewText('👍'), true);
  assert.equal(isSubstantiveReviewText('😂'), true);
});

test('preserves numeric customer comments while filtering metadata-only entries', () => {
  assert.equal(isSubstantiveReviewText('10/10'), true);
  assert.deepEqual(
    filterSubstantiveReviews([
      { text: '10/10' },
      { review: '5/5' },
      { text: 'R2026-08-23Helpful(0)' },
    ]).map(getReviewText),
    ['10/10', '5/5'],
  );
});

test('mixed-sentiment topic keywords retain source spacing, negation, and contractions', () => {
  const review = "Nice place but not good for vacation /outing coz it doesn't have any cottage";
  const candidates = getCandidates(review, 'Environment / Location');
  const keywordScores = Object.fromEntries(candidates.map((phrase) => [
    phrase.toLocaleLowerCase(),
    makeTopicScores('Environment / Location', 0.9),
  ]));
  const selected = getMeaningfulKeywords(
    [{ review, topicResultIndex: 0 }],
    'Environment / Location',
    {
      results: [{ reviewIndex: 0, topics: [{ label: 'Environment / Location', score: 0.9 }] }],
      keywordScores,
    },
  );

  assert.ok(candidates.includes('not good'));
  assert.ok(!candidates.includes('doesn'));
  assert.ok(selected.includes('not good'));
  assert.ok(selected.includes('Nice place'));
  assert.ok(selected.every((phrase) => review.includes(phrase)));
  assert.ok(!selected.some((phrase) => /placecottage|gooddoesn|doesnvacation/i.test(phrase)));
});

test('counts unique assigned review indexes without unsupported representative evidence', () => {
  const topic = aggregateTopicsForReviews(entries, analysis).find((item) => item.label === DELIVERY);

  assert.equal(topic.count, 2);
  assert.equal(topic.percentage, 66.7);
  assert.deepEqual(topic.reviews, []);
});

test('selected emotion scopes counts, percentages, and representative evidence', () => {
  const topic = aggregateTopicsForReviews(entries, analysis, 1).find((item) => item.label === DELIVERY);

  assert.equal(topic.count, 1);
  assert.equal(topic.percentage, 50);
  assert.deepEqual(topic.reviews, []);
});

test('topic assignment summaries count unassigned reviews without assigning Other / General', () => {
  const topicAnalysis = {
    results: [
      { reviewIndex: 0, topics: [{ label: 'Quality', score: 0.9 }, { label: 'Price / Value', score: 0.8 }] },
      { reviewIndex: 1, topics: [] },
    ],
  };
  const counts = getTopicAssignmentCounts(topicAnalysis);

  assert.deepEqual(counts, {
    resultCount: 2,
    resultsWithTopics: 1,
    topicAssignmentCount: 2,
    reviewsWithoutTopics: 1,
  });

  const topics = aggregateTopicsForReviews(
    [{ review: 'Review with topics', topicResultIndex: 0 }, { review: 'Unassigned', topicResultIndex: 1 }],
    topicAnalysis,
  );
  assert.equal(topics.find(({ label }) => label === 'Quality').percentage, 50);
  assert.equal(topics.find(({ label }) => label === 'Price / Value').percentage, 50);
  assert.equal(topics.find(({ label }) => label === 'Other / General').count, 0);
});

test('selected-topic view changes keywords and representative reviews with topic assignments', () => {
  const priceReview = 'item is so nice. mahaba yung strap and yung tela neto malambot. and its cheap so i like it. tysm';
  const usabilityReview = 'Controls feel responsive and navigation is easy to understand.';
  const reviews = [
    { review: { text: priceReview }, category: 1, topicResultIndex: 0 },
    { review: { text: usabilityReview }, category: 1, topicResultIndex: 1 },
  ];
  const topicAnalysis = {
    results: [
      { reviewIndex: 0, topics: [
        { label: 'Price / Value', score: 0.91 },
        { label: 'Usability / Experience', score: 0.84 },
      ] },
      { reviewIndex: 1, topics: [{ label: 'Usability / Experience', score: 0.9 }] },
    ],
    keywordScores: {},
  };
  [...new Set(reviews.flatMap(({ review }) => getReviewKeywordPhrases(review.text)))].forEach((phrase) => {
    topicAnalysis.keywordScores[phrase.toLocaleLowerCase()] = makeTopicScores('Other / General', 0.2);
  });
  topicAnalysis.keywordScores.cheap['Price / Value'] = 0.94;
  topicAnalysis.keywordScores.malambot = makeTopicScores('Price / Value', 0.86);
  topicAnalysis.keywordScores['responsive and navigation'] = makeTopicScores('Usability / Experience', 0.96);
  topicAnalysis.keywordScores.controls = makeTopicScores('Usability / Experience', 0.93);

  const priceView = getSelectedTopicView(reviews, topicAnalysis, null, 'price-value');
  const usabilityView = getSelectedTopicView(reviews, topicAnalysis, null, 'usability-experience');

  assert.deepEqual(priceView.activeTopic.reviews, [priceReview]);
  assert.deepEqual(priceView.activeTopic.reviewEvidence.map(({ topicResultIndex }) => topicResultIndex), [0]);
  assert.ok(priceView.activeTopic.keywords.includes('cheap'));
  assert.ok(priceView.activeTopic.keywords.every((phrase) => priceReview.includes(phrase)));
  assert.deepEqual(usabilityView.activeTopic.reviews, [usabilityReview]);
  assert.deepEqual(usabilityView.activeTopic.reviewEvidence.map(({ topicResultIndex }) => topicResultIndex), [1]);
  assert.ok(usabilityView.activeTopic.keywords.includes('Controls'));
  assert.ok(usabilityView.activeTopic.keywords.every((phrase) => (
    priceReview.includes(phrase) || usabilityReview.includes(phrase)
  )));
  assert.ok(!usabilityView.activeTopic.keywords.includes('cheap'));
});

test('malformed joined tokens are rejected and Filipino or Taglish phrases stay source-grounded', () => {
  const review = 'cheap pricenicelikeThankmailalaman mukha; free to play and f2p friendly, sulit.';
  const analysis = makeKeywordAnalysis(review, {
    'Price / Value': {
      cheap: 0.96,
      'pricenicelikethankmailalaman': 0.99,
      'free to play': 0.97,
      'f2p friendly': 0.94,
      sulit: 0.93,
    },
  });
  const keywords = getMeaningfulKeywords(
    [{ review, topicResultIndex: 0 }],
    'Price / Value',
    analysis,
  );

  assert.ok(!keywords.some((phrase) => /pricenicelikeThankmailalaman/i.test(phrase)));
  assert.ok(keywords.includes('free to play'));
  assert.ok(keywords.includes('f2p friendly'));
  assert.ok(keywords.includes('sulit'));
  assert.ok(keywords.every((phrase) => review.includes(phrase)));
  assert.deepEqual(keywords, ['free to play', 'cheap', 'f2p friendly', 'sulit']);
});

test('concatenated filler compounds and generic praise cannot become topic keywords', () => {
  const review = `Network issues don't helpnetwork and server issueseverytimemonthssay it's almost perfect.`;
  const topicEntries = [{ review, topicResultIndex: 0 }];
  const topicAnalysis = {
    results: [{
      reviewIndex: 0,
      topics: [{ label: 'Performance / Functionality', score: 0.9 }],
    }],
  };
  const phrases = getTopicKeywordCandidates(topicEntries, topicAnalysis);
  const scores = Object.fromEntries(phrases.map((phrase) => [
    phrase.toLocaleLowerCase(),
    makeTopicScores('Performance / Functionality', 0.9),
  ]));
  const keywords = getMeaningfulKeywords(
    topicEntries,
    'Performance / Functionality',
    { ...topicAnalysis, keywordScores: scores },
  );

  assert.ok(phrases.some((phrase) => phrase.toLocaleLowerCase() === 'network issues'));
  assert.ok(phrases.some((phrase) => phrase.toLocaleLowerCase() === 'server'));
  assert.ok(!phrases.some((phrase) => /helpnetwork|issueseverytimemonthssay|almost perfect/i.test(phrase)));
  assert.ok(!keywords.some((phrase) => /helpnetwork|issueseverytimemonthssay|almost perfect/i.test(phrase)));
  assert.ok(keywords.every((phrase) => review.includes(phrase)));
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

test('AnalysisResults renders original representative reviews without keyword-scoring UI', () => {
  const componentSource = readFileSync(new URL('../components/AnalysisResults.jsx', import.meta.url), 'utf8');
  const styleSource = readFileSync(new URL('../css/AnalysisResults.css', import.meta.url), 'utf8');

  assert.doesNotMatch(componentSource, /<span className="keyword-separator"/);
  assert.match(componentSource, /activeEmotionDisplay\.evidencePhrases\.map\(\(phrase\) => \(\s*<span key=\{phrase\} className="keyword-tag">\{phrase\}<\/span>/);
  assert.doesNotMatch(componentSource, /Common Keywords|Scoring common keywords|Retry keyword scoring/);
  assert.doesNotMatch(componentSource, /No strong review evidence is available/);
  assert.doesNotMatch(componentSource, /Representative Evidence/);
  assert.match(componentSource, /Representative Reviews/);
  assert.match(componentSource, /No matching reviews available for this topic\./);
  assert.match(componentSource, /const representativeReviews = activeTopic\?\.representativeReviews \|\| \[\];/);
  assert.match(componentSource, /text=\{representativeReview\.review\}/);
  assert.doesNotMatch(componentSource, /isTopicKeywordScoring|hasTopicKeywordScoringError/);
  assert.match(componentSource, /emotion\.id === selectedEmotion\?\.id/);
  assert.match(componentSource, /typeof topic\?\.label === 'string'/);
  assert.match(componentSource, /const topicStatus = hasValidTopicResults \? 'ready' : data\.topicStatus;/);
  assert.match(componentSource, /\{topicStatus === 'ready' && activeTopic && \(/);
  assert.doesNotMatch(componentSource, /Review coverage\s*[·|]/);
  assert.doesNotMatch(componentSource, /analysis-sample-details/);
  assert.match(styleSource, /\.keywords-tags-row\s*\{[^}]*display:\s*flex;[^}]*gap:\s*6px 7px;/s);
});

test('representative reviews use assigned topic, active category, and original text without keyword scores', () => {
  const reviews = [
    { review: { text: 'Original relevant review for topic one.' }, category: 1, topicResultIndex: 0 },
    { review: { text: 'Original relevant review for topic two.' }, category: 2, topicResultIndex: 1 },
    { review: { text: 'Not assigned to the selected topic.' }, category: 1, topicResultIndex: 2 },
  ];
  const topicAnalysis = {
    results: [
      { reviewIndex: 0, topics: [{ label: 'Quality', score: 0.8 }] },
      { reviewIndex: 1, topics: [{ label: 'Quality', score: 0.9 }] },
      { reviewIndex: 2, topics: [{ label: 'Price / Value', score: 0.95 }] },
    ],
  };
  const allReviews = getSelectedTopicView(reviews, topicAnalysis, null, 'quality').activeTopic;
  const filteredReviews = getSelectedTopicView(reviews, topicAnalysis, 1, 'quality').activeTopic;

  assert.deepEqual(
    allReviews.representativeReviews.map(({ review }) => review),
    ['Original relevant review for topic two.', 'Original relevant review for topic one.'],
  );
  assert.deepEqual(
    filteredReviews.representativeReviews.map(({ review }) => review),
    ['Original relevant review for topic one.'],
  );
  assert.equal(filteredReviews.representativeReviews.length, 1);
});

test('missing topic scores preserve all assigned reviews in stable source order', () => {
  const reviews = [
    { review: { text: 'First source review.' }, category: 1, topicResultIndex: 0 },
    { review: { text: 'Second source review.' }, category: 1, topicResultIndex: 1 },
  ];
  const topicAnalysis = {
    results: [
      { reviewIndex: 0, topics: [{ label: 'Usability / Experience' }] },
      { reviewIndex: 1, topics: [{ label: 'Usability / Experience', score: Number.NaN }] },
    ],
  };
  const topic = getSelectedTopicView(
    reviews,
    topicAnalysis,
    null,
    'usability-experience',
  ).activeTopic;

  assert.equal(topic.count, 2);
  assert.deepEqual(
    topic.representativeReviews.map(({ review }) => review),
    ['First source review.', 'Second source review.'],
  );
});

test('a changed review set returns only its current assigned source reviews', () => {
  const currentReviews = [
    { review: { text: 'Current review one.' }, category: 1, topicResultIndex: 0 },
    { review: { text: 'Current review two.' }, category: 1, topicResultIndex: 1 },
  ];
  const currentAnalysis = {
    results: [
      { reviewIndex: 0, topics: [{ label: 'Usability / Experience', score: 0.8 }] },
      { reviewIndex: 1, topics: [{ label: 'Usability / Experience', score: 0.7 }] },
    ],
  };
  const topic = getSelectedTopicView(
    currentReviews,
    currentAnalysis,
    null,
    'usability-experience',
  ).activeTopic;

  assert.deepEqual(
    topic.representativeReviews.map(({ review }) => review),
    ['Current review one.', 'Current review two.'],
  );
  assert.ok(topic.representativeReviews.every(({ review }) => !review.includes('Previous')));
});

test('representative-review empty state data is empty when no assigned original review exists', () => {
  const qualityTopicAnalysis = {
    results: [{ reviewIndex: 0, topics: [{ label: 'Quality', score: 0.9 }] }],
  };
  const priceTopicAnalysis = {
    results: [{ reviewIndex: 0, topics: [{ label: 'Price / Value', score: 0.9 }] }],
  };
  const noTopicMatch = getSelectedTopicView(
    [{ review: { text: 'Price is too high.' }, category: 1, topicResultIndex: 0 }],
    priceTopicAnalysis,
    null,
    'quality',
  ).activeTopic;
  const noOriginalText = getSelectedTopicView(
    [{ review: { text: ' ' }, category: 1, topicResultIndex: 0 }],
    qualityTopicAnalysis,
    null,
    'quality',
  ).activeTopic;

  assert.equal(noTopicMatch.count, 0);
  assert.deepEqual(noTopicMatch.representativeReviews, []);
  assert.equal(noOriginalText.count, 1);
  assert.deepEqual(noOriginalText.representativeReviews, []);
});

test('topic candidates keep meaningful Steam clauses separate and remove low-information fragments', () => {
  const review = `Been playing this game for almost a year now, and I could say it's 'almost' perfect. The gameplay is as expected from a hack and slash, lots of mini games and events to grind on so you never run out of things to do in-game, and the gacha can be forgiving (sometimes). The downside is the update, everytime. Though it's not as frequent as other games (2 months or so between each update), the update is so huge it feels as if you're re-installing the game. The network and server issues don't help`;
  const phrases = getReviewKeywordPhrases(review);

  for (const phrase of [
    'downside is the update',
    'update is so huge',
    'network and server issues',
    'gameplay',
    'gacha',
  ]) {
    assert.ok(phrases.includes(phrase), `expected phrase: ${phrase}`);
    assert.ok(review.includes(phrase), `phrase must retain source boundaries: ${phrase}`);
  }
  assert.ok(!phrases.includes('help'));
  assert.ok(!phrases.includes('everytime'));
  assert.ok(!phrases.includes('months'));
  assert.ok(!phrases.includes("say it's almost perfect"));
  assert.ok(phrases.includes('almost perfect'));
});

test('Steam candidates survive the per-topic cap and render when their topic scores support them', () => {
  const review = 'I spent 60 hours exploring the vast open world, completing quests, collecting items, fighting bosses, and enjoying the soundtrack. Combat feels responsive and the graphics are stunning. The story is engaging, but the late game becomes repetitive, the user interface is clunky, and server issues interrupt multiplayer sessions. The DLC is expensive and the base game price is high, although discounts make it affordable. Updates are frequent and the community is active.';
  const steamReview = { platform: 'steam', text: review, review };
  const reviews = [{ review: steamReview, topicResultIndex: 0 }];
  const topicAnalysis = {
    results: [{
      reviewIndex: 0,
      topics: [{ label: 'Features / Content', score: 0.9 }],
    }],
  };
  const candidates = getTopicKeywordCandidates(reviews, topicAnalysis);

  assert.equal(candidates.length, 40);
  assert.ok(candidates.includes('graphics'));
  topicAnalysis.keywordScores = Object.fromEntries(candidates.map((candidate) => [
    candidate.toLocaleLowerCase(),
    makeTopicScores(
      'Features / Content',
      candidate.toLocaleLowerCase() === 'graphics' ? 0.94 : 0.2,
    ),
  ]));

  const topic = aggregateTopicsForReviews(reviews, topicAnalysis)
    .find(({ label }) => label === 'Features / Content');
  assert.ok(topic.keywords.includes('graphics'));
  assert.ok(topic.reviewEvidence.some(({ review: evidence }) => evidence.includes('graphics')));
});

test('Price phrases are supported independently from Quality assignments', () => {
  const priceReview = 'The expensive price and extra fees are worth it because the discount makes it affordable.';
  const priceEntries = [{ review: priceReview, topicResultIndex: 0 }];
  const priceAnalysis = {
    results: [{
      reviewIndex: 0,
      topics: [{ label: 'Price / Value', score: 0.9 }],
    }],
  };
  const priceCandidates = getTopicKeywordCandidates(priceEntries, priceAnalysis);
  priceAnalysis.keywordScores = Object.fromEntries(priceCandidates.map((candidate) => [
    candidate.toLocaleLowerCase(),
    makeTopicScores(
      'Price / Value',
      /price|expensive|fees|discount|affordable|worth it/i.test(candidate) ? 0.92 : 0.2,
    ),
  ]));
  const priceTopic = aggregateTopicsForReviews(priceEntries, priceAnalysis)
    .find(({ label }) => label === 'Price / Value');

  assert.ok(priceCandidates.some((candidate) => /price|expensive|fees|discount|affordable/i.test(candidate)));
  assert.ok(priceTopic.keywords.some((keyword) => /price|expensive|fees|discount|affordable/i.test(keyword)));
  assert.ok(priceTopic.reviewEvidence.length > 0);

  const qualityReview = 'The product has excellent build quality and durable materials.';
  const qualityEntries = [{ review: qualityReview, topicResultIndex: 0 }];
  const qualityAnalysis = {
    results: [{
      reviewIndex: 0,
      topics: [{ label: 'Quality', score: 0.9 }],
    }],
  };
  const qualityCandidates = getTopicKeywordCandidates(qualityEntries, qualityAnalysis);
  qualityAnalysis.keywordScores = Object.fromEntries(qualityCandidates.map((candidate) => [
    candidate.toLocaleLowerCase(),
    makeTopicScores('Quality', 0.92),
  ]));
  const qualityTopics = aggregateTopicsForReviews(qualityEntries, qualityAnalysis);

  assert.equal(qualityTopics.find(({ label }) => label === 'Price / Value').count, 0);
  assert.deepEqual(
    qualityTopics.find(({ label }) => label === 'Price / Value').keywords,
    [],
  );

  const mixedReview = `${qualityReview} The price is expensive but worth it on discount.`;
  const mixedEntries = [{ review: mixedReview, topicResultIndex: 0 }];
  const mixedAnalysis = {
    results: [{
      reviewIndex: 0,
      topics: [
        { label: 'Quality', score: 0.9 },
        { label: 'Price / Value', score: 0.9 },
      ],
    }],
  };
  const mixedCandidates = getTopicKeywordCandidates(mixedEntries, mixedAnalysis);
  mixedAnalysis.keywordScores = Object.fromEntries(mixedCandidates.map((candidate) => [
    candidate.toLocaleLowerCase(),
    Object.fromEntries(ALL_TOPIC_LABELS.map((label) => [
      label,
      label === 'Price / Value' && /price|expensive|worth it|discount/i.test(candidate)
        ? 0.92
        : label === 'Quality' && /quality|durable|materials/i.test(candidate)
          ? 0.92
          : 0.2,
    ])),
  ]));
  const mixedTopics = aggregateTopicsForReviews(mixedEntries, mixedAnalysis);

  assert.ok(mixedTopics.find(({ label }) => label === 'Price / Value').keywords.length > 0);
  assert.ok(mixedTopics.find(({ label }) => label === 'Quality').keywords.length > 0);
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

test('evidence diagnostics distinguish strong, limited, and category-empty results without review text', () => {
  const strongReview = 'The zipper is durable.';
  const limitedReview = 'The strap is torn.';
  const reviews = [
    { review: strongReview, category: 1, topicResultIndex: 0 },
    { review: limitedReview, category: 2, topicResultIndex: 1 },
  ];
  const strongAnalysis = makeKeywordAnalysis(strongReview, {
    Quality: { zipper: 0.95 },
  });
  const topicAnalysis = {
    ...strongAnalysis,
    results: [
      ...strongAnalysis.results,
      { reviewIndex: 1, topics: [{ label: 'Quality', score: 0.8 }] },
    ],
    keywordScores: {
      ...strongAnalysis.keywordScores,
      ...Object.fromEntries(
        getReviewKeywordPhrases(limitedReview).map((phrase) => [
          phrase.toLocaleLowerCase(),
          makeTopicScores(
            'Quality',
            phrase === 'strap' ? 0.69 : 0.4,
            phrase === 'strap' ? 0.73 : 0.2,
          ),
        ]),
      ),
    },
  };
  const strongDiagnostics = getTopicEvidenceDiagnostics(reviews, topicAnalysis, 1, 'Quality');
  const limitedDiagnostics = getTopicEvidenceDiagnostics(reviews, topicAnalysis, 2, 'Quality');
  const emptyCategoryDiagnostics = getTopicEvidenceDiagnostics(reviews, topicAnalysis, 3, 'Quality');
  const serialized = JSON.stringify([
    strongDiagnostics,
    limitedDiagnostics,
    emptyCategoryDiagnostics,
  ]);

  assert.equal(strongDiagnostics.inputReviewCount, 2);
  assert.equal(strongDiagnostics.categoryReviewCount, 1);
  assert.equal(strongDiagnostics.assignedReviewCount, 1);
  assert.equal(strongDiagnostics.strong.selectedKeywordCount, 1);
  assert.equal(strongDiagnostics.displayedEvidenceCount, 1);
  assert.equal(limitedDiagnostics.categoryReviewCount, 1);
  assert.equal(limitedDiagnostics.assignedReviewCount, 1);
  assert.equal(limitedDiagnostics.strong.selectedKeywordCount, 0);
  assert.equal(limitedDiagnostics.limited.selectedKeywordCount, 1);
  assert.equal(limitedDiagnostics.displayedEvidenceCount, 1);
  assert.equal(emptyCategoryDiagnostics.categoryReviewCount, 0);
  assert.equal(emptyCategoryDiagnostics.assignedReviewCount, 0);
  assert.equal(emptyCategoryDiagnostics.displayedEvidenceCount, 0);
  assert.doesNotMatch(serialized, /zipper|strap|durable|torn/);

  const unavailableScoreDiagnostics = getTopicEvidenceDiagnostics(
    reviews,
    { results: topicAnalysis.results },
    1,
    'Quality',
  );
  assert.equal(unavailableScoreDiagnostics.keywordScoreDataAvailable, false);
  assert.equal(unavailableScoreDiagnostics.keywordScoreEntryCount, 0);
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

test('topic keyword candidates preserve alphanumeric phrases and value wording', () => {
  const phrases = getReviewKeywordPhrases('F2P friendly, with free to play content.')
    .map((phrase) => phrase.toLocaleLowerCase());

  assert.ok(phrases.includes('f2p friendly'));
  assert.ok(phrases.includes('free to play'));
  assert.ok(phrases.includes('free to play content'));
});

test('selected topic keywords score meaningful phrases from the long review for their assigned topics', () => {
  const review = `Been playing this game for almost a year now, and I could say it's 'almost' perfect. The gameplay is as expected from a hack and slash, lots of mini games and events to grind on so you never run out of things to do in-game, and the gacha can be forgiving (sometimes). The downside is the update, everytime. Though it's not as frequent as other games (2 months or so between each update), the update is so huge it feels as if you're re-installing the game. The network and server issues don't help`;
  const entries = [{ review, topicResultIndex: 0 }];
  const expectedByTopic = {
    Quality: {},
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
  assert.deepEqual(keywordsByTopic.Quality, []);
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

test('topic keywords suppress a shorter phrase continued by a longer phrase at the same source boundary', () => {
  const review = 'Perfect place to experience paradise.';
  const topicAnalysis = makeKeywordAnalysis(review, {
    'Usability / Experience': {
      'Perfect place to experience paradise': 0.9,
      'Perfect place to experience': 0.89,
      'experience paradise': 0.88,
    },
  });

  assert.deepEqual(
    getMeaningfulKeywords(
      [{ review, topicResultIndex: 0 }],
      'Usability / Experience',
      topicAnalysis,
    ),
    ['Perfect place to experience paradise'],
  );
});

test('selected topic keywords use aligned analyzed reviews and switch evidence by topic', () => {
  const originalReviews = [
    { text: 'unsupported source row should not be analyzed' },
    { text: 'F2P friendly game with free to play content.' },
    { text: 'Fast delivery and careful packaging.' },
  ];
  const quotes = [
    {
      text: originalReviews[1].text,
      category: 1,
      emotion: 'Happy',
      topicResultIndex: 0,
    },
    {
      text: originalReviews[2].text,
      category: 3,
      emotion: 'Anger',
      topicResultIndex: 1,
    },
  ];
  const entries = createTopicReviewEntries(quotes, { happy: 1, anger: 3 });
  const topicAnalysis = {
    results: [
      { reviewIndex: 0, topics: [{ label: 'Price / Value', score: 0.9 }] },
      { reviewIndex: 1, topics: [{ label: DELIVERY, score: 0.9 }] },
    ],
    keywordScores: {
      'f2p friendly': makeTopicScores('Price / Value', 0.9),
      'free to play': makeTopicScores('Price / Value', 0.89),
      'free to play content': makeTopicScores('Price / Value', 0.91),
      'fast delivery': makeTopicScores(DELIVERY, 0.9),
      'careful packaging': makeTopicScores(DELIVERY, 0.88),
    },
  };
  const topics = aggregateTopicsForReviews(entries, topicAnalysis);
  const valueTopic = topics.find((topic) => topic.label === 'Price / Value');
  const deliveryTopic = topics.find((topic) => topic.label === DELIVERY);

  assert.deepEqual(entries.map(({ review }) => review.text), quotes.map(({ text }) => text));
  assert.deepEqual(valueTopic.keywords, ['free to play content', 'F2P friendly']);
  assert.deepEqual(valueTopic.reviews, [quotes[0].text]);
  assert.deepEqual(deliveryTopic.keywords, ['Fast delivery', 'careful packaging']);
  assert.deepEqual(deliveryTopic.reviews, [quotes[1].text]);
  assert.ok(!valueTopic.keywords.some((keyword) => /delivery|packaging/i.test(keyword)));
  assert.ok(!deliveryTopic.keywords.some((keyword) => /f2p|free to play/i.test(keyword)));
  assert.equal(originalReviews[0].text, 'unsupported source row should not be analyzed');
});

test('topic keywords retain separate non-overlapping phrases for one topic', () => {
  const review = 'Great quality and fast delivery.';
  const topicAnalysis = makeKeywordAnalysis(review, {
    'Other / General': {
      'Great quality': 0.9,
      'fast delivery': 0.89,
    },
  });

  assert.deepEqual(
    getMeaningfulKeywords([{ review, topicResultIndex: 0 }], 'Other / General', topicAnalysis),
    ['Great quality', 'fast delivery'],
  );
});

test('one multi-topic review keeps the separately scored evidence for each topic', () => {
  const review = 'Great quality and fast delivery.';
  const topicAnalysis = makeKeywordAnalysis(review, {
    Quality: { 'Great quality': 0.9 },
    [DELIVERY]: { 'fast delivery': 0.9 },
  });
  const originalAssignments = structuredClone(topicAnalysis.results);

  assert.deepEqual(
    getMeaningfulKeywords([{ review, topicResultIndex: 0 }], 'Quality', topicAnalysis),
    ['Great quality'],
  );
  assert.deepEqual(
    getMeaningfulKeywords([{ review, topicResultIndex: 0 }], DELIVERY, topicAnalysis),
    ['fast delivery'],
  );
  assert.deepEqual(topicAnalysis.results, originalAssignments);
});

test('Taglish phrases in separate clauses preserve distinct evidence despite shared wording', () => {
  const review = 'Mabilis delivery pero mabilis kausap ang seller.';
  const topicAnalysis = makeKeywordAnalysis(review, {
    'Service / Support': {
      'Mabilis delivery': 0.9,
      'mabilis kausap': 0.89,
    },
  });

  assert.deepEqual(
    getMeaningfulKeywords(
      [{ review, topicResultIndex: 0 }],
      'Service / Support',
      topicAnalysis,
    ),
    ['Mabilis delivery', 'mabilis kausap'],
  );
});

test('the supplied Taglish review keeps topic keywords source-grounded when switching topics', () => {
  const sampleReview = (
    'item is so nice. mahaba yung strap and yung tela neto malambot. '
    + 'and its cheap so i like it. tysm'
  );
  const priceOnlyReview = 'The price is reasonable and checkout was easy.';
  const reviewTexts = [sampleReview, priceOnlyReview];
  const topicAssignments = [
    ['Price / Value', 'Usability / Experience'],
    ['Price / Value'],
  ];
  const keywordScores = {};

  reviewTexts.forEach((review, reviewIndex) => {
    getReviewKeywordPhrases(review).forEach((phrase, phraseIndex) => {
      const topics = makeTopicScores('Other / General', 0.2);
      const preferredTopic = reviewIndex === 1 || phraseIndex % 2 === 0
        ? 'Price / Value'
        : 'Usability / Experience';
      topics[preferredTopic] = 0.9;
      keywordScores[phrase.toLocaleLowerCase()] = topics;
    });
  });

  const topicAnalysis = {
    results: topicAssignments.map((topics, reviewIndex) => ({
      reviewIndex,
      topics: topics.map((label) => ({ label, score: 0.9 })),
    })),
    keywordScores,
  };
  const entries = reviewTexts.map((review, topicResultIndex) => ({
    review,
    topicResultIndex,
  }));
  const topics = aggregateTopicsForReviews(entries, topicAnalysis);
  const priceTopic = topics.find(({ label }) => label === 'Price / Value');
  const usabilityTopic = topics.find(({ label }) => label === 'Usability / Experience');

  assert.equal(priceTopic.count, 2);
  assert.equal(priceTopic.percentage, 100);
  assert.deepEqual(priceTopic.reviews, reviewTexts);
  assert.equal(usabilityTopic.count, 1);
  assert.equal(usabilityTopic.percentage, 50);
  assert.deepEqual(usabilityTopic.reviews, [sampleReview]);
  assert.ok(priceTopic.keywords.length > 0);
  assert.ok(usabilityTopic.keywords.length > 0);
  assert.notDeepEqual(priceTopic.keywords, usabilityTopic.keywords);
  assert.ok(priceTopic.keywords.every((phrase) => (
    reviewTexts.some((review) => review.includes(phrase))
  )));
  assert.ok(usabilityTopic.keywords.every((phrase) => sampleReview.includes(phrase)));
  assert.equal(new Set(priceTopic.keywords).size, priceTopic.keywords.length);
  assert.equal(new Set(usabilityTopic.keywords).size, usabilityTopic.keywords.length);
  assert.ok(![...priceTopic.keywords, ...usabilityTopic.keywords]
    .some((phrase) => /cheapnicelikeneto|malambottela neto/i.test(phrase)));
});

test('Quality representatives require phrase-level evidence from the assigned review', () => {
  const reviews = [
    'Best feature is the deep pockets. Good and working zipper, love the color. Thank you seller and kuya Rider',
    'Quality and Fast Delivery Thank you seller',
  ];
  const keywordScores = {};
  reviews.forEach((review) => {
    getReviewKeywordPhrases(review).forEach((phrase) => {
      keywordScores[phrase.toLocaleLowerCase()] = makeTopicScores('Other / General', 0.2);
    });
  });
  keywordScores.quality.Quality = 0.95;
  keywordScores.zipper['Performance / Functionality'] = 0.93;
  keywordScores['deep pockets']['Features / Content'] = 0.95;
  keywordScores['fast delivery'][DELIVERY] = 0.95;
  const topicAnalysis = {
    results: [
      { reviewIndex: 0, topics: [{ label: 'Features / Content', score: 0.9 }] },
      { reviewIndex: 1, topics: [
        { label: 'Quality', score: 0.9 },
        { label: DELIVERY, score: 0.9 },
      ] },
    ],
    keywordScores,
  };
  const topic = aggregateTopicsForReviews(
    reviews.map((review, topicResultIndex) => ({ review, topicResultIndex })),
    topicAnalysis,
  ).find(({ label }) => label === 'Quality');

  assert.equal(topic.count, 1);
  assert.equal(topic.percentage, 50);
  assert.deepEqual(topic.reviews, [reviews[1]]);
  assert.ok(topic.keywords.includes('Quality'));
  assert.ok(!topic.keywords.some((phrase) => /thank you|seller|deep pockets|fast delivery/i.test(phrase)));

  const deliveryTopic = aggregateTopicsForReviews(
    reviews.map((review, topicResultIndex) => ({ review, topicResultIndex })),
    topicAnalysis,
  ).find(({ label }) => label === DELIVERY);
  assert.equal(deliveryTopic.count, 1);
  assert.equal(deliveryTopic.percentage, 50);
  assert.ok(deliveryTopic.keywords.includes('Fast Delivery'));
  assert.deepEqual(deliveryTopic.reviews, [reviews[1]]);
  assert.equal(topic.reviewEvidenceLevel, 'strong');
});

test('generic praise does not become representative evidence for an assigned topic', () => {
  const review = 'Thank you seller, great product!';
  const topicAnalysis = makeKeywordAnalysis(review, {
    Quality: {},
  });

  test('limited but relevant phrase scores are labeled and can support a representative review', () => {
    const review = 'The zipper has held up well.';
    const topicAnalysis = makeKeywordAnalysis(review, {
      Quality: { zipper: 0.69 },
    });
    topicAnalysis.keywordScores.zipper['Performance / Functionality'] = 0.73;
    const topic = aggregateTopicsForReviews(
      [{ review, topicResultIndex: 0 }],
      topicAnalysis,
    ).find(({ label }) => label === 'Quality');

    assert.equal(topic.count, 1);
    assert.deepEqual(topic.keywords, []);
    assert.deepEqual(topic.relatedPhrases, ['zipper']);
    assert.deepEqual(topic.reviews, [review]);
    assert.equal(topic.reviewEvidenceLevel, 'limited');
  });

  test('an assigned topic with no relevant phrase scores has no forced representative', () => {
    const review = 'I enjoyed it a lot.';
    const topicAnalysis = makeKeywordAnalysis(review, {
      Quality: { enjoyed: 0.42 },
    });
    const topic = aggregateTopicsForReviews(
      [{ review, topicResultIndex: 0 }],
      topicAnalysis,
    ).find(({ label }) => label === 'Quality');

    assert.equal(topic.count, 1);
    assert.deepEqual(topic.keywords, []);
    assert.deepEqual(topic.relatedPhrases, []);
    assert.deepEqual(topic.reviews, []);
  });
  const topic = aggregateTopicsForReviews(
    [{ review, topicResultIndex: 0 }],
    topicAnalysis,
  ).find(({ label }) => label === 'Quality');

  assert.equal(topic.count, 1);
  assert.deepEqual(topic.keywords, []);
  assert.deepEqual(topic.reviews, []);
});

test('lower-confidence topic matches show a verbatim excerpt from the assigned review', () => {
  const review = 'The menu response was unusually sluggish under load.';
  const topicAnalysis = makeKeywordAnalysis(review, {
    'Performance / Functionality': { sluggish: 0.7 },
  });
  topicAnalysis.keywordScores.sluggish.Quality = 0.9;
  const topic = aggregateTopicsForReviews(
    [{ review, topicResultIndex: 0 }],
    topicAnalysis,
  ).find(({ label }) => label === 'Performance / Functionality');

  assert.equal(topic.count, 1);
  assert.deepEqual(topic.keywords, []);
  assert.deepEqual(topic.reviews, [review]);
  assert.deepEqual(topic.reviewEvidence, [{
    review,
    topicResultIndex: 0,
    level: 'excerpt',
  }]);
  assert.ok(review.includes(topic.reviewEvidence[0].review));
});

test('Price / Value keywords remain score-driven for source wording about free content', () => {
  const review = 'Free to play content is available.';
  const topicAnalysis = makeKeywordAnalysis(review, {
    'Price / Value': { free: 0.9 },
  });
  const originalAssignments = structuredClone(topicAnalysis.results);

  assert.deepEqual(
    getMeaningfulKeywords(
      [{ review, topicResultIndex: 0 }],
      'Price / Value',
      topicAnalysis,
    ),
    ['Free'],
  );
  assert.deepEqual(topicAnalysis.results, originalAssignments);
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

test('assigned availability topics remain counted when phrase evidence misses its relevance floor', () => {
  const reviews = [
    { review: 'Could not access the game after the update.', topicResultIndex: 0 },
    { review: 'Could not access the game after the update.', topicResultIndex: 1 },
  ];
  const topicAnalysis = {
    results: reviews.map((_, reviewIndex) => ({
      reviewIndex,
      topics: [{ label: 'Availability / Accessibility', score: 0.36 }],
    })),
    keywordScores: {
      access: makeTopicScores('Availability / Accessibility', 0.64),
    },
  };

  const topics = aggregateTopicsForReviews(reviews, topicAnalysis);
  const availability = topics.find(({ label }) => label === 'Availability / Accessibility');
  const diagnostics = getTopicKeywordDiagnostics(
    reviews,
    'Availability / Accessibility',
    topicAnalysis,
  );

  assert.equal(availability.count, 2);
  assert.deepEqual(availability.reviewEvidence, []);
  assert.equal(diagnostics.minimumRelevanceThreshold, 0.75);
  assert.ok(diagnostics.rejectedCandidates.some((candidate) => (
    candidate.rejectionReason === 'below_minimum_relevance' &&
    candidate.relevanceScore === 0.64
  )));
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