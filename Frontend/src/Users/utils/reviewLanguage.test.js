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

test('skips Korean reviews, including short text and markup-heavy source text', async () => {
  const longKorean = '이 게임은 정말 재미있고 그래픽도 훌륭합니다. 다시 플레이하고 싶어요.';
  const shortKorean = '정말 좋아요';
  const markupHeavyKorean = '<div class="review"><b>이 게임은 정말 재미있어요</b><br><span>다시 하고 싶습니다</span></div>';
  const result = await prepareReviewsForAnalysis([
    { id: 'ko-long', text: longKorean },
    { id: 'ko-short', text: shortKorean },
    { id: 'ko-markup', text: markupHeavyKorean },
  ]);

  assert.deepEqual(result.reviews, []);
  assert.deepEqual(result.skippedReviews.map(({ review, detectedLanguage, detectionMethod }) => ({
    review,
    detectedLanguage,
    detectionMethod,
  })), [
    { review: { id: 'ko-long', text: longKorean }, detectedLanguage: 'ko', detectionMethod: 'cld3+script' },
    { review: { id: 'ko-short', text: shortKorean }, detectedLanguage: 'ko', detectionMethod: 'cld3+script' },
    { review: { id: 'ko-markup', text: markupHeavyKorean }, detectedLanguage: 'ko', detectionMethod: 'cld3+script' },
  ]);
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
  assert.equal(result.supportedReviewCount, reviews.length);
  assert.equal(result.uncertainReviewCount, 0);
  assert.deepEqual(
    await Promise.all(reviews.map(identifyReviewLanguage)).then((decisions) => (
      decisions.map(({ status }) => status)
    )),
    ['supported', 'supported', 'supported'],
  );
});

test('confident unsupported Latin-language detection is not overridden by common Filipino tokens', async () => {
  const review = 'Este producto es muy bueno y fácil de usar. Ang at sa ng.';
  const decision = await identifyReviewLanguage(review);
  const result = await prepareReviewsForAnalysis([review]);

  assert.equal(decision.status, 'unsupported');
  assert.equal(decision.language, 'es');
  assert.deepEqual(result.reviews, []);
  assert.equal(result.skippedReviews[0].reason, 'unsupported_language');
});

test('preserves mixed-language text when language identification is uncertain', async () => {
  const review = 'Ang ganda ng product, and it works very well.';
  const mixedScriptReview = 'The gameplay is great and the controls are responsive. I would recommend it. 정말 좋아요.';

  assert.equal((await identifyReviewLanguage(review)).status, 'uncertain');
  assert.deepEqual(await prepareReviewsForAnalysis([review]), {
    reviews: [review],
    skippedReviews: [],
    supportedReviewCount: 0,
    uncertainReviewCount: 1,
  });
  const mixedScriptDecision = await identifyReviewLanguage(mixedScriptReview);
  assert.equal(mixedScriptDecision.status, 'supported');
  assert.equal(mixedScriptDecision.language, 'en');
  assert.ok(mixedScriptDecision.confidence >= 0.75);
  assert.deepEqual(await prepareReviewsForAnalysis([mixedScriptReview]), {
    reviews: [mixedScriptReview],
    skippedReviews: [],
    supportedReviewCount: 1,
    uncertainReviewCount: 0,
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
    supportedReviewCount: 0,
    uncertainReviewCount: 2,
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

test('rejects clear Indonesian examples including short, mixed, and near-threshold text', async () => {
  const indonesianReviews = [
    'Bagus banget!',
    'Tidak sesuai',
    'Barang bagus, harga murah.',
    'Produk ini sangat bagus dan kualitasnya sangat baik. Pengiriman cepat dan sesuai deskripsi.',
    'The quality is bagus, tapi pengiriman sangat lambat.',
    'Great product, barangnya bagus dan kualitasnya sangat baik.',
    'Great product, barang sesuai deskripsi, tapi delivery was late.',
    'Murah, bagus, mantap, cocok untuk kebutuhan sehari-hari.',
  ];
  const decisions = await Promise.all(indonesianReviews.map(identifyReviewLanguage));
  const prepared = await prepareReviewsForAnalysis(indonesianReviews);

  assert.deepEqual(decisions.map(({ status }) => status), indonesianReviews.map(() => 'unsupported'));
  assert.deepEqual(prepared.reviews, []);
  assert.equal(prepared.skippedReviews.length, indonesianReviews.length);
  assert.ok(prepared.skippedReviews.every((entry) => (
    entry.status === 'skipped' &&
    entry.reason === 'unsupported_language' &&
    entry.detectedLanguage === 'id'
  )));
  assert.equal(decisions[0].detectionMethod, 'indonesian_lexicon');
  assert.equal(decisions[2].detectionMethod, 'cld3+indonesian_lexicon');
  assert.equal(prepared.skippedReviews[0].detectionMethod, 'indonesian_lexicon');
});

test('preserves English, Filipino, natural Taglish, and short uncertain text', async () => {
  const supportedAndUncertainReviews = [
    'The product is excellent and easy to use. I am very happy with this purchase.',
    'Maganda ang produkto at madaling gamitin. Masaya ako sa pagbili nito.',
    'Ang ganda ng product na ito, easy to use at sulit talaga.',
    'Okay siya, mabilis dumating, and the quality is really good.',
    'Ang ganda ng barang, mura, and the quality is really good.',
    'Ang ganda ng product, tapi kualitasnya sangat buruk.',
    'Nice!',
    '👍❤️',
  ];
  const prepared = await prepareReviewsForAnalysis(supportedAndUncertainReviews);

  assert.deepEqual(prepared.reviews, supportedAndUncertainReviews);
  assert.deepEqual(prepared.skippedReviews, []);
  assert.equal(prepared.supportedReviewCount, 3);
  assert.equal(prepared.uncertainReviewCount, 5);
});

test('keeps short wording that does not provide decisive Indonesian evidence', async () => {
  const ambiguousReviews = ['Bagus!', 'Barangnya bagus!'];
  const prepared = await prepareReviewsForAnalysis(ambiguousReviews);

  assert.ok((await Promise.all(ambiguousReviews.map(identifyReviewLanguage)))
    .every(({ status }) => status === 'uncertain'));
  assert.deepEqual(prepared.reviews, ambiguousReviews);
  assert.deepEqual(prepared.skippedReviews, []);
});

test('strips markup before detection while preserving the original review record', async () => {
  const review = {
    id: 'markup-en',
    text: '<div class="review"><span class="author">Review</span><p>The product is excellent and easy to use. I am very happy with this purchase.</p></div>',
  };
  const decision = await identifyReviewLanguage(review);
  const result = await prepareReviewsForAnalysis([review]);

  assert.equal(decision.status, 'supported');
  assert.equal(decision.language, 'en');
  assert.strictEqual(result.reviews[0], review);
  assert.deepEqual(result.skippedReviews, []);
});
