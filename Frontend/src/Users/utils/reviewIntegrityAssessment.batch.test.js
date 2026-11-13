import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessReviewIntegrity,
  DEFAULT_RIA_RULE_IDS,
  MIN_NEAR_DUPLICATE_TOKEN_COUNT,
  toggleReviewIntegrityRuleSelection,
} from './reviewIntegrityAssessment.js';

function ruleIds(result) {
  return result.triggeredRules.map(r => r.id);
}

// Helper to run assessment and get first result (single review batch)
function assessSingle(reviewObj, opts) {
  return assessReviewIntegrity([reviewObj], opts)[0];
}

test('RIA-E is disabled by default', () => {
  const revA = { reviewIndex: 0, text: 'Great product, works well.' };
  const revB = { reviewIndex: 1, text: 'Great product, works well.' };
  const resultA = assessSingle(revA);
  const resultB = assessSingle(revB);
  assert.deepEqual(ruleIds(resultA), []);
  assert.deepEqual(ruleIds(resultB), []);
  assert.deepEqual(resultA.evaluatedRuleIds, DEFAULT_RIA_RULE_IDS);
});

test('RIA-E detects near‑duplicate reviews when explicitly enabled', () => {
  const revA = { reviewIndex: 0, text: 'The item arrived quickly and works as described.' };
  const revB = { reviewIndex: 1, text: 'The item arrived quickly and works as described.' };
  const opts = { enabledRuleIds: ['RIA-E'] };
  const results = assessReviewIntegrity([revA, revB], opts);
  const idsA = ruleIds(results[0]);
  const idsB = ruleIds(results[1]);
  assert.deepEqual(idsA, ['RIA-E']);
  assert.deepEqual(idsB, ['RIA-E']);
  // explanation should contain similarity percentage
  assert.match(results[0].triggeredRules[0].explanation, /similarity \d+%/);
  assert.deepEqual(results[0].evaluatedRuleIds, ['RIA-E']);
});

test('RIA-E respects similarity threshold and minimum token count', () => {
  assert.equal(MIN_NEAR_DUPLICATE_TOKEN_COUNT, 6);
  // Below threshold: distinct content
  const revA = { reviewIndex: 0, text: 'I love the color and size.' };
  const revB = { reviewIndex: 1, text: 'The shipping was fast and cheap.' };
  const opts = { enabledRuleIds: ['RIA-E'] };
  const results = assessReviewIntegrity([revA, revB], opts);
  assert.deepEqual(ruleIds(results[0]), []);
  assert.deepEqual(ruleIds(results[1]), []);
  // Short review (less than 6 tokens) should be ignored even if identical
  const short = { reviewIndex: 2, text: 'Nice!' };
  const dupShort = { reviewIndex: 3, text: 'Nice!' };
  const fiveTokens = { reviewIndex: 4, text: 'Really nice and works well.' };
  const dupFiveTokens = { reviewIndex: 5, text: 'Really nice and works well.' };
  const results2 = assessReviewIntegrity([short, dupShort, fiveTokens, dupFiveTokens], opts);
  assert.deepEqual(ruleIds(results2[0]), []);
  assert.deepEqual(ruleIds(results2[1]), []);
  assert.deepEqual(ruleIds(results2[2]), []);
  assert.deepEqual(ruleIds(results2[3]), []);
});

test('RIA-E can flag a review that participates in multiple pairs', () => {
  const rev0 = { reviewIndex: 0, text: 'Excellent battery life and performance, lasts all day.' };
  const rev1 = { reviewIndex: 1, text: 'Excellent battery life and performance, lasts all day.' };
  const rev2 = { reviewIndex: 2, text: 'Excellent battery life and performance, lasts all day.' };
  const opts = { enabledRuleIds: ['RIA-E'] };
  const results = assessReviewIntegrity([rev0, rev1, rev2], opts);
  results.forEach((result) => {
    assert.deepEqual(ruleIds(result), ['RIA-E']);
    assert.equal(result.triggeredRules.length, 1);
    assert.equal(result.triggeredRules[0].matchedReviews.length, 2);
  });
});

test('RIA-F is disabled by default', () => {
  const revA = { reviewIndex: 0, text: 'Highly recommended product, great value.' };
  const revB = { reviewIndex: 1, text: 'Highly recommended product, great value.' };
  const results = assessReviewIntegrity([revA, revB]);
  assert.deepEqual(ruleIds(results[0]), []);
  assert.deepEqual(ruleIds(results[1]), []);
});

test('RIA-F detects distinctive product-specific phrase sharing when enabled', () => {
  const revA = { reviewIndex: 0, text: 'This compact sensor captures fine grain details under low light.' };
  const revB = { reviewIndex: 1, text: 'This compact sensor captures fine grain details under low light conditions.' };
  const opts = { enabledRuleIds: ['RIA-F'] };
  const results = assessReviewIntegrity([revA, revB], opts);
  assert.deepEqual(ruleIds(results[0]), ['RIA-F']);
  assert.deepEqual(ruleIds(results[1]), ['RIA-F']);
  for (const result of results) {
    assert.equal(result.triggeredRules.length, 1);
    assert.equal(result.triggeredRules.filter((rule) => rule.id === 'RIA-F').length, 1);
    assert.ok(result.triggeredRules[0].matchedPhrases.length > 0);
    assert.equal(
      new Set(result.triggeredRules[0].matchedPhrases).size,
      result.triggeredRules[0].matchedPhrases.length,
    );
    assert.ok(result.triggeredRules[0].matchedPhrases.every((phrase) => (
      phrase.split(' ').length >= 3 && phrase.split(' ').length <= 6
    )));
  }
  assert.ok(results[0].triggeredRules[0].matchedPhrases.includes(
    'compact sensor captures fine grain details',
  ));
});

test('RIA-F ignores boilerplate phrases', () => {
  const revA = { reviewIndex: 0, text: 'Item arrived in good condition and was well packaged.' };
  const revB = { reviewIndex: 1, text: 'The item arrived in good condition, thank you.' };
  const opts = { enabledRuleIds: ['RIA-F'] };
  const results = assessReviewIntegrity([revA, revB], opts);
  assert.deepEqual(ruleIds(results[0]), []);
  assert.deepEqual(ruleIds(results[1]), []);
});

test('RIA-F boilerplate overlaps do not become template evidence', () => {
  const reviews = [
    { reviewIndex: 0, text: 'The item arrived in good condition today.' },
    { reviewIndex: 1, text: 'Our item arrived in good condition today.' },
  ];
  const results = assessReviewIntegrity(reviews, { enabledRuleIds: ['RIA-F'] });
  assert.deepEqual(results.map(ruleIds), [[], []]);
});

test('RIA-E and RIA-F can be enabled together', () => {
  const revA = { reviewIndex: 0, text: 'The item arrived quickly and works as described.' };
  const revB = { reviewIndex: 1, text: 'The item arrived quickly and works as described.' };
  const revC = {
    reviewIndex: 2,
    text: 'This compact sensor captures fine grain details under low light. The rechargeable battery lasts through a full workday, and the lens stays clear.',
  };
  const revD = {
    reviewIndex: 3,
    text: 'This compact sensor captures fine grain details under low light conditions. The outdoor housing is weather sealed, and the night mode stays balanced.',
  };
  const opts = { enabledRuleIds: ['RIA-E', 'RIA-F'] };
  const results = assessReviewIntegrity([revA, revB, revC, revD], opts);
  // The repeated generic battery wording matches only RIA-E; distinctive templates match RIA-F.
  assert.deepEqual(ruleIds(results[0]), ['RIA-E']);
  assert.deepEqual(ruleIds(results[1]), ['RIA-E']);
  assert.deepEqual(ruleIds(results[2]), ['RIA-F']);
  assert.deepEqual(ruleIds(results[3]), ['RIA-F']);
  assert.deepEqual(results[0].evaluatedRuleIds, ['RIA-E', 'RIA-F']);
});

test('changing, disabling, and re-enabling RIA preserves the latest selected rules', () => {
  const selectedRules = toggleReviewIntegrityRuleSelection(DEFAULT_RIA_RULE_IDS, 'RIA-A');
  const latestRules = toggleReviewIntegrityRuleSelection(selectedRules, 'RIA-E');
  let reviewIntegrityEnabled = true;
  reviewIntegrityEnabled = false;
  assert.equal(reviewIntegrityEnabled, false);
  assert.deepEqual(latestRules, ['RIA-B', 'RIA-C', 'RIA-D', 'RIA-E']);
  reviewIntegrityEnabled = true;
  assert.equal(reviewIntegrityEnabled, true);
  const result = assessReviewIntegrity([
    { reviewIndex: 0, text: 'Excellent battery life and performance, lasts all day.' },
    { reviewIndex: 1, text: 'Excellent battery life and performance, lasts all day.' },
  ], { enabledRuleIds: latestRules });

  assert.deepEqual(latestRules, ['RIA-B', 'RIA-C', 'RIA-D', 'RIA-E']);
  assert.deepEqual(result[0].evaluatedRuleIds, latestRules);
  assert.deepEqual(toggleReviewIntegrityRuleSelection(latestRules, 'RIA-E'), selectedRules);
});

test('RIA-F does not flag ordinary shared review wording', () => {
  const reviews = [
    { reviewIndex: 0, text: 'The product is good and works well for my needs.' },
    { reviewIndex: 1, text: 'This product is good and works well for daily use.' },
  ];
  const results = assessReviewIntegrity(reviews, { enabledRuleIds: ['RIA-F'] });
  assert.deepEqual(results.map(ruleIds), [[], []]);
});

test('RIA-F does not flag the shared battery wording without distinctive context', () => {
  const reviews = [
    { reviewIndex: 0, text: 'The battery lasts all day and works well' },
    { reviewIndex: 1, text: 'Battery lasts all day on this product' },
  ];
  const results = assessReviewIntegrity(reviews, { enabledRuleIds: ['RIA-F'] });
  assert.deepEqual(results.map(ruleIds), [[], []]);
});

test('RIA-F does not treat common battery-performance wording as distinctive', () => {
  const reviews = [
    { reviewIndex: 0, text: 'Excellent battery life and performance, lasts all day.' },
    { reviewIndex: 1, text: 'Excellent battery life and performance, lasts all day.' },
  ];
  const results = assessReviewIntegrity(reviews, { enabledRuleIds: ['RIA-F'] });
  assert.deepEqual(results.map(ruleIds), [[], []]);
});
