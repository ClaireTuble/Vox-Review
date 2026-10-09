import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  ACTIVE_ANALYSIS_STORAGE_KEY,
  createAnalysisJobCoordinator,
  deleteActiveAnalysisForPage,
  getActiveAnalysisForPage,
  setActiveAnalysisState,
} from './activeAnalysisState.js';
import { getPageKey } from './pageAnalysisStorage.js';
import { getTopicReviewSetSignature } from '../Users/utils/topicAnalysisRequest.js';

let storage;
globalThis.chrome = {
  runtime: { lastError: null },
  storage: {
    local: {
      get(keys, callback) {
        callback({ [keys[0]]: structuredClone(storage[keys[0]] || {}) });
      },
      set(values, callback) {
        Object.assign(storage, structuredClone(values));
        callback?.();
      },
    },
  },
};

beforeEach(() => { storage = {}; });
afterEach(() => { storage = {}; });

function input(url = 'https://shopee.ph/product/123/456') {
  return {
    platform: 'shopee',
    page_url: url,
    pageKey: getPageKey('shopee', url),
    productTitle: 'Example product',
    reviews: [{ text: 'Works well' }],
  };
}

test('active state persists independently of saved history by canonical page key', async () => {
  const record = await setActiveAnalysisState({ ...input(), status: 'completed', startedAt: 10, completedAt: 20 });

  assert.equal(record.pageKey, 'shopee:i.123.456');
  assert.equal((await getActiveAnalysisForPage(getPageKey('shopee', 'https://shopee.ph/product/123/456?ref=popup'))).status, 'completed');
  assert.deepEqual(Object.keys(storage), [ACTIVE_ANALYSIS_STORAGE_KEY]);
});

test('returning to a prior page restores its results without showing another page state', async () => {
  const firstPage = input();
  await setActiveAnalysisState({
    ...firstPage,
    status: 'completed',
    svmResult: { predictions: [1] },
    topicResult: { results: [{ topics: [] }] },
  });

  const otherPageKey = getPageKey('shopee', 'https://shopee.ph/product/123/789');
  assert.equal(await getActiveAnalysisForPage(otherPageKey), null);
  const restored = await getActiveAnalysisForPage(firstPage.pageKey);
  assert.equal(restored.status, 'completed');
  assert.deepEqual(restored.svmResult.predictions, [1]);
  assert.equal(restored.topicResult.results.length, 1);
});

test('clearing active state removes only that page and leaves saved history untouched', async () => {
  const firstPage = input();
  const secondPage = input('https://shopee.ph/product/123/789');
  await setActiveAnalysisState({ ...firstPage, status: 'completed' });
  await setActiveAnalysisState({ ...secondPage, status: 'completed' });
  storage.voxreview_page_analyses = { [firstPage.pageKey]: { targetTitle: 'Saved result' } };

  await deleteActiveAnalysisForPage(firstPage.pageKey);

  assert.equal(await getActiveAnalysisForPage(firstPage.pageKey), null);
  assert.equal((await getActiveAnalysisForPage(secondPage.pageKey)).status, 'completed');
  assert.equal(storage.voxreview_page_analyses[firstPage.pageKey].targetTitle, 'Saved result');
});

test('completed state restores without rerunning SVM or Topic Analysis', async () => {
  await setActiveAnalysisState({ ...input(), status: 'completed', svmResult: { predictions: [1] }, topicResult: { results: [] } });
  let svmCalls = 0;
  let topicCalls = 0;
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: async () => { svmCalls += 1; return { predictions: [1] }; },
    requestTopics: async () => { topicCalls += 1; return { results: [] }; },
  });

  const result = await coordinator.start(input());

  assert.equal(result.started, false);
  assert.equal(result.state.status, 'completed');
  assert.equal(svmCalls, 0);
  assert.equal(topicCalls, 0);
});

test('includes the source platform in the SVM request', async () => {
  let requestedPlatform;
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: async (_reviews, platform) => {
      requestedPlatform = platform;
      return { predictions: [1] };
    },
    topicsEnabled: false,
  });

  await coordinator.start(input());

  assert.equal(requestedPlatform, 'shopee');
});

test('only an explicit Rescan replaces a completed page result', async () => {
  let svmCalls = 0;
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: async () => ({ predictions: [++svmCalls] }),
    requestTopics: async () => ({ results: [{ topics: [] }] }),
  });

  await coordinator.start(input());
  const reopened = await coordinator.start(input());
  assert.equal(reopened.started, false);
  assert.equal(svmCalls, 1);

  const rescanned = await coordinator.start({ ...input(), force: true });
  assert.equal(rescanned.started, true);
  assert.equal(svmCalls, 2);
});

test('ongoing jobs persist state and duplicate starts reconnect without duplicate requests', async () => {
  let resolveSvm;
  let svmCalls = 0;
  let topicCalls = 0;
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: () => {
      svmCalls += 1;
      return new Promise((resolve) => { resolveSvm = resolve; });
    },
    requestTopics: async () => { topicCalls += 1; return { results: [] }; },
  });

  const running = coordinator.start(input());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const reconnect = await coordinator.start(input());

  assert.equal((await getActiveAnalysisForPage(input().pageKey)).status, 'analyzing');
  assert.equal(reconnect.started, false);
  assert.equal(svmCalls, 1);
  resolveSvm({ predictions: [1] });
  const finished = await running;
  assert.equal(finished.state.status, 'completed');
  assert.equal(topicCalls, 1);
});

test('worker recovery resumes Topic Analysis from the persisted SVM checkpoint', async () => {
  const page = input();
  await setActiveAnalysisState({
    ...page,
    status: 'analyzing',
    stage: 'topics',
    startedAt: 10,
    svmResult: { predictions: [1], results: [] },
  });
  let svmCalls = 0;
  let topicCalls = 0;
  const recoveredCoordinator = createAnalysisJobCoordinator({
    requestSvm: async () => { svmCalls += 1; return { predictions: [1] }; },
    requestTopics: async () => { topicCalls += 1; return { results: [{ topics: [] }] }; },
  });

  assert.equal(await recoveredCoordinator.resume(), page.pageKey);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const recovered = await getActiveAnalysisForPage(page.pageKey);
  assert.equal(recovered.status, 'completed');
  assert.equal(svmCalls, 0);
  assert.equal(topicCalls, 1);
});

test('different page keys keep independent simultaneous analysis jobs', async () => {
  const resolveSvm = [];
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: () => new Promise((resolve) => { resolveSvm.push(resolve); }),
    requestTopics: async () => ({ results: [] }),
  });
  const firstRun = coordinator.start(input());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const secondInput = input('https://shopee.ph/product/123/789');
  const secondRun = coordinator.start(secondInput);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal((await getActiveAnalysisForPage(input().pageKey)).status, 'analyzing');
  assert.equal((await getActiveAnalysisForPage(secondInput.pageKey)).status, 'analyzing');
  assert.equal(resolveSvm.length, 2);
  resolveSvm[1]({ predictions: [1] });
  resolveSvm[0]({ predictions: [1] });
  const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);

  assert.equal(firstResult.state.status, 'completed');
  assert.equal(secondResult.state.status, 'completed');
});

test('an explicit Rescan cancels and replaces the in-progress job for that page', async () => {
  const pendingSvm = [];
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: (_reviews, _platform, signal) => new Promise((resolve, reject) => {
      const abort = () => reject(Object.assign(new Error('request aborted'), { name: 'AbortError' }));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
      pendingSvm.push((result) => {
        signal.removeEventListener('abort', abort);
        resolve(result);
      });
    }),
    requestTopics: async () => ({ results: [] }),
  });

  const firstRun = coordinator.start(input());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const replacementRun = coordinator.start({ ...input(), force: true });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(pendingSvm.length, 2);
  pendingSvm[1]({ predictions: [2] });
  const [cancelled, replacement] = await Promise.all([firstRun, replacementRun]);

  assert.equal(cancelled.state.status, 'cancelled');
  assert.equal(replacement.state.status, 'completed');
  assert.deepEqual((await getActiveAnalysisForPage(input().pageKey)).svmResult.predictions, [2]);
});

test('a replacement during Topic Analysis stays current and ignores the cancelled request error', async () => {
  const pendingTopics = [];
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: async () => ({ predictions: [1] }),
    requestTopics: (_reviews, _platform, signal) => new Promise((resolve, reject) => {
      const abort = () => reject(Object.assign(new Error('topic request aborted'), { name: 'AbortError' }));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
      pendingTopics.push({
        signal,
        resolve: (result) => {
          signal.removeEventListener('abort', abort);
          resolve(result);
        },
      });
    }),
  });

  const originalRun = coordinator.start(input());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(pendingTopics.length, 1);

  const replacementRun = coordinator.start({ ...input(), force: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(pendingTopics.length, 2);
  assert.equal(pendingTopics[0].signal.aborted, true);
  pendingTopics[1].resolve({ results: [{ reviewIndex: 0, topics: [{ label: 'Quality', score: 0.9 }] }] });

  const [cancelled, replacement] = await Promise.all([originalRun, replacementRun]);
  const persisted = await getActiveAnalysisForPage(input().pageKey);
  assert.equal(cancelled.state.status, 'cancelled');
  assert.equal(replacement.state.status, 'completed');
  assert.equal(replacement.state.topicError, null);
  assert.equal(persisted.runId, replacement.state.runId);
  assert.equal(persisted.topicResult.results[0].topics[0].label, 'Quality');
});

test('Topic failures remain completed and SVM failures are persisted', async () => {
  const activityEvents = [];
  const topicsUnavailable = createAnalysisJobCoordinator({
    requestSvm: async () => ({ predictions: [1] }),
    requestTopics: async () => { throw new Error('topic offline'); },
    onCompleted: async (state) => activityEvents.push(state.runId),
  });
  const completed = await topicsUnavailable.start(input());
  assert.equal(completed.state.status, 'completed');
  assert.equal(completed.state.topicError, 'topic offline');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(activityEvents, []);

  const failedEvents = [];
  const svmUnavailable = createAnalysisJobCoordinator({
    requestSvm: async () => { throw new Error('svm offline'); },
    requestTopics: async () => ({ results: [] }),
    onCompleted: async (state) => failedEvents.push(state.runId),
  });
  const failed = await svmUnavailable.start(input('https://shopee.ph/product/123/789'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(failed.state.status, 'error');
  assert.equal(failed.state.error, 'svm offline');
  assert.deepEqual(failedEvents, []);
});

test('successful SVM and Topic completion emits one activity after final state is persisted', async () => {
  const events = [];
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: async () => ({ predictions: [1] }),
    requestTopics: async () => ({ results: [{ topics: [] }] }),
    onCompleted: async (state) => {
      assert.equal((await getActiveAnalysisForPage(state.pageKey)).status, 'completed');
      events.push(state.runId);
    },
  });

  const result = await coordinator.start(input());
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.state.status, 'completed');
  assert.equal(events.length, 1);
  assert.equal(events[0], result.state.runId);
});

test('closing the popup during analysis does not stop background completion reporting', async () => {
  let resolveSvm;
  const events = [];
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: () => new Promise((resolve) => { resolveSvm = resolve; }),
    requestTopics: async () => ({ results: [{ topics: [] }] }),
    onCompleted: async (state) => events.push(state.runId),
  });
  const run = coordinator.start(input());
  await new Promise((resolve) => setTimeout(resolve, 0));

  resolveSvm({ predictions: [1] });
  const result = await run;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.state.status, 'completed');
  assert.equal(events.length, 1);
});

test('popup reopen and repeated state restoration do not report another activity', async () => {
  const events = [];
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: async () => ({ predictions: [1] }),
    requestTopics: async () => ({ results: [{ topics: [] }] }),
    onCompleted: async (state) => events.push(state.runId),
  });

  const first = await coordinator.start(input());
  await new Promise((resolve) => setTimeout(resolve, 0));
  await coordinator.start(input());
  await coordinator.start(input());
  await getActiveAnalysisForPage(first.state.pageKey);

  assert.equal(events.length, 1);
});

test('a successful Rescan run emits one additional activity for its new run ID', async () => {
  const events = [];
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: async () => ({ predictions: [1] }),
    requestTopics: async () => ({ results: [{ topics: [] }] }),
    onCompleted: async (state) => events.push(state.runId),
  });

  const original = await coordinator.start(input());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rescanned = await coordinator.start({ ...input(), force: true });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(events.length, 2);
  assert.notEqual(events[0], events[1]);
  assert.equal(rescanned.state.runId === original.state.runId, false);
});

test('activity reporting failure does not fail a successful analysis', async () => {
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: async () => ({ predictions: [1] }),
    requestTopics: async () => ({ results: [{ topics: [] }] }),
    onCompleted: async () => { throw new Error('activity endpoint unavailable'); },
  });

  const result = await coordinator.start(input());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(result.state.status, 'completed');
});

test('same page with a different review set starts a fresh analysis', async () => {
  let svmCalls = 0;
  let topicCalls = 0;
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: async () => { svmCalls += 1; return { predictions: [1] }; },
    requestTopics: async () => { topicCalls += 1; return { results: [{ topics: [] }] }; },
  });

  await coordinator.start(input());
  const changedReviews = {
    ...input(),
    reviews: [{ text: 'A different review' }],
  };
  const changed = await coordinator.start(changedReviews);

  assert.equal(changed.started, true);
  assert.equal(svmCalls, 2);
  assert.equal(topicCalls, 2);
  assert.equal(changed.state.reviewSetSignature, getTopicReviewSetSignature(['A different review']));
});

test('a failed same-review Rescan retains the previous successful topic result', async () => {
  const previousTopicResult = { results: [{ reviewIndex: 0, topics: [{ label: 'Quality', score: 0.8 }] }] };
  let topicCalls = 0;
  const coordinator = createAnalysisJobCoordinator({
    requestSvm: async () => ({ predictions: [1] }),
    requestTopics: async () => {
      topicCalls += 1;
      if (topicCalls > 1) throw Object.assign(new Error('temporary topic failure'), { httpStatus: 503 });
      return previousTopicResult;
    },
  });

  const first = await coordinator.start(input());
  const rescanned = await coordinator.start({ ...input(), force: true });

  assert.deepEqual(first.state.topicResult, previousTopicResult);
  assert.deepEqual(rescanned.state.topicResult, previousTopicResult);
  assert.match(rescanned.state.topicError, /temporary topic failure/);
  assert.equal(rescanned.state.status, 'completed');
});