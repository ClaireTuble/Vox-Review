import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachReviewPriorities,
  calculateReviewPriorities,
  filterReviewEntriesByEmotion,
  filterPriorityReviews,
  sortPriorityReviews,
} from './priorityEngine.js';

function topicAnalysisFor(labelsByReview) {
  return {
    results: labelsByReview.map((labels, reviewIndex) => ({
      reviewIndex,
      topics: labels.map((label) => ({ label, score: 0.8 })),
    })),
  };
}

test('praise-only review is NONE and LOW', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'Excellent game, I love the AFK system.', category: 1 },
  ]);

  assert.equal(priority.severity, 'NONE');
  assert.equal(priority.level, 'LOW');
  assert.match(priority.explanation, /positive review with no actionable issue/i);
});

test('feature preference is NONE and LOW', () => {
  const [priority] = calculateReviewPriorities([{ text: 'Please add dark mode.' }]);

  assert.equal(priority.severity, 'NONE');
  assert.equal(priority.level, 'LOW');
});

test('missing cottage in a mixed-sentiment review is not classified as a core failure', () => {
  const text = "Nice place but not good for vacation /outing coz it doesn't have any cottage";
  const [priority] = calculateReviewPriorities([{ text, category: 2, emotion: 'Sad' }]);

  assert.equal(priority.severity, 'NONE');
  assert.equal(priority.level, 'LOW');
  assert.equal(priority.factors.emotion, 0);
  assert.equal(priority.signals.some((signal) => signal.type === 'severity'), false);
});

test('repeated app crash during login is CRITICAL severity', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'The app crashes every time I try to log in.', category: 3 },
  ]);

  assert.equal(priority.severity, 'CRITICAL');
  assert.equal(priority.level, 'CRITICAL');
  assert.match(priority.explanation, /repeated app crashes/i);
});

test('duplicate charge is CRITICAL severity with HIGH base priority', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'I was charged twice for the same purchase.' },
  ]);

  assert.equal(priority.severity, 'CRITICAL');
  assert.equal(priority.level, 'HIGH');
});

test('a minor actionable bug with SVM Anger receives only the existing one-level adjustment', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'The app has a small bug that sometimes freezes the menu briefly.', category: 3 },
  ]);

  assert.equal(priority.severity, 'MINOR');
  assert.equal(priority.level, 'MEDIUM');
  assert.equal(priority.factors.emotion, 1);
});

test('a feature failure expressed as not working is recognized as a major malfunction', () => {
  const [priority] = calculateReviewPriorities([
    { text: "The app's save feature doesn't work, so progress cannot be saved." },
  ]);

  assert.equal(priority.severity, 'MAJOR');
  assert.equal(priority.level, 'MEDIUM');
});

test('a single critical issue receives HIGH base priority without repetition support', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'I was charged twice for the same purchase.' },
  ]);

  assert.equal(priority.severity, 'CRITICAL');
  assert.equal(priority.level, 'HIGH');
  assert.equal(priority.factors.repetition, 0);
});

test('mixed game-menu failures are critical even when the review is predicted Happy', () => {
  const text = "hello, I'm new to this game and I'm hyped up when playing while doing work, but there are problems, I downloaded the 1.5GB resource option to maintain my storage, but whenever I open the mystical house I can't open other menus and I cant even get out so I have to restart the game, also when I'm claiming a daily login rewards the screen is just black and nothing happens even after an hour has passed, same thing happens on other menus, it takes much time to load even with excellent network.";
  const [priority] = calculateReviewPriorities([{ text, category: 1, emotion: 'Happy' }]);

  assert.equal(priority.signals.find((signal) => signal.type === 'severity')?.id, 'core_unavailable');
  assert.equal(priority.severity, 'CRITICAL');
  assert.equal(priority.level, 'HIGH');
  assert.equal(priority.factors.emotion, 0);
  assert.equal(priority.factors.repetition, 0);
});

test('specific game-menu failure phrases map to critical or major issue patterns', () => {
  const cases = [
    ["I can't open other menus.", 'CRITICAL', 'core_unavailable'],
    ['I cant even get out and have to restart the game.', 'CRITICAL', 'core_unavailable'],
    ['I have to restart the game.', 'MAJOR', 'major_feature_failure'],
    ['The screen is just black and nothing happens.', 'MAJOR', 'major_feature_failure'],
    ['The same thing happens on other menus.', 'MAJOR', 'major_feature_failure'],
  ];

  for (const [text, severity, ruleId] of cases) {
    const [priority] = calculateReviewPriorities([{ text, category: 1 }]);

    assert.equal(priority.severity, severity, text);
    assert.equal(priority.signals.find((signal) => signal.type === 'severity')?.id, ruleId, text);
  }
});

test('occasional slight slowness is MINOR and LOW', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'The game occasionally feels a little slow.' },
  ]);

  assert.equal(priority.severity, 'MINOR');
  assert.equal(priority.level, 'LOW');
});

test('app slowness without a persistence signal is MINOR', () => {
  const [priority] = calculateReviewPriorities([{ text: 'The app is slow.' }]);

  assert.equal(priority.severity, 'MINOR');
  assert.equal(priority.level, 'LOW');
});

test('persistent FPS degradation is MAJOR and can be raised by emotion', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'The game constantly drops FPS and becomes almost impossible to play.', category: 2 },
  ]);

  assert.equal(priority.severity, 'MAJOR');
  assert.equal(priority.level, 'HIGH');
});

test('negated crash does not trigger severe crash severity', () => {
  for (const text of ['The app does not crash when I log in.', 'The app did not crash.', 'The app never crashed.']) {
    const [priority] = calculateReviewPriorities([{ text }]);
    assert.equal(priority.severity, 'NONE', text);
    assert.equal(priority.level, 'LOW', text);
  }
});

test('repeated crashing without app or game context does not trigger critical severity', () => {
  const [priority] = calculateReviewPriorities([{ text: 'The button keeps crashing.' }]);

  assert.equal(priority.severity, 'NONE');
  assert.equal(priority.level, 'LOW');
});

test('anger without an actionable issue does not raise priority', () => {
  const [priority] = calculateReviewPriorities([
    { text: "I'm angry because the button color is ugly.", category: 3 },
  ]);

  assert.equal(priority.severity, 'NONE');
  assert.equal(priority.level, 'LOW');
  assert.equal(priority.factors.emotion, 0);
});

test('helpful votes support a serious issue but do not change its severity', () => {
  const text = 'The app keeps crashing and cannot be used.';
  const [withoutVotes] = calculateReviewPriorities([{ text }]);
  const [withVotes] = calculateReviewPriorities([{ text, helpfulCount: 57 }]);

  assert.equal(withVotes.severity, 'CRITICAL');
  assert.equal(withVotes.level, 'CRITICAL');
  assert.equal(withVotes.factors.engagement, 2);
  assert.equal(withVotes.signals.find((signal) => signal.type === 'engagement')?.count, 57);
  assert.equal(withoutVotes.level, 'HIGH');
});

test('many likes cannot raise a positive NONE review', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'Perfect game, great graphics.', likes: 100 },
  ]);

  assert.equal(priority.severity, 'NONE');
  assert.equal(priority.level, 'LOW');
  assert.equal(priority.factors.engagement, 0);
});

test('priority calculation works when social engagement is unavailable', () => {
  const [priority] = calculateReviewPriorities([{ text: 'The room could be cleaner.' }]);

  assert.equal(priority.severity, 'MINOR');
  assert.equal(priority.level, 'LOW');
  assert.equal(priority.factors.engagement, 0);
});

test('helpfulCount is used consistently for every supported platform', () => {
  for (const platform of ['shopee', 'lazada', 'google', 'googleplay', 'steam']) {
    const [priority] = calculateReviewPriorities([{
      text: 'The interface is confusing.',
      platform,
      helpfulCount: 3,
    }]);

    assert.equal(priority.severity, 'MINOR', `${platform} severity`);
    assert.equal(priority.level, 'MEDIUM', `${platform} priority`);
    assert.equal(priority.factors.engagement, 1, `${platform} engagement support`);
  }
});

test('three helpful votes support an issue and ten are described as stronger support', () => {
  const text = 'The interface is confusing.';
  const [threeVotes] = calculateReviewPriorities([{ text, helpfulCount: 3 }]);
  const [tenVotes] = calculateReviewPriorities([{ text, helpfulCount: 10 }]);

  assert.equal(threeVotes.severity, 'MINOR');
  assert.equal(threeVotes.level, 'MEDIUM');
  assert.equal(threeVotes.factors.engagement, 1);
  assert.match(threeVotes.explanation, /Helpful-vote support \(3\)/);
  assert.equal(tenVotes.severity, 'MINOR');
  assert.equal(tenVotes.level, 'MEDIUM');
  assert.equal(tenVotes.factors.engagement, 2);
  assert.ok(tenVotes.score > threeVotes.score);
  assert.match(tenVotes.explanation, /High helpful-vote count \(10\)/);
});

test('missing and null helpfulCount values do not add engagement support', () => {
  for (const platform of ['shopee', 'lazada', 'google', 'googleplay', 'steam']) {
    for (const helpfulCount of [undefined, null]) {
      const review = { text: 'The interface is confusing.', platform };
      if (helpfulCount !== undefined) review.helpfulCount = helpfulCount;
      const [priority] = calculateReviewPriorities([review]);

      assert.equal(priority.severity, 'MINOR', `${platform} severity`);
      assert.equal(priority.level, 'LOW', `${platform} priority`);
      assert.equal(priority.factors.engagement, 0, `${platform} engagement support`);
    }
  }
});

test('helpful votes cannot raise a positive review with no actionable issue', () => {
  const [priority] = calculateReviewPriorities([{
    text: 'Perfect game, great graphics.',
    helpfulCount: 100,
  }]);

  assert.equal(priority.severity, 'NONE');
  assert.equal(priority.level, 'LOW');
  assert.equal(priority.factors.engagement, 0);
});

test('engagement leaves severity unchanged and all support raises priority by at most one level', () => {
  const text = 'The app keeps crashing and cannot be used.';
  const [withoutSupport] = calculateReviewPriorities([{ text }]);
  const [withSupport] = calculateReviewPriorities([{
    text,
    helpfulCount: 10,
    category: 3,
    rating: 1,
  }]);

  assert.equal(withSupport.severity, withoutSupport.severity);
  assert.equal(withoutSupport.level, 'HIGH');
  assert.equal(withSupport.level, 'CRITICAL');
  assert.equal(withSupport.factors.engagement, 2);
});

test('Taglish account access failure is CRITICAL', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'Hindi ako makapasok sa account ko.' },
  ]);

  assert.equal(priority.severity, 'CRITICAL');
});

test('Taglish duplicate charge is CRITICAL', () => {
  const [priority] = calculateReviewPriorities([{ text: 'Na-double charge ako.' }]);

  assert.equal(priority.severity, 'CRITICAL');
});

test('Taglish occasional slowness is MINOR', () => {
  const [priority] = calculateReviewPriorities([{ text: 'Mabagal lang minsan yung app.' }]);

  assert.equal(priority.severity, 'MINOR');
  assert.equal(priority.level, 'LOW');
});

test('Taglish negated bug remains NONE', () => {
  const [priority] = calculateReviewPriorities([{ text: 'Walang bug, okay naman gamitin.' }]);

  assert.equal(priority.severity, 'NONE');
  assert.equal(priority.level, 'LOW');
});

test('similar issue repetition is a one-level modifier, independent of topics', () => {
  const reviews = [
    { text: 'The app is sometimes a little slow.', topicResultIndex: 0 },
    { text: 'The app is sometimes a little slow.', topicResultIndex: 1 },
  ];
  const priorities = calculateReviewPriorities(reviews, topicAnalysisFor([
    ['Performance / Functionality'],
    ['Performance / Functionality'],
  ]));

  assert.equal(priorities[0].severity, 'MINOR');
  assert.equal(priorities[0].level, 'MEDIUM');
  assert.equal(priorities[0].factors.repetition, 1);
  assert.equal(priorities[1].factors.topic, 0);
});

test('broad topic assignments cannot raise a NONE review', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'Please add dark mode.', topicResultIndex: 0 },
  ], topicAnalysisFor([[
    'Quality', 'Performance / Functionality', 'Features / Content', 'Service / Support',
    'Delivery / Transaction', 'Price / Value', 'Usability / Experience',
  ]]));

  assert.equal(priority.severity, 'NONE');
  assert.equal(priority.level, 'LOW');
  assert.equal(priority.factors.topic, 0);
});

test('ratings support an existing issue only and are capped to one priority step', () => {
  const [oneStarIssue] = calculateReviewPriorities([
    { text: 'The interface is confusing.', rating: 1 },
  ]);
  const [twoStarIssue] = calculateReviewPriorities([
    { text: 'The interface is confusing.', rating: 2 },
  ]);
  const [ratingOnly] = calculateReviewPriorities([
    { text: 'Not my preference.', rating: 1 },
  ]);

  assert.equal(oneStarIssue.level, 'MEDIUM');
  assert.equal(oneStarIssue.factors.rating, 2);
  assert.equal(twoStarIssue.level, 'MEDIUM');
  assert.equal(twoStarIssue.factors.rating, 1);
  assert.equal(ratingOnly.level, 'LOW');
  assert.equal(ratingOnly.factors.rating, 0);
});

test('three-, four-, and five-star ratings are neutral', () => {
  for (const rating of [3, 4, 5]) {
    const [priority] = calculateReviewPriorities([
      { text: 'The interface is confusing.', rating },
    ]);
    assert.equal(priority.factors.rating, 0, `${rating}-star rating`);
    assert.equal(priority.level, 'LOW', `${rating}-star rating`);
  }
});

test('explanation names detected severity and supporting evidence', () => {
  const [priority] = calculateReviewPriorities([
    { text: 'The interface is confusing.', category: 3, rating: 1, helpfulCount: 12 },
  ]);

  assert.equal(priority.severity, 'MINOR');
  assert.match(priority.explanation, /^MEDIUM: usability problem/);
  assert.match(priority.explanation, /Anger emotion/);
  assert.match(priority.explanation, /High helpful-vote count \(12\)/);
  assert.match(priority.explanation, /1-star rating/);
});

test('priority sorting returns a sorted copy and preserves source review order', () => {
  const entries = [
    { quote: { text: 'Minor issue' }, priority: { level: 'LOW', score: 10 }, originalIndex: 0 },
    { quote: { text: 'Critical issue' }, priority: { level: 'CRITICAL', score: 300 }, originalIndex: 1 },
  ];
  const sorted = sortPriorityReviews(entries);

  assert.equal(sorted[0].quote.text, 'Critical issue');
  assert.equal(entries[0].quote.text, 'Minor issue');
  assert.notEqual(sorted, entries);
});

test('priority-level filtering selects only that level and All Priorities restores every entry', () => {
  const entries = [
    { quote: { text: 'Minor issue' }, priority: { level: 'LOW', score: 10 } },
    { quote: { text: 'Critical issue' }, priority: { level: 'CRITICAL', score: 300 } },
    { quote: { text: 'Medium issue' }, priority: { level: 'MEDIUM', score: 110 } },
  ];

  assert.deepEqual(
    filterPriorityReviews(entries, 'MEDIUM').map(({ quote }) => quote.text),
    ['Medium issue'],
  );
  assert.deepEqual(
    filterPriorityReviews(entries, 'all').map(({ quote }) => quote.text),
    ['Minor issue', 'Critical issue', 'Medium issue'],
  );
  assert.notEqual(filterPriorityReviews(entries, 'all'), entries);
});

test('selected Anger filter retains the matching review and its priority entry', () => {
  const entries = [{
    quote: { id: 'steam-review-42', emotion: 'Anger', text: 'The save feature does not work.' },
    priority: { reviewIndex: 0, level: 'HIGH', severity: 'MAJOR' },
    originalIndex: 0,
  }];

  assert.deepEqual(filterReviewEntriesByEmotion(entries, 'anger'), entries);
  assert.equal(filterReviewEntriesByEmotion(entries, 'anger')[0].quote.id, 'steam-review-42');
  assert.equal(filterReviewEntriesByEmotion(entries, 'anger')[0].priority.level, 'HIGH');
});

test('priority explanations are attached without mutating source reviews', () => {
  const reviews = [{ text: 'Please add dark mode.' }];
  const prioritized = attachReviewPriorities(reviews);

  assert.equal(prioritized[0].priority.level, 'LOW');
  assert.equal(prioritized[0].priority.severity, 'NONE');
  assert.equal(reviews[0].priority, undefined);
});

test('newest and oldest sorting continues to use source review dates', () => {
  const entries = [
    { quote: { text: 'Old' }, sourceReview: { date: '2024-01-01' }, originalIndex: 0 },
    { quote: { text: 'New' }, sourceReview: { date: '2026-01-01' }, originalIndex: 1 },
  ];

  assert.equal(sortPriorityReviews(entries, 'newest')[0].quote.text, 'New');
  assert.equal(sortPriorityReviews(entries, 'oldest')[0].quote.text, 'Old');
});