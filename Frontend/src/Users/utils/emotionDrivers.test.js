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

test('emotion keywords preserve source-grounded phrases with matching sentiment', () => {
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

  assert.ok(!keywords.includes('almost perfect'));
  assert.ok(keywords.includes('server issues'));
  assert.ok(keywords.includes('keeps crashing'));
  assert.ok(keywords.some((keyword) => keyword.includes('never replied')));
  assert.ok(keywords.includes('not worth it'));
  assert.ok(!keywords.some((keyword) => ['perfect', 'crashing', 'replied', 'worth'].includes(keyword)));
});

test('mixed-sentiment review keeps positive and negative evidence separate for predicted emotion', () => {
  const review = "Nice place but not good for vacation /outing coz it doesn't have any cottage";
  const results = [
    { category: 1, emotionDrivers: ['nice place', 'good'] },
    { category: 2, emotionDrivers: ['nice place', 'good', 'cottage'] },
  ];

  const positiveEvidence = getSvmEmotionKeywords(results, 1, [review, review]);
  const sadEvidence = getSvmEmotionKeywords(results, 2, [review, review]);

  assert.ok(positiveEvidence.includes('Nice place'));
  assert.ok(!positiveEvidence.includes('not good'));
  assert.ok(sadEvidence.includes('not good'));
  assert.ok(!sadEvidence.includes('Nice place'));
  assert.ok(!sadEvidence.includes('good'));
  assert.ok(sadEvidence.every((phrase) => review.includes(phrase)));
});

test('Sad evidence uses source polarity when SVM drivers point at a neutral phrase', () => {
  const review = "Nice place but not good for vacation /outing coz it doesn't have any cottage";

  const sadEvidence = getSvmEmotionKeywords(
    [{ category: 2, emotionDrivers: ['cottage'] }],
    2,
    [review],
  );

  assert.ok(sadEvidence.includes('not good'));
  assert.ok(!sadEvidence.includes('Nice place'));
  assert.ok(sadEvidence.every((phrase) => review.includes(phrase)));
});

test('emotion evidence is empty when the source has no phrase-level polarity evidence', () => {
  assert.deepEqual(
    getSvmEmotionKeywords(
      [{ category: 2, emotionDrivers: ['left'] }],
      2,
      ['The table is on the left.'],
    ),
    [],
  );
});

test('the supplied positive Taglish review keeps an honest empty Sad-evidence fallback', () => {
  const review = (
    'item is so nice. mahaba yung strap and yung tela neto malambot. '
    + 'and its cheap so i like it. tysm'
  );

  assert.deepEqual(
    getSvmEmotionKeywords(
      [{ category: 2, emotionDrivers: ['mahaba', 'strap', 'like', 'malambot'] }],
      2,
      [review],
    ),
    [],
  );
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
    ['Lag'],
  );
});

test('overlapping anger evidence phrases merge into one source-grounded phrase', () => {
  const review = 'bugs and completely broken moments';
  const evidence = getSvmEmotionKeywords(
    [
      { category: 3, emotionDrivers: ['bugs', 'completely broken', 'broken moments'] },
      { category: 3, emotionDrivers: ['bugs', 'completely broken', 'broken moments'] },
    ],
    3,
    [review, review],
  );

  assert.deepEqual(evidence, ['bugs and completely broken moments']);
  assert.ok(evidence.every((phrase) => review.includes(phrase)));
});

test('mixed Steam review keeps negative update and server evidence separate from positive context', () => {
  const review = `Been playing this game for almost a year now, and I could say it's 'almost' perfect. The gameplay is as expected from a hack and slash, lots of mini games and events to grind on so you never run out of things to do in-game, and the gacha can be forgiving (sometimes). The downside is the update, everytime. Though it's not as frequent as other games (2 months or so between each update), the update is so huge it feels as if you're re-installing the game. The network and server issues don't help`;
  const negativeEvidence = getSvmEmotionKeywords(
    [{ category: 2, emotionDrivers: ['update', 'issues'] }],
    2,
    [review],
  );
  const positiveEvidence = getSvmEmotionKeywords(
    [{ category: 1, emotionDrivers: ['perfect', 'gacha'] }],
    1,
    [review],
  );

  assert.ok(negativeEvidence.includes('downside is the update'));
  assert.ok(negativeEvidence.includes('update is so huge'));
  assert.ok(negativeEvidence.includes('network and server issues'));
  assert.ok(positiveEvidence.includes("'almost' perfect"));
  assert.ok(negativeEvidence.every((phrase) => review.includes(phrase)));
  assert.ok(positiveEvidence.every((phrase) => review.includes(phrase)));
  assert.ok(!negativeEvidence.includes('almost perfect'));
});
