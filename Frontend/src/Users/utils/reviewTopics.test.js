import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { aggregateTopicsForReviews, getMeaningfulKeywords, getReviewText } from './reviewTopics.js';

const DELIVERY = 'Delivery / Transaction';
const FEATURES = 'Features / Content';

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
  const keywords = getMeaningfulKeywords([{ review: { text: review }, topicResultIndex: 0 }]);

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

test('topic keywords omit URLs and numbers', () => {
  const review = 'High-quality metal legs; details at https://example.com/review?item=123, quantity 123.';
  const keywords = getMeaningfulKeywords([review]);

  assert.ok(keywords.includes('High-quality metal') || keywords.includes('High-quality') || keywords.includes('metal legs'));
  assert.ok(!keywords.some((keyword) => /https?|example|\d/.test(keyword)));
});

test('topic keywords are extracted from the whole review, not its first sentence', () => {
  const review = 'I bought and used the product. Dark wood grain looks practical and sturdy.';
  const keywords = getMeaningfulKeywords([review]);

  assert.ok(keywords.some((keyword) => keyword.toLocaleLowerCase() === 'dark wood grain'));
  assert.ok(keywords.some((keyword) => keyword.toLocaleLowerCase().includes('practical')));
  assert.ok(!keywords.some((keyword) => ['bought', 'used', 'product'].includes(keyword.toLocaleLowerCase())));
});

test('topic keywords preserve Taglish and English evidence', () => {
  const review = 'Ang ganda ng customer service, pero delivery time: matagal talaga. Gumana rin ang app.';
  const keywords = getMeaningfulKeywords([review]);

  assert.ok(keywords.includes('ganda'));
  assert.ok(keywords.includes('customer service'));
  assert.ok(keywords.includes('delivery time'));
  assert.ok(keywords.includes('matagal'));
  assert.ok(keywords.every((keyword) => review.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())));
});

test('topic keywords filter auxiliary and generic action verbs', () => {
  const review = 'The desk has have had a sturdy frame, is are was were secure, and got made used with care.';
  const keywords = getMeaningfulKeywords([review]);
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
  assert.ok(qualityKeywords.includes('easy to assemble'));
  assert.ok(qualityKeywords.includes('sturdy and secure'));
  assert.ok(!qualityKeywords.some((keyword) => /delivery|customer service|installation/.test(keyword)));
  assert.ok(serviceKeywords.includes('customer service'));
  assert.ok(!serviceKeywords.some((keyword) => /fine workmanship|thick materials|no odor/.test(keyword)));
  assert.ok(deliveryKeywords.some((keyword) => /delivery|door-to-door/.test(keyword)));
  assert.notDeepEqual(qualityKeywords, serviceKeywords);
  assert.notDeepEqual(qualityKeywords, deliveryKeywords);
  assert.deepEqual(topicAnalysis.results, originalAssignments);
});