import assert from 'node:assert/strict';
import test from 'node:test';
import { getEmotionResultDisplay } from './emotionResultDisplay.js';

test('emotion result display preserves valid evidence phrases', () => {
  const result = getEmotionResultDisplay(
    { label: 'Happy', count: 2, model: 'SVM' },
    ['This is great', 'love the update'],
  );

  assert.deepEqual(result, {
    model: 'SVM',
    evidencePhrases: ['This is great', 'love the update'],
    evidenceMessage: null,
  });
});

test('emotion result display explains when no reliable evidence phrase is available', () => {
  const result = getEmotionResultDisplay(
    { label: 'Happy', count: 1, model: 'SVM' },
    [],
  );

  assert.equal(
    result.evidenceMessage,
    'No specific phrase could be identified as supporting this prediction.',
  );
});

test('emotion result display shows SVM as the model, not as a confidence score', () => {
  const result = getEmotionResultDisplay(
    { label: 'Happy', count: 1, model: 'SVM' },
    [],
  );

  assert.equal(result.model, 'SVM');
  assert.equal('confidence' in result, false);
});

test('legacy SVM model metadata displays as a model and unverified scores are not shown', () => {
  const legacyResult = getEmotionResultDisplay(
    { label: 'Happy', count: 1, confidence: 'SVM' },
    [],
  );
  const unverifiedScore = getEmotionResultDisplay(
    { label: 'Happy', count: 1, confidence: '98.4%' },
    [],
  );

  assert.equal(legacyResult.model, 'SVM');
  assert.equal(unverifiedScore.model, null);
});
