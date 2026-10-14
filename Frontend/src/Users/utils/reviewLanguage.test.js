import assert from 'node:assert/strict';
import test from 'node:test';

import { identifyReviewLanguage, prepareReviewsForAnalysis } from './reviewLanguage.js';

test('skips confidently identified Japanese and Chinese reviews', async () => {
  const japanese = 'この商品はとても良いです。使いやすくて満足しています。品質も高く、また購入したいです。';
  const chinese = '这个产品质量很好，使用方便，非常满意。这个产品质量很好，使用方便，非常满意。';

  const result = await prepareReviewsForAnalysis([
    { id: 'ja-1', text: japanese },
    { id: 'zh-1', text: chinese },
  ]);

  assert.deepEqual(result.reviews, []);
  assert.equal(result.skippedReviews.length, 2);
  assert.ok(result.skippedReviews.every((entry) => (
    entry.status === 'skipped' &&
    entry.reason === 'unsupported_language' &&
    entry.confidence >= 0.75
  )));
});

test('preserves English, Filipino, and Taglish', async () => {
  const reviews = [
    'The product is great and easy to use. I am very happy with it.',
    'Maganda ang produkto at madaling gamitin. Masaya ako sa pagbili nito.',
    'Ang ganda ng product na ito, easy to use at sulit talaga.',
  ];

  const result = await prepareReviewsForAnalysis(reviews);

  assert.deepEqual(result.reviews, reviews);
  assert.deepEqual(result.skippedReviews, []);
  assert.deepEqual(
    await Promise.all(reviews.map(identifyReviewLanguage)).then((decisions) => (
      decisions.map(({ status }) => status)
    )),
    ['supported', 'supported', 'supported'],
  );
});

test('preserves mixed-language text when language identification is uncertain', async () => {
  const review = 'Ang ganda ng product, and it works very well.';

  assert.equal((await identifyReviewLanguage(review)).status, 'uncertain');
  assert.deepEqual(await prepareReviewsForAnalysis([review]), {
    reviews: [review],
    skippedReviews: [],
  });
});

test('preserves unsupported-language guesses on short text and emoji-only reviews', async () => {
  const shortReview = { id: 'short-1', text: 'Nice!' };
  const emojiReview = { id: 'emoji-1', text: '👍❤️' };
  const result = await prepareReviewsForAnalysis([shortReview, emojiReview]);

  assert.equal((await identifyReviewLanguage(shortReview)).status, 'uncertain');
  assert.equal((await identifyReviewLanguage(emojiReview)).status, 'uncertain');
  assert.deepEqual(result, {
    reviews: [shortReview, emojiReview],
    skippedReviews: [],
  });
});

test('skips a confidently identified unsupported Latin-script language', async () => {
  const review = 'Este producto es muy bueno y fácil de usar. Estoy muy satisfecho con la compra.';
  const decision = await identifyReviewLanguage(review);
  const result = await prepareReviewsForAnalysis([review]);

  assert.equal(decision.status, 'unsupported');
  assert.deepEqual(result.reviews, []);
  assert.equal(result.skippedReviews[0].reason, 'unsupported_language');
});
