import assert from 'node:assert/strict';
import test from 'node:test';

import { getSavedAnalysisSummary } from './savedAnalysisSummary.js';

test('calculates the dominant emotion percentage from valid per-review predictions', () => {
  const summary = getSavedAnalysisSummary({
    dominantEmotion: 'Happy',
    percentage: '0%',
    reviews: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
    reviewAnalysis: [
      { category: 3 },
      { category: 1 },
      { category: 3 },
    ],
  });

  assert.deepEqual(summary, { dominantEmotion: 'Anger', percentage: '67%' });
});

test('uses saved emotion quotes when per-review analysis is unavailable', () => {
  const summary = getSavedAnalysisSummary({
    percentage: 'not-a-percentage',
    reviews: [{ text: 'one' }, { text: 'two' }],
    emotionData: {
      quotes: [{ emotion: 'Sad' }, { category: 2 }],
    },
  });

  assert.deepEqual(summary, { dominantEmotion: 'Sad', percentage: '100%' });
});

test('uses valid aggregate emotion counts when per-review predictions are unavailable', () => {
  const summary = getSavedAnalysisSummary({
    emotionData: {
      emotions: [
        { label: 'Happy', count: 2 },
        { category: 3, count: 1 },
      ],
    },
  });

  assert.deepEqual(summary, { dominantEmotion: 'Happy', percentage: '67%' });
});

test('returns no summary when prediction data is missing', () => {
  assert.equal(getSavedAnalysisSummary({
    dominantEmotion: 'Happy',
    percentage: '72%',
    reviews: [{ text: 'one' }],
  }), null);
});

test('does not trust malformed percentages or incomplete prediction data', () => {
  assert.equal(getSavedAnalysisSummary({
    dominantEmotion: 'Happy',
    percentage: '0%',
    reviews: [{ text: 'one' }, { text: 'two' }],
    reviewAnalysis: [{ category: 1 }, { category: 'unknown' }],
    emotionData: { quotes: [{ category: 1 }] },
  }), null);
});
