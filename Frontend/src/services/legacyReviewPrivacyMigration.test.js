import assert from 'node:assert/strict';
import test from 'node:test';
import { getTopicReviewSetSignature } from '../Users/utils/topicAnalysisRequest.js';
import {
  ACTIVE_ANALYSIS_STORAGE_KEY,
  LAST_SCRAPE_STORAGE_KEY,
  PRIVACY_MIGRATION_VERSION,
  PRIVACY_MIGRATION_VERSION_KEY,
  ensureLegacyReviewPrivacyMigration,
  runLegacyReviewPrivacyMigration,
  sanitizeLegacyAnalysisRecord,
  sanitizeLegacyScrapeRecord,
  sanitizeActiveAnalysisState,
} from './legacyReviewPrivacyMigration.js';
import { sanitizeReviewText } from './privacyRedaction.js';

const PAGE_ANALYSES_STORAGE_KEY = 'voxreview_page_analyses';

function makeChromeStorage(seed = {}, { failRead = false, failWrite = false } = {}) {
  const values = structuredClone(seed);
  let lastError = null;
  const storage = {
    get(keys, callback) {
      lastError = failRead ? { message: 'read failure' } : null;
      const requested = Array.isArray(keys) ? keys : [keys];
      callback(Object.fromEntries(requested.map((key) => [key, values[key]])));
    },
    set(updates, callback) {
      lastError = failWrite ? { message: 'write failure' } : null;
      if (!failWrite) Object.assign(values, structuredClone(updates));
      callback?.();
    },
    values,
  };
  return {
    storage,
    runtime: { get lastError() { return lastError; } },
  };
}

function makeLocalStorage(seed = {}, { failWrite = false } = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failWrite) throw new Error('write failure');
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); },
    values,
  };
}

function legacyChromeData() {
  return {
    unrelatedPreference: { keep: true },
    [LAST_SCRAPE_STORAGE_KEY]: {
      platform: 'shopee',
      timestamp: 100,
      reviews: [{
        id: 'review-1',
        reviewerName: 'Synthetic Name',
        username: 'synthetic-user',
        text: 'Email person@example.test and order no: ORD-908172.',
      }],
    },
    [PAGE_ANALYSES_STORAGE_KEY]: {
      'snapshot-1': {
        id: 'snapshot-1',
        timestamp: 200,
        notes: 'Keep these notes.',
        label: 'October',
        platform: 'Shopee',
        reviews: [{
          id: 'review-1',
          reviewerName: 'Synthetic Name',
          text: 'Call +63 917 123 4567 at 123 Main Street.',
        }, { id: 'review-2', text: 'No personal data here.' }],
        reviewAnalysis: [
          {
            review: { id: 'review-1', text: 'Email person@example.test.' },
            category: 3,
            emotionDrivers: ['Call +63 917 123 4567.'],
          },
          { review: { id: 'review-2', text: 'No personal data here.' }, category: 1 },
        ],
        skippedReviews: [{
          review: 'Order ID ABCD-123456. Salamat Kay Synthetic Name.',
          reason: 'unsupported language',
        }],
        emotionData: {
          score: 0.9,
          emotions: [{ label: 'Anger', keywords: ['Email person@example.test'] }],
          quotes: [{
            text: 'Order #ZXCV-12345 and email person@example.test.',
            author: 'Synthetic Name',
            priority: { score: 82, level: 'HIGH' },
          }],
        },
        topicAnalysis: {
          keywordScores: {
            'Email person@example.test': { Quality: 0.7 },
          },
          results: [{
            reviewIndex: 0,
            topics: [{
              label: 'Delivery / Transaction',
              score: 0.8,
              keywords: ['Order ID ABCD-123456'],
              reviewEvidence: [{ review: 'Delivered to 123 Main Street.', topicResultIndex: 0 }],
              representativeReviews: [{ review: 'Email person@example.test.', topicResultIndex: 0 }],
            }],
          }],
        },
      },
    },
    [ACTIVE_ANALYSIS_STORAGE_KEY]: {
      'shopee:product': {
        pageKey: 'shopee:product',
        reviewSetSignature: 'outdated-signature',
        updatedAt: 300,
        reviews: [{ id: 'active-1', name: 'Synthetic Name', text: 'Phone 09171234567.' }],
        skippedReviews: [{ review: 'Order number ABCD-987654.', reason: 'unsupported language' }],
        svmResult: {
          predictions: [3],
          results: [{ review: 'Email person@example.test.', category: 3 }],
        },
        topicResult: { results: [{ reviewIndex: 0, topics: [] }] },
        emotionData: { quotes: [{ text: 'Hello Synthetic Name.', author: 'Synthetic Name' }] },
      },
    },
  };
}

async function installSavedAnalysisTestAuth() {
  globalThis.localStorage ||= makeLocalStorage();
  const { authService } = await import('./authService.js');
  const { supabase } = await import('../lib/supabase.js');
  authService.getCurrentRegularUserSession = async () => ({ user: { id: 'migration-test-user' } });
  supabase.from = () => {
    const query = {
      operation: 'select',
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      insert(row) { this.operation = 'insert'; this.row = row; return this; },
      single() { this.singleResult = true; return this; },
      then(resolve) {
        const data = this.operation === 'insert'
          ? {
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...structuredClone(this.row),
            }
          : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  };
}

test('image persistence keeps only absolute HTTP(S) URL strings', () => {
  const validImage = 'https://cdn.example/product.png?width=320';
  for (const sanitize of [
    sanitizeLegacyAnalysisRecord,
    sanitizeLegacyScrapeRecord,
    sanitizeActiveAnalysisState,
  ]) {
    assert.equal(sanitize({
      platform: 'shopee',
      productImage: validImage,
      productMediaType: 'video',
    }).productImage, validImage);
    for (const unsafeImage of [
      'data:image/png;base64,AAAA',
      'blob:https://example.com/image',
      'javascript:alert(1)',
      '//cdn.example/product.png',
      'https://user:pass@cdn.example/product.png',
    ]) {
      assert.equal(sanitize({
        platform: 'shopee',
        productImage: unsafeImage,
      }).productImage, null);
    }
  }
});

test('Chrome migration preserves legacy local snapshots while sanitizing active and scrape data', async () => {
  const { storage, runtime } = makeChromeStorage(legacyChromeData());
  const originalSnapshots = structuredClone(storage.values[PAGE_ANALYSES_STORAGE_KEY]);

  await runLegacyReviewPrivacyMigration({ chromeStorage: storage, runtime });

  const active = storage.values[ACTIVE_ANALYSIS_STORAGE_KEY]['shopee:product'];
  const scrape = storage.values[LAST_SCRAPE_STORAGE_KEY];
  assert.equal(storage.values[PRIVACY_MIGRATION_VERSION_KEY], PRIVACY_MIGRATION_VERSION);
  assert.deepEqual(storage.values.unrelatedPreference, { keep: true });
  assert.deepEqual(storage.values[PAGE_ANALYSES_STORAGE_KEY], originalSnapshots);
  assert.equal(active.reviews[0].name, undefined);
  assert.match(active.reviews[0].text, /\[PHONE\]/);
  assert.match(active.svmResult.results[0].review, /\[EMAIL\]/);
  assert.equal(active.svmResult.predictions[0], 3);
  assert.equal(active.emotionData.quotes[0].author, undefined);
  assert.equal(active.reviewSetSignature, getTopicReviewSetSignature(active.reviews));
  assert.equal(scrape.reviews[0].reviewerName, undefined);
  assert.match(scrape.reviews[0].text, /\[EMAIL\]/);
});

test('Chrome migration is idempotent and does not change ordering or existing predictions', async () => {
  const { storage, runtime } = makeChromeStorage(legacyChromeData());
  await runLegacyReviewPrivacyMigration({ chromeStorage: storage, runtime });
  const once = structuredClone(storage.values);
  await runLegacyReviewPrivacyMigration({ chromeStorage: storage, runtime });

  assert.deepEqual(storage.values, once);
  assert.deepEqual(
    storage.values[ACTIVE_ANALYSIS_STORAGE_KEY]['shopee:product'].svmResult.predictions,
    [3],
  );
});

test('Filipino and Taglish text is sanitized while ordinary review text remains unchanged', () => {
  assert.equal(
    sanitizeReviewText('Salamat Kay Synthetic Name, mabilis ang delivery.'),
    'Salamat Kay [NAME], mabilis ang delivery.',
  );
  assert.equal(
    sanitizeReviewText('Maayos ang app at mabilis ang delivery.'),
    'Maayos ang app at mabilis ang delivery.',
  );
});

test('localStorage migration leaves legacy snapshots untouched and sanitizes active state', async () => {
  const localStorageRef = makeLocalStorage({
    [PAGE_ANALYSES_STORAGE_KEY]: JSON.stringify({
      saved: { id: 'saved', reviews: [{ text: 'Email person@example.test.' }] },
    }),
    [ACTIVE_ANALYSIS_STORAGE_KEY]: JSON.stringify({
      active: { reviews: [{ text: 'Phone +63 917 123 4567.' }] },
    }),
    unrelated: 'keep',
  });
  const originalSnapshots = localStorageRef.getItem(PAGE_ANALYSES_STORAGE_KEY);

  await runLegacyReviewPrivacyMigration({ chromeStorage: null, localStorageRef });

  assert.equal(localStorageRef.getItem(PAGE_ANALYSES_STORAGE_KEY), originalSnapshots);
  assert.match(localStorageRef.getItem(ACTIVE_ANALYSIS_STORAGE_KEY), /\[PHONE\]/);
  assert.equal(localStorageRef.getItem('unrelated'), 'keep');
  assert.equal(
    JSON.parse(localStorageRef.getItem(PRIVACY_MIGRATION_VERSION_KEY)),
    PRIVACY_MIGRATION_VERSION,
  );
  assert.equal(localStorageRef.getItem(LAST_SCRAPE_STORAGE_KEY), null);
});

test('cloud saves do not migrate legacy local snapshots while active-state privacy migration remains', async () => {
  const { storage, runtime } = makeChromeStorage(legacyChromeData());
  const originalSnapshots = structuredClone(storage.values[PAGE_ANALYSES_STORAGE_KEY]);
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { runtime, storage: { local: storage } };
  try {
    await installSavedAnalysisTestAuth();
    const { saveAnalysisForPage } = await import('./pageAnalysisStorage.js');
    const { getActiveAnalysisStates, setActiveAnalysisState } = await import('./activeAnalysisState.js');
    const states = await getActiveAnalysisStates();

    assert.deepEqual(storage.values[PAGE_ANALYSES_STORAGE_KEY], originalSnapshots);
    assert.equal(states['shopee:product'].reviews[0].name, undefined);

    const savedPage = await saveAnalysisForPage({
      id: 'new-snapshot',
      platform: 'Shopee',
      page_url: 'https://shopee.ph/product/123/456',
      reviews: [{ id: 'new-review', reviewerName: 'Synthetic Name', text: 'Email person@example.test.' }],
      reviewAnalysis: [{ review: { id: 'new-review', text: 'Email person@example.test.' }, category: 3 }],
      emotionData: { quotes: [{ text: 'Call 09171234567.', author: 'Synthetic Name' }] },
      topicAnalysis: { results: [{ reviewIndex: 0, topics: [] }] },
    });
    await setActiveAnalysisState({
      platform: 'shopee',
      page_url: 'https://shopee.ph/product/123/456',
      reviews: [{ id: 'new-active-review', username: 'synthetic-user', text: 'Order ID ABCD-123456.' }],
    });

    const storedActive = Object.values(storage.values[ACTIVE_ANALYSIS_STORAGE_KEY])
      .find((state) => state.page_url === 'https://shopee.ph/product/123/456');
    assert.equal(savedPage.reviews[0].reviewerName, undefined);
    assert.match(savedPage.reviews[0].text, /\[EMAIL\]/);
    assert.match(savedPage.emotionData.quotes[0].text, /\[PHONE\]/);
    assert.equal(savedPage.emotionData.quotes[0].author, undefined);
    assert.equal(storedActive.reviews[0].username, undefined);
    assert.match(storedActive.reviews[0].text, /\[ORDER_ID\]/);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});

test('localStorage active-state reads leave legacy local snapshots untouched', async () => {
  const previousChrome = globalThis.chrome;
  const previousLocalStorage = globalThis.localStorage;
  delete globalThis.chrome;
  const localStorageRef = makeLocalStorage({
    [PAGE_ANALYSES_STORAGE_KEY]: JSON.stringify({
      saved: { id: 'saved', reviews: [{ text: 'Email person@example.test.' }] },
    }),
    [ACTIVE_ANALYSIS_STORAGE_KEY]: JSON.stringify({
      active: { reviews: [{ text: 'Order ID ABCD-123456.' }] },
    }),
  });
  const originalSnapshots = localStorageRef.getItem(PAGE_ANALYSES_STORAGE_KEY);
  globalThis.localStorage = localStorageRef;
  try {
    await installSavedAnalysisTestAuth();
    const { getActiveAnalysisStates } = await import('./activeAnalysisState.js');
    const states = await getActiveAnalysisStates();
    assert.equal(localStorageRef.getItem(PAGE_ANALYSES_STORAGE_KEY), originalSnapshots);
    assert.match(states.active.reviews[0].text, /\[ORDER_ID\]/);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});

test('extension-page migration gate requires a successful background response', async () => {
  const previousChrome = globalThis.chrome;
  const previousDocument = globalThis.document;
  const sentMessages = [];
  globalThis.document = {};
  globalThis.chrome = {
    storage: { local: {} },
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        sentMessages.push(message.type);
        callback({ ok: true });
      },
    },
  };
  try {
    await ensureLegacyReviewPrivacyMigration();
    assert.deepEqual(sentMessages, ['ensureLegacyReviewPrivacyMigration']);
    globalThis.chrome.runtime.sendMessage = (_message, callback) => callback({ ok: false });
    await assert.rejects(ensureLegacyReviewPrivacyMigration(), /could not be safely privacy-migrated/);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('Chrome privacy migration preserves malformed legacy snapshots without inspecting them', async () => {
  const { storage, runtime } = makeChromeStorage({
    [PAGE_ANALYSES_STORAGE_KEY]: { broken: 'unreadable legacy record' },
  });
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { runtime, storage: { local: storage } };
  try {
    await runLegacyReviewPrivacyMigration({ chromeStorage: storage, runtime });
    assert.equal(storage.values[PAGE_ANALYSES_STORAGE_KEY].broken, 'unreadable legacy record');
    assert.equal(storage.values[PRIVACY_MIGRATION_VERSION_KEY], PRIVACY_MIGRATION_VERSION);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});

test('malformed legacy local snapshots are retained without blocking the privacy marker', async () => {
  const original = '{malformed';
  const localStorageRef = makeLocalStorage({
    [PAGE_ANALYSES_STORAGE_KEY]: original,
  });

  await runLegacyReviewPrivacyMigration({ chromeStorage: null, localStorageRef });
  assert.equal(localStorageRef.getItem(PAGE_ANALYSES_STORAGE_KEY), original);
  assert.equal(
    JSON.parse(localStorageRef.getItem(PRIVACY_MIGRATION_VERSION_KEY)),
    PRIVACY_MIGRATION_VERSION,
  );
});

test('invalid stored record shapes fail closed without replacing data or marking completion', async () => {
  const seed = {
    ...legacyChromeData(),
    [ACTIVE_ANALYSIS_STORAGE_KEY]: { invalid: 'not an analysis record' },
  };
  const { storage, runtime } = makeChromeStorage(seed);
  const before = structuredClone(storage.values);

  await assert.rejects(
    runLegacyReviewPrivacyMigration({ chromeStorage: storage, runtime }),
    /could not be safely privacy-migrated/,
  );
  assert.deepEqual(storage.values, before);
  assert.equal(storage.values[PRIVACY_MIGRATION_VERSION_KEY], undefined);
});

test('storage read and write failures do not advance the Chrome migration marker', async () => {
  const readFailure = makeChromeStorage(legacyChromeData(), { failRead: true });
  await assert.rejects(
    runLegacyReviewPrivacyMigration({ chromeStorage: readFailure.storage, runtime: readFailure.runtime }),
    /could not be safely privacy-migrated/,
  );
  assert.equal(readFailure.storage.values[PRIVACY_MIGRATION_VERSION_KEY], undefined);

  const writeFailure = makeChromeStorage(legacyChromeData(), { failWrite: true });
  const before = structuredClone(writeFailure.storage.values);
  await assert.rejects(
    runLegacyReviewPrivacyMigration({ chromeStorage: writeFailure.storage, runtime: writeFailure.runtime }),
    /could not be safely privacy-migrated/,
  );
  assert.deepEqual(writeFailure.storage.values, before);
});

test('localStorage write failure leaves the marker unset and reports a privacy-safe error', async () => {
  const localStorageRef = makeLocalStorage({
    [PAGE_ANALYSES_STORAGE_KEY]: JSON.stringify({ saved: { reviews: [{ text: 'Email person@example.test.' }] } }),
  }, { failWrite: true });

  await assert.rejects(
    runLegacyReviewPrivacyMigration({ chromeStorage: null, localStorageRef }),
    /could not be safely privacy-migrated/,
  );
  assert.equal(localStorageRef.getItem(PRIVACY_MIGRATION_VERSION_KEY), null);
});

test('historical snapshots sanitize nested review identities while preserving analysis results and internal IDs', () => {
  const legacySnapshot = {
    platform: 'shopee',
    targetTitle: 'Product title',
    page_url: 'https://shopee.ph/product/123/456',
    pageKey: 'shopee:i.123.456',
    label: 'Saved label',
    notes: 'Keep user notes intact.',
    created_at: '2026-10-01T10:00:00.000Z',
    reviews: [{
      id: 'legacy-platform-review-id',
      text: 'Contact jane@example.test, tracking no. AB-123456.',
      date: 'October 2026',
      rating: 5,
      helpfulCount: 21,
      helpfulnessMetric: 'review_likes',
      helpfulnessAvailable: true,
      reviewerName: 'Private Reviewer',
      user_name: 'private-handle',
      profile_url: 'https://example.test/profile',
      avatarUrl: 'https://example.test/avatar.png',
      accountId: 'account-1',
      commentId: 'comment-1',
      reviewId: 'review-1',
      reviewerId: 'reviewer-1',
    }],
    reviewAnalysis: [{
      id: 'analysis-review-linked-id',
      reviewer_name: 'Private Reviewer',
      review: {
        id: 'nested-review-id',
        text: 'Call +63 917 123 4567.',
        reviewerId: 'reviewer-2',
        accountId: 'account-2',
      },
      category: 3,
      emotionDrivers: ['Order ID ZX-123456 arrived late.'],
      priority: { id: 'priority-internal-id', level: 'HIGH', score: 82 },
    }],
    emotionData: {
      dominantEmotion: { id: 'anger-summary', label: 'Anger', count: 1 },
      quotes: [{
        id: 'legacy-quote-review-id',
        text: 'Email person@example.test.',
        authorName: 'Private Reviewer',
        user_name: 'private-handle',
        profile_url: 'https://example.test/profile',
        avatarUrl: 'https://example.test/avatar.png',
        accountId: 'account-3',
        commentId: 'comment-3',
        reviewId: 'review-3',
        reviewerId: 'reviewer-3',
        helpfulCount: 21,
        helpfulnessMetric: 'review_likes',
        helpfulnessAvailable: true,
        topicResultIndex: 0,
        priority: { id: 'quote-priority-id', level: 'HIGH', score: 82 },
      }],
      emotions: [{ id: 'anger-category', label: 'Anger', count: 1 }],
    },
    topicAnalysis: {
      id: 'topic-analysis-internal-id',
      results: [{
        reviewIndex: 0,
        topics: [{
          id: 'topic-result-internal-id',
          label: 'Delivery',
          score: 0.9,
          reviewEvidence: [{
            id: 'evidence-review-id',
            reviewerId: 'reviewer-4',
            accountId: 'account-4',
            commentId: 'comment-4',
            reviewId: 'review-4',
            review: 'Delivered to 123 Main Street.',
            topicResultIndex: 0,
          }],
        }],
      }],
    },
    priorityResults: [{
      id: 'priority-result-internal-id',
      level: 'HIGH',
      score: 82,
    }, {
      id: 'priority-review-linked-id',
      reviewerId: 'reviewer-5',
      authorName: 'Private Reviewer',
      review: 'Order no. WX-123456.',
      level: 'MEDIUM',
    }],
    timestamp: 123,
  };
  const original = structuredClone(legacySnapshot);

  const sanitized = sanitizeLegacyAnalysisRecord(legacySnapshot);

  assert.deepEqual(legacySnapshot, original);
  assert.equal(sanitized.reviews[0].id, undefined);
  for (const key of [
    'reviewerName',
    'user_name',
    'profile_url',
    'avatarUrl',
    'accountId',
    'commentId',
    'reviewId',
    'reviewerId',
  ]) {
    assert.equal(sanitized.reviews[0][key], undefined);
  }
  assert.match(sanitized.reviews[0].text, /\[EMAIL\].*\[ORDER_ID\]/);
  assert.equal(sanitized.reviews[0].helpfulCount, 21);
  assert.equal(sanitized.reviews[0].helpfulnessMetric, 'review_likes');
  assert.equal(sanitized.reviews[0].helpfulnessAvailable, true);

  assert.equal(sanitized.reviewAnalysis[0].id, undefined);
  assert.equal(sanitized.reviewAnalysis[0].review.id, undefined);
  assert.equal(sanitized.reviewAnalysis[0].review.reviewerId, undefined);
  assert.equal(sanitized.reviewAnalysis[0].category, 3);
  assert.equal(sanitized.reviewAnalysis[0].priority.id, 'priority-internal-id');
  assert.match(sanitized.reviewAnalysis[0].review.text, /\[PHONE\]/);
  assert.match(sanitized.reviewAnalysis[0].emotionDrivers[0], /\[ORDER_ID\]/);

  assert.equal(sanitized.emotionData.dominantEmotion.label, 'Anger');
  assert.equal(sanitized.emotionData.emotions[0].count, 1);
  assert.equal(sanitized.emotionData.quotes[0].id, undefined);
  assert.equal(sanitized.emotionData.quotes[0].authorName, undefined);
  assert.equal(sanitized.emotionData.quotes[0].accountId, undefined);
  assert.equal(sanitized.emotionData.quotes[0].helpfulCount, 21);
  assert.equal(sanitized.emotionData.quotes[0].helpfulnessMetric, 'review_likes');
  assert.equal(sanitized.emotionData.quotes[0].helpfulnessAvailable, true);
  assert.equal(sanitized.emotionData.quotes[0].priority.id, 'quote-priority-id');
  assert.equal(sanitized.emotionData.quotes[0].topicResultIndex, 0);
  assert.match(sanitized.emotionData.quotes[0].text, /\[EMAIL\]/);

  assert.equal(sanitized.topicAnalysis.id, 'topic-analysis-internal-id');
  assert.equal(sanitized.topicAnalysis.results[0].reviewIndex, 0);
  assert.equal(sanitized.topicAnalysis.results[0].topics[0].id, 'topic-result-internal-id');
  assert.equal(sanitized.topicAnalysis.results[0].topics[0].reviewEvidence[0].id, undefined);
  assert.equal(sanitized.topicAnalysis.results[0].topics[0].reviewEvidence[0].reviewerId, undefined);
  assert.match(sanitized.topicAnalysis.results[0].topics[0].reviewEvidence[0].review, /\[ADDRESS\]/);
  assert.equal(sanitized.priorityResults[0].id, 'priority-result-internal-id');
  assert.equal(sanitized.priorityResults[1].id, undefined);
  assert.equal(sanitized.priorityResults[1].reviewerId, undefined);
  assert.equal(sanitized.priorityResults[1].authorName, undefined);
  assert.match(sanitized.priorityResults[1].review, /\[ORDER_ID\]/);
  assert.equal(sanitized.targetTitle, 'Product title');
  assert.equal(sanitized.page_url, legacySnapshot.page_url);
  assert.equal(sanitized.label, 'Saved label');
  assert.equal(sanitized.notes, 'Keep user notes intact.');
  assert.equal(sanitized.timestamp, 123);
});

test('older snapshots without optional helpfulness, date, or rating fields still restore', () => {
  const olderSnapshot = {
    platform: 'steam',
    reviews: [{ id: 'legacy-review-id', text: 'Still useful feedback.' }],
    reviewAnalysis: [{ review: { id: 'legacy-review-id', text: 'Still useful feedback.' }, category: 2 }],
    emotionData: { quotes: [{ id: 'legacy-quote-id', text: 'Still useful feedback.', category: 2 }] },
    topicAnalysis: { results: [{ reviewIndex: 0, topics: [{ label: 'Quality', score: 0.8 }] }] },
    priorityResults: [{ id: 'priority-id', level: 'MEDIUM' }],
  };

  const restored = sanitizeLegacyAnalysisRecord(olderSnapshot);

  assert.deepEqual(restored.reviews, [{ text: 'Still useful feedback.' }]);
  assert.equal(restored.reviewAnalysis[0].review.text, 'Still useful feedback.');
  assert.equal(restored.reviewAnalysis[0].category, 2);
  assert.equal(restored.emotionData.quotes[0].text, 'Still useful feedback.');
  assert.equal(restored.topicAnalysis.results[0].topics[0].label, 'Quality');
  assert.equal(restored.priorityResults[0].id, 'priority-id');
  assert.equal('helpfulCount' in restored.reviews[0], false);
  assert.equal('rating' in restored.reviews[0], false);
  assert.equal('date' in restored.reviews[0], false);
});
