import assert from 'node:assert/strict';
import test from 'node:test';
import { filterEmotionDriver, getSvmEmotionKeywords } from './emotionDrivers.js';

test('emotion drivers remove pronouns and reporting filler while keeping meaningful terms', () => {
  assert.equal(filterEmotionDriver('She said the game keeps crashing.'), 'crashing');
  assert.equal(filterEmotionDriver('Their refund request was ignored.'), 'refund request ignored');
  assert.equal(filterEmotionDriver('It is very slow after the update.'), 'slow update');
  assert.equal(filterEmotionDriver('The game crashes every time I open it.'), 'crashes open');
});

test('emotion keyword aggregation filters before ranking and deduplicates per review', () => {
  const results = [
    { category: 3, emotionDrivers: ['the lag', 'lag', 'very slow'] },
    { category: 3, emotionDrivers: ['lag', 'excellent'] },
    { category: 1, emotionDrivers: ['the lag'] },
  ];

  assert.deepEqual(getSvmEmotionKeywords(results, 3), ['lag', 'excellent', 'slow']);
});

test('emotion drivers with no meaningful words return empty keywords for the existing fallback', () => {
  assert.deepEqual(
    getSvmEmotionKeywords([{ category: 2, emotionDrivers: ['he', 'the', 'very'] }], 2),
    [],
  );
});

test('emotion keywords prefer source-grounded phrases over isolated SVM driver words', () => {
  const reviews = [
    'This feels almost perfect, apart from the server issues.',
    'The huge update keeps crashing.',
    'Support never replied, so this is not worth it.',
  ];
  const results = [
    { category: 3, emotionDrivers: ['perfect', 'server issues'] },
    { category: 3, emotionDrivers: ['crashing'] },
    { category: 3, emotionDrivers: ['replied', 'worth'] },
  ];
  const keywords = getSvmEmotionKeywords(results, 3, reviews);

  assert.ok(keywords.includes('almost perfect'));
  assert.ok(keywords.includes('server issues'));
  assert.ok(keywords.includes('keeps crashing'));
  assert.ok(keywords.some((keyword) => keyword.includes('never replied')));
  assert.ok(keywords.includes('not worth it'));
  assert.ok(!keywords.some((keyword) => ['perfect', 'crashing', 'replied', 'worth'].includes(keyword)));
});

test('emotion keywords filter generic stop words and do not invent fallback terms', () => {
  assert.deepEqual(
    getSvmEmotionKeywords(
      [{ category: 3, emotionDrivers: ['the', 'very'] }],
      3,
      ['The game is very slow.'],
    ),
    [],
  );
  assert.deepEqual(
    getSvmEmotionKeywords(
      [{ category: 3, emotionDrivers: ['perfect'] }],
      3,
      ['The server has issues.'],
    ),
    [],
  );
});

test('emotion fallback keeps a meaningful source word when no phrase can be extracted', () => {
  assert.deepEqual(
    getSvmEmotionKeywords(
      [{ category: 3, emotionDrivers: ['lag'] }],
      3,
      ['Lag.'],
    ),
    ['lag'],
  );
});
