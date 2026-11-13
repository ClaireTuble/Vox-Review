import assert from 'node:assert/strict';
import test from 'node:test';
import { attachReviewPriorities } from './priorityEngine.js';
import { aggregateTopicsForReviews } from './reviewTopics.js';
import { filterEligibleReviewEntries } from './reviewAggregateEligibility.js';

test('duplicate exclusion keeps topic counts and percentages on the eligible denominator', () => {
  const entries = [
    { review: { text: 'duplicate issue' }, topicResultIndex: 0, aggregateEligible: false },
    { review: { text: 'included issue' }, topicResultIndex: 1, aggregateEligible: true },
    { review: { text: 'no topic' }, topicResultIndex: 2, aggregateEligible: true },
  ];
  const topicAnalysis = {
    results: [
      { reviewIndex: 0, topics: [{ label: 'Quality', score: 0.9 }] },
      { reviewIndex: 1, topics: [{ label: 'Quality', score: 0.8 }] },
      { reviewIndex: 2, topics: [] },
    ],
  };

  const topics = aggregateTopicsForReviews(
    filterEligibleReviewEntries(entries),
    topicAnalysis,
  );
  const quality = topics.find(({ label }) => label === 'Quality');
  assert.equal(quality.count, 1);
  assert.equal(quality.percentage, 50);

  const noEligibleTopics = aggregateTopicsForReviews(
    filterEligibleReviewEntries(entries.map((entry) => ({ ...entry, aggregateEligible: false }))),
    topicAnalysis,
  );
  assert.ok(noEligibleTopics.every(({ count, percentage }) => count === 0 && percentage === 0));
});

test('duplicate exclusion removes reviews from priority aggregates but preserves their records', () => {
  const reviews = [
    { text: 'The app crashes every time.', aggregateEligible: false },
    { text: 'The interface is confusing.', aggregateEligible: true },
  ];
  const prioritized = attachReviewPriorities(reviews);

  assert.equal(prioritized.length, reviews.length);
  assert.equal(prioritized[0].priority, null);
  assert.equal(prioritized[1].priority.severity, 'MINOR');
  assert.equal(prioritized[1].priority.factors.repetition, 0);

  const noEligibleReviews = attachReviewPriorities(
    reviews.map((review) => ({ ...review, aggregateEligible: false })),
  );
  assert.equal(noEligibleReviews.length, reviews.length);
  assert.ok(noEligibleReviews.every(({ priority }) => priority === null));
});
