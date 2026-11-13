import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  sanitizeReviewText,
  sanitizeReviewsForAnalysis,
} from '../src/services/privacyRedaction.js';

const extensionRoot = new URL('./', import.meta.url);

test('every content-script manifest entry loads privacy redaction before content', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', extensionRoot), 'utf8'));
  const contentScripts = manifest.content_scripts.filter(({ js = [] }) => js.includes('content.js'));

  assert.ok(contentScripts.length > 0);
  for (const { js } of contentScripts) {
    assert.ok(js.indexOf('privacyRedaction.js') >= 0);
    assert.ok(js.indexOf('privacyRedaction.js') < js.indexOf('content.js'));
  }

  await Promise.all(contentScripts.flatMap(({ js }) => js.map(async (script) => {
    await assert.doesNotReject(readFile(new URL(script, extensionRoot)));
  })));
});

test('content script fails closed when privacy sanitization is missing or fails', async () => {
  const source = await readFile(new URL('content.js', extensionRoot), 'utf8');
  const sanitizerGuard = source.indexOf('const sanitizeReviews = globalThis.__voxreviewPrivacyRedaction?.sanitizeReviewsForAnalysis;');
  const sendPayload = source.indexOf('reviews: sanitizedReviews', sanitizerGuard);
  const fallback = source.includes('sanitizeReviewsForAnalysis?.(reviews) ?? reviews');

  assert.notEqual(sanitizerGuard, -1);
  assert.ok(sendPayload > sanitizerGuard);
  assert.equal(fallback, false);
  assert.match(source, /Privacy filtering is unavailable; review data was withheld\./);
  assert.match(source, /Privacy filtering failed; review data was withheld\./);
});

test('product media extraction resolves safe image URLs and rejects profile, unsafe, and video-only sources', async () => {
  const source = await readFile(new URL('content.js', extensionRoot), 'utf8');
  const helperStart = source.indexOf('function getProductImageMetadata(raw) {');
  const helperEnd = source.indexOf('function getCanonicalPageUrl(', helperStart);
  assert.notEqual(helperStart, -1);
  assert.ok(helperEnd > helperStart);
  const helperSource = source.slice(helperStart, helperEnd);
  const createExtractor = ({ metas = {}, images = {}, video = false } = {}) => {
    const context = {
      URL,
      document: {
        baseURI: 'https://store.example/products/1',
        querySelector(selector) {
          if (selector.includes('og:video')) return video ? {} : null;
          return metas[selector] || null;
        },
        querySelectorAll(selector) {
          return images[selector] || [];
        },
      },
    };
    runInNewContext(helperSource, context);
    return context.getProductImageMetadata;
  };
  const meta = (content) => ({ getAttribute: () => content });
  const extractOpenGraphImage = createExtractor({
    metas: { 'meta[property="og:image"]': meta('/images/product.jpg') },
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(extractOpenGraphImage({}))),
    { productImage: 'https://store.example/images/product.jpg', productMediaType: 'image' },
  );

  const extractDomImage = createExtractor({
    images: {
      'main img': [{
        currentSrc: '',
        getAttribute(name) {
          return name === 'alt' ? 'Product cover' : name === 'src' ? '/images/cover.jpg' : null;
        },
      }],
    },
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(extractDomImage({}))),
    { productImage: 'https://store.example/images/cover.jpg', productMediaType: 'image' },
  );

  const extractUnsafeImage = createExtractor({
    metas: { 'meta[property="og:image"]': meta('data:image/png;base64,AAAA') },
    images: {
      'main img': [{
        currentSrc: '',
        getAttribute(name) {
          return name === 'alt' ? 'Photo' : name === 'src' ? 'https://cdn.example/opaque.jpg' : null;
        },
        closest: () => ({ getAttribute: () => 'review-avatar' }),
      }],
    },
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(extractUnsafeImage({}))),
    { productImage: null, productMediaType: null },
  );

  const extractVideo = createExtractor({
    metas: { 'meta[property="og:type"]': meta('video.other') },
    video: true,
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(extractVideo({ productImage: 'https://cdn.example/poster.jpg' }))),
    { productImage: null, productMediaType: 'video' },
  );
});

test('content-script and frontend sanitizers apply the same masking and four-platform allowlist', async () => {
  const source = await readFile(new URL('privacyRedaction.js', extensionRoot), 'utf8');
  const context = {};
  runInNewContext(source, context);
  const frontendText = 'Hi Maria, call +63 917 123 4567 at 123 Rizal St; order no. ZX-12345.';
  const extensionText = context.__voxreviewPrivacyRedaction.sanitizeReviewText(frontendText);
  assert.equal(extensionText, sanitizeReviewText(frontendText));

  const rawReview = {
    id: 'persistent-review-id',
    reviewer: 'Private Person',
    text: 'Good item, email jane@example.com.',
    platform: 'shopee',
    helpfulCount: 8,
    helpfulnessMetric: 'review_likes',
    helpfulnessAvailable: true,
  };
  const sanitizedExtensionReview = context.__voxreviewPrivacyRedaction.sanitizeReviewsForAnalysis([rawReview])[0];
  assert.equal(sanitizedExtensionReview.helpfulCount, 8);
  assert.equal(sanitizedExtensionReview.helpfulnessMetric, 'review_likes');
  assert.equal(sanitizedExtensionReview.helpfulnessAvailable, true);
  assert.equal(sanitizedExtensionReview.id, undefined);
  assert.equal(sanitizedExtensionReview.reviewer, undefined);
  assert.deepEqual(
    JSON.parse(JSON.stringify([sanitizedExtensionReview])),
    sanitizeReviewsForAnalysis([rawReview]),
  );
});

test('Google Play payload preparation avoids undefined filter references and retries failed delivery', async () => {
  const source = await readFile(new URL('content.js', extensionRoot), 'utf8');
  const preparationStart = source.indexOf('      errorStage = "Review Payload Preparation";');
  const preparationEnd = source.indexOf('    } catch (err) {', preparationStart);
  assert.notEqual(preparationStart, -1);
  assert.ok(preparationEnd > preparationStart);

  const payloadPreparation = source.slice(preparationStart, preparationEnd);
  assert.doesNotMatch(payloadPreparation, /\bratingFilter\b/);
  assert.match(payloadPreparation, /type: "reviewsScraped"/);
  assert.ok(
    payloadPreparation.indexOf('lastSentSignature = signature;') >
      payloadPreparation.indexOf('if (!response || response.ok === false)'),
  );

  const AsyncFunction = Object.getPrototypeOf(async function noop() {}).constructor;
  const executePreparation = new AsyncFunction(
    'platform',
    'force',
    'rescanRequestId',
    'raw',
    'reviews',
    'isProductPage',
    'productTitle',
    'reviewDiagnostics',
    'productUrl',
    'sanitizedReviews',
    'initialSignature',
    'safeSendMessage',
    'hasUnpairedSurrogate',
    'window',
    'console',
    `
      let lastSentSignature = initialSignature;
      let errorStage = "Review Extraction";
      const productImageMetadata = { productImage: null, productMediaType: null };
      try {
        ${payloadPreparation}
      } catch (error) {
        return { error, lastSentSignature };
      }
      return { error: null, lastSentSignature };
    `,
  );

  const review = {
    text: 'Stable and useful app.',
    platform: 'googleplay',
    helpfulCount: 6,
    helpfulnessMetric: 'helpful_votes',
    helpfulnessAvailable: true,
  };
  const commonArgs = [
    'googleplay',
    false,
    null,
    { reviews: [review] },
    [review],
    true,
    'Sample app',
    null,
    'https://play.google.com/store/apps/details?id=example.app',
    [review],
  ];
  const logs = [];
  const testConsole = Object.fromEntries(
    ['log', 'info', 'warn', 'error'].map((method) => [method, (...args) => logs.push(args)]),
  );
  const testWindow = { location: { origin: 'https://play.google.com', pathname: '/store/apps/details' } };
  const hasUnpairedSurrogate = () => false;
  let sendCount = 0;
  const deliverFailedThenRetry = async (message) => {
    if (message.type !== 'reviewsScraped') return { ok: true };
    sendCount += 1;
    return null;
  };
  const failedDelivery = await executePreparation(
    ...commonArgs,
    '',
    deliverFailedThenRetry,
    hasUnpairedSurrogate,
    testWindow,
    testConsole,
  );

  assert.equal(failedDelivery.error?.message, 'Scrape results could not be delivered to the extension service worker.');
  assert.equal(failedDelivery.lastSentSignature, '');

  let deliveredMessage;
  const successfulRetry = await executePreparation(
    ...commonArgs,
    failedDelivery.lastSentSignature,
    async (message) => {
      if (message.type === 'reviewsScraped') {
        sendCount += 1;
        deliveredMessage = message;
      }
      return { ok: true, reviewCount: 1 };
    },
    hasUnpairedSurrogate,
    testWindow,
    testConsole,
  );

  assert.equal(successfulRetry.error, null);
  assert.notEqual(successfulRetry.lastSentSignature, '');
  assert.equal(sendCount, 2);
  assert.equal(deliveredMessage.type, 'reviewsScraped');
  assert.deepEqual(deliveredMessage.reviews, [review]);
  assert.ok(logs.some((args) => String(args[0]).includes('Sending scrape — isProductPage:true')));
});
