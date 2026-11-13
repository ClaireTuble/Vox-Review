import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { webcrypto } from 'node:crypto';

globalThis.crypto ||= webcrypto;
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const { authService } = await import('./authService.js');
const { supabase } = await import('../lib/supabase.js');
const pageAnalysisStorage = await import('./pageAnalysisStorage.js');
const { getTopicReviewSetSignature } = await import('../Users/utils/topicAnalysisRequest.js');
const {
  clearAllPageAnalyses,
  deleteAnalysisForPage,
  getAnalysisForPage,
  getPageAnalyses,
  getPageKey,
  getSavedAnalysisCount,
  saveAnalysisForPage,
  updateSnapshotMetadata,
} = pageAnalysisStorage;

let storedMap;
let storageError = null;
let migrationVersion;
let currentUserId = 'user-1';
let queryError = null;
let savedRows = [];

globalThis.chrome = {
  runtime: {
    get lastError() { return storageError; },
  },
  storage: {
    local: {
      get(keys, callback) {
        const requestedKeys = Array.isArray(keys) ? keys : [keys];
        callback(Object.fromEntries(requestedKeys.map((key) => [
          key,
          key === 'voxreview_page_analyses'
            ? structuredClone(storedMap)
            : key === 'voxreview_privacy_migration_version'
              ? migrationVersion
              : undefined,
        ])));
      },
      set(values, callback) {
        if (!storageError && Object.hasOwn(values, 'voxreview_page_analyses')) {
          storedMap = structuredClone(values.voxreview_page_analyses);
        }
        if (!storageError && Object.hasOwn(values, 'voxreview_privacy_migration_version')) {
          migrationVersion = values.voxreview_privacy_migration_version;
        }
        callback?.();
      },
    },
  },
};

class FakeSupabaseQuery {
  constructor() {
    this.operation = 'select';
    this.filters = [];
    this.returning = false;
    this.singleResult = false;
  }

  select() { this.returning = true; return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  order() { return this; }
  insert(value) { this.operation = 'insert'; this.value = value; return this; }
  upsert(value, options) { this.operation = 'upsert'; this.value = value; this.options = options; return this; }
  update(value) { this.operation = 'update'; this.value = value; return this; }
  delete() { this.operation = 'delete'; return this; }
  single() { this.singleResult = true; return this; }
  then(resolve, reject) { return this.execute().then(resolve, reject); }

  execute() {
    if (queryError) return Promise.resolve({ data: null, error: queryError });
    const matches = (row) => row.user_id === currentUserId &&
      this.filters.every(([key, value]) => row[key] === value);
    if (this.operation === 'select') {
      return Promise.resolve({ data: savedRows.filter(matches).map((row) => structuredClone(row)), error: null });
    }
    if (this.operation === 'delete') {
      const deleted = savedRows.filter(matches);
      savedRows = savedRows.filter((row) => !matches(row));
      return Promise.resolve({ data: deleted.map((row) => ({ id: row.id })), error: null });
    }
    if (this.operation === 'update') {
      const updated = savedRows.filter(matches).map((row) => {
        Object.assign(row, structuredClone(this.value), { updated_at: new Date().toISOString() });
        return structuredClone(row);
      });
      return Promise.resolve(this.result(updated));
    }
    if (this.operation === 'insert' || this.operation === 'upsert') {
      const rows = Array.isArray(this.value) ? this.value : [this.value];
      const output = [];
      for (const value of rows) {
        if (value.user_id !== currentUserId) {
          return Promise.resolve({ data: null, error: new Error('row-level security violation') });
        }
        const conflict = savedRows.find((row) => (
          row.id === value.id
        ));
        const next = {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...structuredClone(value),
        };
        if (conflict) Object.assign(conflict, next);
        else savedRows.push(next);
        output.push(structuredClone(conflict || next));
      }
      return Promise.resolve(this.result(output));
    }
    return Promise.resolve({ data: null, error: new Error('unsupported fake Supabase operation') });
  }

  result(rows) {
    if (this.singleResult) {
      if (rows.length !== 1) return { data: null, error: new Error('expected one row') };
      return { data: rows[0], error: null };
    }
    return { data: this.returning ? rows : null, error: null };
  }
}

supabase.from = () => new FakeSupabaseQuery();
authService.getCurrentRegularUserSession = async () => (
  currentUserId ? { user: { id: currentUserId } } : null
);

beforeEach(() => {
  storedMap = {};
  storageError = null;
  migrationVersion = undefined;
  currentUserId = 'user-1';
  queryError = null;
  savedRows = [];
});

afterEach(() => {
  storedMap = {};
  storageError = null;
  migrationVersion = undefined;
  currentUserId = 'user-1';
  queryError = null;
  savedRows = [];
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
  const emotionModelProvenance = {
    runs: [{
      modelIdentifier: 'logistic_regression',
      artifactSha256: 'a'.repeat(64),
      selectionConfiguration: {
        environmentVariable: 'VOXREVIEW_EMOTION_MODEL',
        configuredValue: null,
        selectedWorker: 'logistic_regression',
      },
      analyzedAt: '2026-11-06T04:00:00.000Z',
      reviewPredictions: [{ reviewIndex: 0, prediction: 1 }],
    }],
  };
  const saved = await saveAnalysisForPage(analysis(url, 'First analysis', {
    priorityResults: [{ score: 81, level: 'CRITICAL' }],
    emotionModelProvenance,
  }));

  assert.equal(saved.pageKey, 'shopee:i.123.456');
  assert.equal(saved.targetTitle, 'First analysis');
  assert.equal(saved.priorityResults[0].level, 'CRITICAL');
  assert.deepEqual(saved.emotionModelProvenance, emotionModelProvenance);
  assert.deepEqual(savedRows[0].snapshot.emotionModelProvenance, emotionModelProvenance);
  assert.equal((await getAnalysisForPage('shopee', url)).targetTitle, 'First analysis');
  assert.equal(Object.keys(await getPageAnalyses()).length, 1);
  assert.equal(await getSavedAnalysisCount(), 1);
});

test('legacy saved analyses without model provenance remain readable without fabricated metadata', async () => {
  const saved = await saveAnalysisForPage(
    analysis('https://shopee.ph/product/123/456', 'Legacy analysis'),
  );

  assert.equal(saved.targetTitle, 'Legacy analysis');
  assert.equal(Object.hasOwn(saved, 'emotionModelProvenance'), false);
  assert.equal(Object.hasOwn(savedRows[0].snapshot, 'emotionModelProvenance'), false);
  assert.equal(Object.hasOwn(saved, 'reviewScreeningMetadata'), false);
  assert.equal(Object.hasOwn(savedRows[0].snapshot, 'reviewScreeningMetadata'), false);
});

test('screening metadata is preserved in saved snapshots and restored without reconstruction', async () => {
  const reviewScreeningMetadata = {
    schemaVersion: 1,
    reviewSetSignature: getTopicReviewSetSignature([{ text: 'Screened analysis' }]),
    duplicateCheckEnabled: true,
    excludeDuplicatesFromAggregates: true,
    duplicateResults: [{
      reviewIndex: 0,
      label: 'Repeated Review',
      reason: 'Exact matching text.',
      aggregateEligible: false,
    }],
    reviewIntegrity: {
      enabled: true,
      enabledRuleIds: ['RIA-E'],
      results: [{
        reviewIndex: 0,
        assessmentStatus: 'Patterns Detected',
        triggeredRules: [{ id: 'RIA-E', explanation: 'Matched similar wording.' }],
      }],
    },
  };
  const saved = await saveAnalysisForPage(analysis(
    'https://shopee.ph/product/123/456',
    'Screened analysis',
    { reviewScreeningMetadata },
  ));

  assert.deepEqual(saved.reviewScreeningMetadata, reviewScreeningMetadata);
  assert.deepEqual(savedRows[0].snapshot.reviewScreeningMetadata, reviewScreeningMetadata);
});

test('new cloud snapshots store allowlisted reviews without reviewer or persistent review IDs', async () => {
  const saved = await saveAnalysisForPage(analysis('https://shopee.ph/product/123/456', 'Example', {
    productImage: 'https://cdn.example/product.png',
    category: 'unneeded',
    rating: '4.9',
    reviews: [{
      id: 'persistent-review-id',
      reviewId: 'other-review-id',
      reviewer: 'Private Person',
      username: 'private-handle',
      profileUrl: 'https://example.test/profile',
      text: 'Good item, delivered to 123 Rizal St.',
      date: 'July 2026',
      helpfulCount: 10,
      helpfulnessMetric: 'review_likes',
      helpfulnessAvailable: true,
      category: 'unneeded',
      rating: 5,
    }],
    reviewAnalysis: [{
      id: 'review-analysis-id',
      reviewId: 'nested-review-id',
      review: {
        id: 'nested-persistent-id',
        reviewer: 'Nested Private Person',
        text: 'Good item.',
        date: 'July 2026',
        rating: 5,
      },
      category: 1,
    }],
    emotionData: {
      quotes: [{
        id: 'quote-review-id',
        author: 'Private Person',
        text: 'Good item.',
        helpfulCount: 9,
        helpfulnessMetric: 'review_likes',
        helpfulnessAvailable: true,
        topicResultIndex: 0,
      }],
    },
    topicAnalysis: {
      results: [{ reviewIndex: 0, topics: [{ label: 'Quality', score: 0.9 }] }],
    },
  }));
  const storedSnapshot = savedRows[0].snapshot;

  assert.deepEqual(saved.reviews, [{
    text: 'Good item, delivered to [ADDRESS].',
    date: 'July 2026',
    rating: 5,
    helpfulCount: 10,
    helpfulnessMetric: 'review_likes',
    helpfulnessAvailable: true,
  }]);
  assert.equal(storedSnapshot.productImage, 'https://cdn.example/product.png');
  assert.equal(storedSnapshot.category, undefined);
  assert.equal(storedSnapshot.rating, undefined);
  assert.equal(storedSnapshot.reviewAnalysis[0].id, undefined);
  assert.equal(storedSnapshot.reviewAnalysis[0].reviewId, undefined);
  assert.equal(storedSnapshot.reviewAnalysis[0].review.id, undefined);
  assert.equal(storedSnapshot.emotionData.quotes[0].id, undefined);
  assert.equal(storedSnapshot.emotionData.quotes[0].author, undefined);
  assert.equal(storedSnapshot.emotionData.quotes[0].helpfulCount, 9);
  assert.equal(storedSnapshot.emotionData.quotes[0].helpfulnessMetric, 'review_likes');
  assert.equal(storedSnapshot.emotionData.quotes[0].helpfulnessAvailable, true);
  assert.equal(storedSnapshot.emotionData.quotes[0].topicResultIndex, 0);
  assert.equal(storedSnapshot.topicAnalysis.results[0].reviewIndex, 0);
  assert.doesNotMatch(JSON.stringify(storedSnapshot), /persistent-review-id|Private Person|private-handle|profileUrl|nested-review-id/);
});

test('saving multiple analyses for the same normalized page creates independent snapshots without overwriting', async () => {
  const snap1 = await saveAnalysisForPage(analysis('https://shopee.ph/product/123/456?old=1', 'Old'));
  const snap2 = await saveAnalysisForPage(analysis('https://shopee.ph/product/123/456?new=2', 'New'));
  const allRecords = await getPageAnalyses();

  assert.notEqual(snap1.id, snap2.id);
  assert.equal(snap1.targetTitle, 'Old');
  assert.equal(snap2.targetTitle, 'New');
  assert.equal(Object.keys(allRecords).length, 2);
  assert.equal(allRecords[snap1.id].targetTitle, 'Old');
  assert.equal(allRecords[snap2.id].targetTitle, 'New');
});

test('supports custom snapshot labels and generates default Analysis 1, Analysis 2 when omitted', async () => {
  const url = 'https://shopee.ph/product/123/456';
  const snap1 = await saveAnalysisForPage(analysis(url, 'First', { label: 'Initial Analysis' }));
  const snap2 = await saveAnalysisForPage(analysis(url, 'Second')); // no label -> Analysis 2
  const snap3 = await saveAnalysisForPage(analysis(url, 'Third', { label: 'October Update' }));
  const snap4 = await saveAnalysisForPage(analysis(url, 'Fourth')); // no label -> Analysis 3

  assert.equal(snap1.label, 'Initial Analysis');
  assert.equal(snap2.label, 'Analysis 2');
  assert.equal(snap3.label, 'October Update');
  assert.equal(snap4.label, 'Analysis 4');

  const all = await getPageAnalyses();
  assert.equal(Object.keys(all).length, 4);
});

test('legacy local snapshots stay untouched and are excluded from cloud Saved Analyses', async () => {
  const first = analysis('https://shopee.ph/product/123/456', 'Canonical');
  storedMap = {
    [first.pageKey]: { ...first, id: undefined, label: undefined },
  };
  const originalLocalSnapshots = structuredClone(storedMap);

  assert.deepEqual(await getPageAnalyses(), {});
  assert.deepEqual(storedMap, originalLocalSnapshots);
  assert.equal('getLocalPageAnalysesForImport' in pageAnalysisStorage, false);
  assert.equal('importLocalPageAnalyses' in pageAnalysisStorage, false);
  assert.equal(savedRows.length, 0);

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
    reviews: [{ id: 'stable-1', text: 'Existing review' }],
    reviewAnalysis: [{ review: { id: 'stable-1', text: 'Existing review' }, category: 1 }],
    topicAnalysis: { results: [{ reviewIndex: 0, topics: [] }] },
  });
  const savedPrevious = await saveAnalysisForPage(previous);

  const updated = await saveAnalysisForPage(analysis(url, 'Desk', {
    id: savedPrevious.id,
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

  assert.equal(updated.id, savedPrevious.id);
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
  const saved = await saveAnalysisForPage(previous);
  const checkedAt = Date.now();

  const updated = await saveAnalysisForPage({ ...saved, last_refreshed_at: checkedAt });

  assert.equal(updated.last_refreshed_at, checkedAt);
  assert.deepEqual(updated.reviews, [{ text: 'Existing review' }]);
  assert.deepEqual(updated.reviewAnalysis, [{ review: { text: 'Existing review' }, category: 1 }]);
  assert.deepEqual(updated.topicAnalysis, previous.topicAnalysis);
  assert.equal(Object.keys(await getPageAnalyses()).length, 1);
});

test('delete removes only the requested saved analysis and preserves other snapshots for the same page', async () => {
  const url = 'https://shopee.ph/product/123/456';
  const first = analysis(url, 'First', { label: 'Initial Analysis' });
  const second = analysis(url, 'Second', { label: 'October Update' });
  const other = analysis('https://shopee.ph/product/123/789', 'Other');
  const savedFirst = await saveAnalysisForPage(first);
  const savedSecond = await saveAnalysisForPage(second);
  const savedOther = await saveAnalysisForPage(other);

  assert.equal(await deleteAnalysisForPage(savedFirst.id), true);
  const allRecords = await getPageAnalyses();
  assert.equal(allRecords[savedFirst.id], undefined);
  assert.equal(allRecords[savedSecond.id].targetTitle, 'Second');
  assert.equal(allRecords[savedSecond.id].label, 'October Update');
  assert.equal(allRecords[savedOther.id].targetTitle, 'Other');
  assert.equal(await deleteAnalysisForPage('missing-page'), false);
  assert.equal(await getSavedAnalysisCount(), 2);
});

test('clear all removes every saved page record and reports a zero count', async () => {
  await saveAnalysisForPage(analysis('https://shopee.ph/product/123/456', 'Shopee'));
  await saveAnalysisForPage({
    ...analysis('https://store.steampowered.com/app/10/example', 'Steam'),
    platform: 'Steam',
    pageKey: getPageKey('steam', 'https://store.steampowered.com/app/10/example'),
  });

  assert.equal(await clearAllPageAnalyses(), 2);
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
  queryError = new Error('Supabase unavailable');
  await assert.rejects(
    saveAnalysisForPage(analysis('https://shopee.ph/product/123/456', 'Unsaved')),
    /Supabase unavailable/,
  );
});

test('editing labels and notes independently for multiple snapshots of the same product', async () => {
  const url = 'https://shopee.ph/product/123/456';
  const snap1 = await saveAnalysisForPage(analysis(url, 'Product', { label: 'Initial Analysis', notes: 'First batch notes' }));
  const snap2 = await saveAnalysisForPage(analysis(url, 'Product', { label: 'Second Run', notes: 'Second batch notes' }));

  // Update snapshot 1 metadata only
  const updated1 = await updateSnapshotMetadata(snap1.id, {
    label: 'Renamed Initial',
    notes: 'Updated first notes',
  });

  assert.equal(updated1.label, 'Renamed Initial');
  assert.equal(updated1.notes, 'Updated first notes');

  const allRecords = await getPageAnalyses();
  // Snapshot 1 is updated
  assert.equal(allRecords[snap1.id].label, 'Renamed Initial');
  assert.equal(allRecords[snap1.id].notes, 'Updated first notes');

  // Snapshot 2 remains completely independent and untouched
  assert.equal(allRecords[snap2.id].label, 'Second Run');
  assert.equal(allRecords[snap2.id].notes, 'Second batch notes');
});

test('saving, clearing, and reloading notes persists across reloads', async () => {
  const url = 'https://shopee.ph/product/123/456';
  const snap = await saveAnalysisForPage(analysis(url, 'Product', { notes: 'Important finding' }));

  let all = await getPageAnalyses();
  assert.equal(all[snap.id].notes, 'Important finding');

  // Clear notes
  const cleared = await updateSnapshotMetadata(snap.id, { notes: '' });
  assert.equal(cleared.notes, '');

  all = await getPageAnalyses();
  assert.equal(all[snap.id].notes, '');
});

test('blank label editing preserves or regenerates default Analysis 1, Analysis 2', async () => {
  const url = 'https://shopee.ph/product/123/456';
  const snap = await saveAnalysisForPage(analysis(url, 'Product', { label: 'Analysis 1' }));

  // Empty string label should keep Analysis 1
  const updated = await updateSnapshotMetadata(snap.id, { label: '   ' });
  assert.equal(updated.label, 'Analysis 1');
});

test('editing metadata does not alter review baseline, timestamps, emotion results, or topic results', async () => {
  const url = 'https://shopee.ph/product/123/456';
  const original = analysis(url, 'Product', {
    reviews: [{ id: 'rev-1', text: 'Original review' }],
    reviewAnalysis: [{ review: { id: 'rev-1', text: 'Original review' }, category: 1 }],
    topicAnalysis: { results: [{ reviewIndex: 0, topics: [{ label: 'Quality', score: 0.95 }] }] },
    priorityResults: [{ score: 90, level: 'CRITICAL' }],
    timestamp: 1600000000000,
    last_refreshed_at: 1600000050000,
  });

  const snap = await saveAnalysisForPage(original);
  const snapUpdated = await updateSnapshotMetadata(snap.id, {
    label: 'Brand New Label',
    notes: 'Personal note added',
  });

  assert.equal(snapUpdated.label, 'Brand New Label');
  assert.equal(snapUpdated.notes, 'Personal note added');
  assert.deepEqual(snapUpdated.reviews, snap.reviews);
  assert.deepEqual(snapUpdated.reviewAnalysis, snap.reviewAnalysis);
  assert.deepEqual(snapUpdated.topicAnalysis, snap.topicAnalysis);
  assert.deepEqual(snapUpdated.priorityResults, snap.priorityResults);
  assert.equal(snapUpdated.timestamp, snap.timestamp);
  assert.equal(snapUpdated.last_refreshed_at, snap.last_refreshed_at);
});

test('saved analyses are isolated between users and Clear All only deletes the current user records', async () => {
  const firstUserRecord = await saveAnalysisForPage(analysis('https://shopee.ph/product/123/456', 'User one'));
  currentUserId = 'user-2';
  const secondUserRecord = await saveAnalysisForPage(analysis('https://shopee.ph/product/123/789', 'User two'));

  assert.deepEqual(Object.keys(await getPageAnalyses()), [secondUserRecord.id]);
  assert.equal(await clearAllPageAnalyses(), 1);
  currentUserId = 'user-1';
  assert.deepEqual(Object.keys(await getPageAnalyses()), [firstUserRecord.id]);
});

test('signed-out callers cannot list or mutate saved analyses', async () => {
  currentUserId = null;
  await assert.rejects(getPageAnalyses(), /Sign in to access your saved analyses/);
  await assert.rejects(
    saveAnalysisForPage(analysis('https://shopee.ph/product/123/456', 'Not saved')),
    /Sign in to access your saved analyses/,
  );
  await assert.rejects(clearAllPageAnalyses(), /Sign in to access your saved analyses/);
});
