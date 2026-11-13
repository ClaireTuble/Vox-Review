import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessReviewIntegrity,
  REVIEW_INTEGRITY_RULE_VERSION,
  REVIEW_INTEGRITY_SCHEMA_VERSION,
  REVIEW_INTEGRITY_RULES,
  ALL_RIA_RULE_IDS,
  DEFAULT_RIA_RULE_IDS,
} from './reviewIntegrityAssessment.js';

function assess(text, reviewIndex = 0, options) {
  return assessReviewIntegrity([{ reviewIndex, text }], options)[0];
}

function ruleIds(result) {
  return result.triggeredRules.map(({ id }) => id);
}

function punctuationDensitySample(characterCount) {
  const tokens = characterCount < 50
    ? ['abcdefg', 'hij', 'klm', 'nop', 'qrs', 'tuv', 'wxy', 'zab', 'cde']
    : ['abcde', 'fghij', 'klmno', 'pqrst', 'uvwxy', 'zabcd', 'efghi', 'jklmn', 'opqrs'];
  if (characterCount % 2 === 0) tokens[tokens.length - 1] += 'f';
  return tokens.join('.');
}

test('RIA-A detects explicit English, Filipino, and Taglish incentive relationships', () => {
  for (const text of [
    'Seller offered a voucher if I left a five-star review.',
    'May voucher po kapalit ng 5-star rating.',
    'Freebie daw basta mag-5 star.',
    'Kung magbigay ka ng 5 stars, may freebie.',
    'Kapag mag-iwan ng magandang review, may voucher.',
  ]) {
    const result = assess(text);
    assert.deepEqual(ruleIds(result), ['RIA-A']);
    assert.match(result.triggeredRules[0].explanation, /does not show whether the reviewer accepted/i);
  }
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-A treats quoted and reported requests as mentions, not acceptance', () => {
  const result = assess('Seller messaged, "5 stars kapalit ng voucher"; I declined.');
  assert.deepEqual(ruleIds(result), ['RIA-A']);
  assert.match(result.triggeredRules[0].explanation, /does not show whether the reviewer accepted/i);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-A suppresses directly negated solicitation and requires an exchange relationship', () => {
  for (const text of [
    'No voucher was offered for a five-star review.',
    'Hindi nanghingi si seller ng 5 stars kapalit ng voucher.',
    'May voucher po ako at nag-iwan ng review.',
    'Sulit, recommended, best, at maganda ang item.',
  ]) {
    assert.deepEqual(ruleIds(assess(text)), []);
  }
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-B detects repeated word and repeated phrase thresholds', () => {
  assert.deepEqual(ruleIds(assess('Excellent excellent excellent excellent')), ['RIA-B']);
  assert.deepEqual(ruleIds(assess('good quality, good quality, good quality')), ['RIA-B']);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-B does not flag ordinary reduplication, common Taglish, or below-threshold repetition', () => {
  for (const text of [
    'sari-sari, iba-iba, mabilis-bilis, okay na okay',
    'sari-sari sari-sari sari-sari sari-sari araw-araw araw-araw araw-araw',
    'Very very good po, thank you thank you.',
    'ganda ganda ganda',
  ]) {
    assert.deepEqual(ruleIds(assess(text)), []);
  }
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-B uses eligible tokens as the repetition ratio denominator', () => {
  const text = `${'ganda '.repeat(4)}${'po '.repeat(20)}`;
  assert.deepEqual(ruleIds(assess(text)), ['RIA-B']);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-B excludes repeated stop words and preserves internal apostrophes and hyphens', () => {
  assert.deepEqual(ruleIds(assess('po po po po naman naman naman naman')), []);
  assert.deepEqual(ruleIds(assess("seller's well-made sari-sari item")), []);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-C triggers at five identical Unicode letters, but not four', () => {
  assert.deepEqual(ruleIds(assess('soooo good')), []);
  assert.deepEqual(ruleIds(assess('sooooo good')), ['RIA-C']);
  assert.deepEqual(ruleIds(assess('ááááá')), ['RIA-C']);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-C does not count punctuation, digits, or repeated emoji', () => {
  for (const text of ['!!!!!', '11111', '😀😀😀😀😀', 'gandaaa po 😊😊']) {
    assert.equal(ruleIds(assess(text)).includes('RIA-C'), false);
  }
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-D detects a four-character punctuation run but not a three-character run', () => {
  assert.deepEqual(ruleIds(assess('Ganda nito ah!!!!')), ['RIA-D']);
  assert.equal(ruleIds(assess('Ganda nito ah!!!')).includes('RIA-D'), false);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-D applies the minimum length, punctuation-count, and density boundaries', () => {
  assert.equal(ruleIds(assess(punctuationDensitySample(39))).includes('RIA-D'), false);
  assert.deepEqual(ruleIds(assess(punctuationDensitySample(40))), ['RIA-D']);
  assert.deepEqual(ruleIds(assess(punctuationDensitySample(53))), ['RIA-D']);
  assert.equal(ruleIds(assess(punctuationDensitySample(54))).includes('RIA-D'), false);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('RIA-D ignores ordinary ellipses, hyphens, apostrophes, and expressive Taglish punctuation', () => {
  for (const text of [
    "Well-made item... it's good, salamat po!",
    'Ganda!!! Thank you po 😊😊',
  ]) {
    assert.equal(ruleIds(assess(text)).includes('RIA-D'), false);
  }
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('only exact known sanitizer placeholders are removed from rule input', () => {
  assert.deepEqual(ruleIds(assess('[NAME] [EMAIL] [PHONE] [ORDER_ID] [ADDRESS]')), []);
  assert.deepEqual(ruleIds(assess('[custom] aaaaa')), ['RIA-C']);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('assessment returns one schema-safe result per input and preserves reviewIndex order', () => {
  const input = [
    { reviewIndex: 7, text: 'May voucher kapalit ng 5-star rating.' },
    { reviewIndex: 2, text: 'Salamat po, okay siya.' },
  ];
  const results = assessReviewIntegrity(input);

  assert.equal(results.length, input.length);
  assert.deepEqual(results.map(({ reviewIndex }) => reviewIndex), [7, 2]);
  assert.equal(results[0].assessmentStatus, 'Patterns Detected');
  assert.equal(results[1].assessmentStatus, 'No Selected Patterns Detected');
  assert.equal(results[0].ruleVersion, REVIEW_INTEGRITY_RULE_VERSION);
  assert.deepEqual(results[0].evaluatedRuleIds, ['RIA-A', 'RIA-B', 'RIA-C', 'RIA-D']);
  assert.deepEqual(results[1].evaluatedRuleIds, ['RIA-A', 'RIA-B', 'RIA-C', 'RIA-D']);
  assert.deepEqual(Object.keys(results[0]).sort(), [
    'assessmentStatus', 'evaluatedRuleIds', 'reviewIndex', 'ruleVersion', 'triggeredRules',
  ]);
  assert.equal(results.schemaVersion, REVIEW_INTEGRITY_SCHEMA_VERSION);
  assert.equal(results.ruleVersion, REVIEW_INTEGRITY_RULE_VERSION);
  assert.deepEqual(results.activeRuleIds, ['RIA-A', 'RIA-B', 'RIA-C', 'RIA-D']);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('missing, invalid, and empty text return Unable to Assess without flags and with empty evaluatedRuleIds', () => {
  const results = assessReviewIntegrity([
    { reviewIndex: 0 },
    { reviewIndex: 1, text: null },
    { reviewIndex: 2, text: '  [EMAIL] [NAME]  ' },
  ]);

  assert.deepEqual(results.map(({ assessmentStatus }) => assessmentStatus), [
    'Unable to Assess', 'Unable to Assess', 'Unable to Assess',
  ]);
  assert.deepEqual(results.map(({ assessmentReason }) => assessmentReason), [
    'missing_text', 'invalid_text', 'empty_after_sanitization',
  ]);
  assert.ok(results.every(({ triggeredRules }) => triggeredRules.length === 0));
  assert.ok(results.every(({ evaluatedRuleIds }) => evaluatedRuleIds.length === 0));
  assert.deepEqual(Object.keys(results[0]).sort(), [
    'assessmentReason', 'assessmentStatus', 'evaluatedRuleIds', 'reviewIndex', 'ruleVersion', 'triggeredRules',
  ]);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('assessment is deterministic, does not mutate input, or retain review text or PII', () => {
  const input = [{
    reviewIndex: 4,
    text: 'Contact [EMAIL]; seller offered voucher for a five-star review.',
  }];
  const snapshot = structuredClone(input);
  const first = assessReviewIntegrity(input);

  assert.deepEqual(assessReviewIntegrity(input), first);
  assert.deepEqual(input, snapshot);
  assert.equal(JSON.stringify(first).includes(input[0].text), false);
  assert.equal(JSON.stringify(first).includes('EMAIL'), false);
  assert.equal(JSON.stringify(first).includes('voucher'), false);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('assessment rejects invalid or duplicate review indexes', () => {
  assert.throws(() => assessReviewIntegrity([{ reviewIndex: -1, text: 'review' }]), /reviewIndex/);
  assert.throws(() => assessReviewIntegrity([
    { reviewIndex: 1, text: 'first' },
    { reviewIndex: 1, text: 'second' },
  ]), /reviewIndex/);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('rule selection: evaluates only enabled rules and records evaluatedRuleIds accurately', () => {
  const text = 'Excellent excellent excellent excellent sooooo good!!!!';
  // Text triggers RIA-B (repetition), RIA-C (elongation), and RIA-D (punctuation)

  // With all 4 rules enabled (default)
  const defaultResult = assess(text, 0);
  assert.deepEqual(ruleIds(defaultResult), ['RIA-B', 'RIA-C', 'RIA-D']);
  assert.deepEqual(defaultResult.evaluatedRuleIds, ['RIA-A', 'RIA-B', 'RIA-C', 'RIA-D']);

  // Disabling RIA-C and RIA-D: only RIA-B should trigger
  const customResult1 = assess(text, 0, { enabledRuleIds: ['RIA-A', 'RIA-B'] });

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});
  assert.deepEqual(ruleIds(customResult1), ['RIA-B']);
  assert.deepEqual(customResult1.evaluatedRuleIds, ['RIA-A', 'RIA-B']);

  // Disabling RIA-B and RIA-D: only RIA-C should trigger
  const customResult2 = assess(text, 0, { enabledRuleIds: ['RIA-C'] });

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});
  assert.deepEqual(ruleIds(customResult2), ['RIA-C']);
  assert.deepEqual(customResult2.evaluatedRuleIds, ['RIA-C']);

  // Disabling all matching rules (enabling only RIA-A): no patterns detected
  const customResult3 = assess(text, 0, { enabledRuleIds: ['RIA-A'] });

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});
  assert.deepEqual(ruleIds(customResult3), []);
  assert.equal(customResult3.assessmentStatus, 'No Selected Patterns Detected');
  assert.deepEqual(customResult3.evaluatedRuleIds, ['RIA-A']);
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('rule selection: throws RangeError when no rules are enabled', () => {
  assert.throws(
    () => assessReviewIntegrity([{ reviewIndex: 0, text: 'Good product' }], { enabledRuleIds: [] }),
    RangeError,
  );
  assert.throws(
    () => assessReviewIntegrity([{ reviewIndex: 0, text: 'Good product' }], { enabledRuleIds: ['UNKNOWN_RULE'] }),
    RangeError,
  );
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});

test('metadata export integrity: schema 2.0, rules map, and ALL_RIA_RULE_IDS', () => {
  assert.equal(REVIEW_INTEGRITY_SCHEMA_VERSION, '2.0');
  assert.equal(REVIEW_INTEGRITY_RULE_VERSION, '1.0.0');
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A', 'RIA-B', 'RIA-C', 'RIA-D']);
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A', 'RIA-B', 'RIA-C', 'RIA-D', 'RIA-E', 'RIA-F']);
  assert.equal(REVIEW_INTEGRITY_RULES.INCENTIVIZED_SOLICITATION.plainName, 'Incentivized Review Mentions');
  assert.equal(REVIEW_INTEGRITY_RULES.WITHIN_REVIEW_REPETITION.plainName, 'Repeated Words & Phrases');
  assert.equal(REVIEW_INTEGRITY_RULES.CHARACTER_ELONGATION.plainName, 'Character Elongation');
  assert.equal(REVIEW_INTEGRITY_RULES.EXCESSIVE_PUNCTUATION.plainName, 'Excessive Punctuation');
});

test('ALL_RIA_RULE_IDS includes all six rules and DEFAULT_RIA_RULE_IDS includes only A-D', () => {
  assert.deepEqual(ALL_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D','RIA-E','RIA-F']);
  assert.deepEqual(DEFAULT_RIA_RULE_IDS, ['RIA-A','RIA-B','RIA-C','RIA-D']);
});
