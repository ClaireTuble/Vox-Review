import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  clearAllPageAnalyses,
  deleteAnalysisForPage,
  getAnalysisForPage,
  getPageAnalyses,
  getPageKey,
  getSavedAnalysisCount,
  saveAnalysisForPage,
} from './pageAnalysisStorage.js';

let storedMap;
let storageError = null;

globalThis.chrome = {
  runtime: {
    get lastError() { return storageError; },
  },
  storage: {
    local: {
      get(_keys, callback) {
        callback({ voxreview_page_analyses: structuredClone(storedMap) });
      },
      set(values, callback) {
        if (!storageError) storedMap = structuredClone(values.voxreview_page_analyses);
        callback?.();
      },
    },
  },
};

beforeEach(() => {
  storedMap = {};
  storageError = null;
});

afterEach(() => {
  storedMap = {};
  storageError = null;
});

function analysis(url, title, additional = {}) {
  return {
    platform: 'Shopee',
    page_url: url,
    pageKey: getPageKey('shopee', url),
    targetTitle: title,
    reviews: [{ id: 'review-1', text: title }],
    emotionData: { quotes: [{ priority: { score: 81, level: 'CRITICAL' } }] },
    topicAnalysis: { results: [{ reviewIndex: 0, topics: [] }] },
    ...additional,
  };
}

test('save persists the complete page analysis and restores it by stable identity', async () => {
  const url = 'https://shopee.ph/product/123/456?source=popup';
  const saved = await saveAnalysisForPage(analysis(url, 'First analysis', {
    priorityResults: [{ score: 81, level: 'CRITICAL' }],
  }));

  assert.equal(saved.pageKey, 'shopee:i.123.456');
  assert.equal(saved.targetTitle, 'First analysis');
  assert.equal(saved.priorityResults[0].level, 'CRITICAL');
  assert.equal((await getAnalysisForPage('shopee', url)).targetTitle, 'First analysis');
  assert.equal(Object.keys(await getPageAnalyses()).length, 1);
  assert.equal(await getSavedAnalysisCount(), 1);
});

test('saving the same normalized page updates one record instead of duplicating it', async () => {
  await saveAnalysisForPage(analysis('https://shopee.ph/product/123/456?old=1', 'Old'));
  const updated = await saveAnalysisForPage(analysis('https://shopee.ph/product/123/456?new=2', 'New'));
  const allRecords = await getPageAnalyses();

  assert.equal(updated.targetTitle, 'New');
  assert.equal(Object.keys(allRecords).length, 1);
  assert.equal(allRecords['shopee:i.123.456'].targetTitle, 'New');
});

test('save deduplicates legacy aliases but preserves analyses for other pages', async () => {
  const first = analysis('https://shopee.ph/product/123/456', 'First');
  const other = analysis('https://shopee.ph/product/123/789', 'Other');
  storedMap = {
    [first.pageKey]: { ...first, targetTitle: 'Canonical' },
    'legacy-shopee-entry': { ...first, id: 'legacy-shopee-entry' },
    [other.pageKey]: other,
  };

  await saveAnalysisForPage(analysis('https://shopee.ph/product/123/456', 'Updated'));
  const allRecords = await getPageAnalyses();

  assert.deepEqual(Object.keys(allRecords).sort(), ['shopee:i.123.456', 'shopee:i.123.789']);
  assert.equal(allRecords['shopee:i.123.789'].targetTitle, 'Other');
});

test('a rescan with changed review text does not keep stale topic results for the same review IDs', async () => {
  const url = 'https://shopee.ph/product/123/456';
  const previous = analysis(url, 'Previous', {
    reviews: [{ id: 'stable-id', text: 'Old review wording' }],
    reviewAnalysis: [{ review: { id: 'stable-id', text: 'Old review wording' }, category: 3 }],
    topicAnalysis: { results: [{ reviewIndex: 0, topics: [{ label: 'Quality', score: 0.8 }] }] },
  });
  await saveAnalysisForPage(previous);

  const updated = await saveAnalysisForPage(analysis(url, 'Updated', {
    reviews: [{ id: 'stable-id', text: 'New review wording' }],
    reviewAnalysis: [{ review: { id: 'stable-id', text: 'New review wording' }, category: 2 }],
    topicAnalysis: null,
  }));

  assert.equal(updated.reviews[0].text, 'New review wording');
  assert.equal(updated.topicAnalysis, null);
});

test('refreshing a saved page merges into the existing record identity', async () => {
  const url = 'https://shopee.ph/product/123/456';
  const previous = analysis(url, 'Desk', {
    id: 'saved-record-identity',
    reviews: [{ id: 'stable-1', text: 'Existing review' }],
    reviewAnalysis: [{ review: { id: 'stable-1', text: 'Existing review' }, category: 1 }],
    topicAnalysis: { results: [{ reviewIndex: 0, topics: [] }] },
  });
  await saveAnalysisForPage(previous);

  const updated = await saveAnalysisForPage(analysis(url, 'Desk', {
    id: previous.id,
    reviews: [
      { id: 'stable-1', text: 'Existing review' },
      { id: 'stable-2', text: 'New review' },
    ],
    reviewAnalysis: [
      { review: { id: 'stable-1', text: 'Existing review' }, category: 1 },
      { review: { id: 'stable-2', text: 'New review' }, category: 2 },
    ],
    topicAnalysis: { results: [{ reviewIndex: 0, topics: [] }, { reviewIndex: 1, topics: [] }] },
    reviewCount: 2,
  }));

  assert.equal(updated.id, 'saved-record-identity');
  assert.equal(updated.pageKey, previous.pageKey);
  assert.equal(updated.reviewCount, 2);
  assert.equal(updated.reviews.length, 2);
  assert.equal(Object.keys(await getPageAnalyses()).length, 1);
});

test('updating the last-checked timestamp preserves the saved analysis results', async () => {
  const url = 'https://shopee.ph/product/123/456';
  const previous = analysis(url, 'Desk', {
    reviews: [{ id: 'stable-1', text: 'Existing review' }],
    reviewAnalysis: [{ review: { id: 'stable-1', text: 'Existing review' }, category: 1 }],
    topicAnalysis: { results: [{ reviewIndex: 0, topics: [{ label: 'Quality', score: 0.9 }] }] },
  });
  await saveAnalysisForPage(previous);
  const checkedAt = Date.now();

  const updated = await saveAnalysisForPage({ ...previous, last_refreshed_at: checkedAt });

  assert.equal(updated.last_refreshed_at, checkedAt);
  assert.deepEqual(updated.reviews, previous.reviews);
  assert.deepEqual(updated.reviewAnalysis, previous.reviewAnalysis);
  assert.deepEqual(updated.topicAnalysis, previous.topicAnalysis);
  assert.equal(Object.keys(await getPageAnalyses()).length, 1);
});

test('delete removes only the requested saved analysis', async () => {
  const first = analysis('https://shopee.ph/product/123/456', 'First');
  const other = analysis('https://shopee.ph/product/123/789', 'Other');
  await saveAnalysisForPage(first);
  await saveAnalysisForPage(other);

  assert.equal(await deleteAnalysisForPage(first.pageKey), true);
  const allRecords = await getPageAnalyses();
  assert.equal(allRecords[first.pageKey], undefined);
  assert.equal(allRecords[other.pageKey].targetTitle, 'Other');
  assert.equal(await deleteAnalysisForPage('missing-page'), false);
  assert.equal(await getSavedAnalysisCount(), 1);
});

test('clear all removes every saved page record and reports a zero count', async () => {
  await saveAnalysisForPage(analysis('https://shopee.ph/product/123/456', 'Shopee'));
  await saveAnalysisForPage({
    ...analysis('https://store.steampowered.com/app/10/example', 'Steam'),
    platform: 'Steam',
    pageKey: getPageKey('steam', 'https://store.steampowered.com/app/10/example'),
  });

  assert.equal(await clearAllPageAnalyses(), 0);
  assert.deepEqual(await getPageAnalyses(), {});
  assert.equal(await getSavedAnalysisCount(), 0);
});

test('page keys normalize platform aliases and isolate multiple platform identities', () => {
  assert.equal(
    getPageKey('Google Reviews', 'https://www.google.com/maps/place/Coffee+Shop/@1,2,3z'),
    getPageKey('google', 'https://www.google.com/maps/place/Coffee+Shop/@4,5,6z'),
  );
  assert.notEqual(
    getPageKey('googleplay', 'https://play.google.com/store/apps/details?id=one'),
    getPageKey('steam', 'https://store.steampowered.com/app/10/example'),
  );
});

test('save reports persistent-storage failures to its caller', async () => {
  storageError = { message: 'storage unavailable' };
  await assert.rejects(
    saveAnalysisForPage(analysis('https://shopee.ph/product/123/456', 'Unsaved')),
    /storage unavailable/,
  );
});
