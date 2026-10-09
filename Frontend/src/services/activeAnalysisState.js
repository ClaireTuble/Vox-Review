import { getPageKey } from './pageAnalysisStorage.js';
import { getTopicReviewSetSignature } from '../Users/utils/topicAnalysisRequest.js';

export const ACTIVE_ANALYSIS_STORAGE_KEY = 'voxreview_active_analysis_states';

function readStorage(key) {
  if (globalThis.chrome?.storage?.local) {
    return new Promise((resolve, reject) => {
      globalThis.chrome.storage.local.get([key], (result) => {
        if (globalThis.chrome.runtime?.lastError) {
          reject(new Error(globalThis.chrome.runtime.lastError.message));
          return;
        }
        resolve(result?.[key] || {});
      });
    });
  }

  try {
    return Promise.resolve(JSON.parse(localStorage.getItem(key) || '{}'));
  } catch {
    return Promise.resolve({});
  }
}

function writeStorage(key, value) {
  if (globalThis.chrome?.storage?.local) {
    return new Promise((resolve, reject) => {
      globalThis.chrome.storage.local.set({ [key]: value }, () => {
        if (globalThis.chrome.runtime?.lastError) reject(new Error(globalThis.chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function getActiveAnalysisStates() {
  return readStorage(ACTIVE_ANALYSIS_STORAGE_KEY);
}

export async function getActiveAnalysisForPage(pageKey) {
  if (!pageKey) return null;
  const states = await getActiveAnalysisStates();
  return states[pageKey] || null;
}

export async function setActiveAnalysisState(state) {
  if (!state?.platform || !state?.page_url) return null;
  const pageKey = getPageKey(state.platform, state.page_url) || state.pageKey;
  if (!pageKey) return null;

  const states = await getActiveAnalysisStates();
  const existingState = states[pageKey];
  const sameReviewSet = getActiveAnalysisReviewSetSignature(existingState) &&
    getActiveAnalysisReviewSetSignature(existingState) ===
      getActiveAnalysisReviewSetSignature(state);
  const existingTopicResult = existingState?.topicResult;
  const hasExistingSuccessfulTopics = sameReviewSet && hasCompletedTopicResult(existingState);
  const hasIncomingSuccessfulTopics = hasCompletedTopicResult(state);
  const updatedState = { ...existingState, ...state, pageKey, updatedAt: Date.now() };
  if (hasExistingSuccessfulTopics && !hasIncomingSuccessfulTopics) {
    updatedState.topicResult = existingTopicResult;
    updatedState.topicError = null;
    if (existingState.status === 'completed' && state.status === 'completed') {
      updatedState.runId = existingState.runId;
      updatedState.completedAt = existingState.completedAt;
    }
    console.info('VoxReview: Preserved successful topic result during active-state update.', {
      pageKey,
      reviewCount: existingState.reviews.length,
      reviewSetSignature: getActiveAnalysisReviewSetSignature(existingState),
      operation: 'classify',
      outcome: 'preserved',
      preservedSuccessfulResult: true,
    });
  }
  states[pageKey] = updatedState;
  await writeStorage(ACTIVE_ANALYSIS_STORAGE_KEY, states);
  return updatedState;
}

export async function deleteActiveAnalysisForPage(pageKey) {
  if (!pageKey) return;
  const states = await getActiveAnalysisStates();
  if (!states[pageKey]) return;
  delete states[pageKey];
  await writeStorage(ACTIVE_ANALYSIS_STORAGE_KEY, states);
}

function getReviewTexts(reviews) {
  return reviews.map((review) => (
    typeof review === 'string'
      ? review
      : review?.text || review?.reviewText || review?.comment || review?.review || ''
  ));
}

export function getActiveAnalysisReviewSetSignature(state) {
  return Array.isArray(state?.reviews)
    ? state.reviewSetSignature || getTopicReviewSetSignature(getReviewTexts(state.reviews))
    : null;
}

function hasCompletedTopicResult(state) {
  return Array.isArray(state?.reviews) &&
    Array.isArray(state?.topicResult?.results) &&
    state.topicResult.results.length === state.reviews.length &&
    state.topicResult.results.every((result) => Array.isArray(result?.topics));
}

export function getMatchingSavedTopicResult(activeState, savedAnalysis) {
  if (!activeState?.pageKey || !savedAnalysis) return null;
  const savedPageKey = getPageKey(savedAnalysis.platform, savedAnalysis.page_url) || savedAnalysis.pageKey;
  const activeSignature = getActiveAnalysisReviewSetSignature(activeState);
  const savedSignature = getActiveAnalysisReviewSetSignature(savedAnalysis);
  if (!activeSignature || savedPageKey !== activeState.pageKey ||
    activeSignature !== savedSignature) return null;
  return savedAnalysis.topicAnalysis || null;
}

export function isMatchingActiveAnalysisIdentity(state, identity) {
  return Boolean(identity?.reviewSetSignature) &&
    state?.pageKey === identity?.pageKey &&
    state?.runId === identity?.runId &&
    getActiveAnalysisReviewSetSignature(state) === identity?.reviewSetSignature;
}

export function createAnalysisJobCoordinator({
  readState = getActiveAnalysisForPage,
  readStates = getActiveAnalysisStates,
  writeState = setActiveAnalysisState,
  requestSvm,
  requestTopics,
  topicsEnabled = true,
  onCompleted = () => {},
}) {
  const jobs = new Map();
  let stateWriteQueue = Promise.resolve();

  function persistState(state) {
    const write = stateWriteQueue.then(() => writeState(state));
    stateWriteQueue = write.catch(() => {});
    return write;
  }

  function isCurrentJob(pageKey, runningJob) {
    return jobs.get(pageKey) === runningJob && !runningJob.controller.signal.aborted;
  }

  async function run(pageKey, initialState, runningJob, persistInitial = true) {
    try {
      if (persistInitial) await persistState(initialState);
      const reviewTexts = initialState.reviews.map((review) => (
        typeof review === 'string' ? review : review?.text || review?.reviewText || review?.comment || review?.review || ''
      ));
      const svmResult = initialState.svmResult || await requestSvm(
        reviewTexts,
        initialState.platform,
        runningJob.controller.signal,
      );
      if (!isCurrentJob(pageKey, runningJob)) return runningJob.state;
      if (!Array.isArray(svmResult?.predictions) ||
        svmResult.predictions.length !== initialState.reviews.length ||
        svmResult.predictions.some((category) => ![1, 2, 3, 4, 5, 6].includes(category))) {
        throw new Error('SVM returned an invalid Category prediction payload.');
      }
      runningJob.state = { ...initialState, svmResult, stage: topicsEnabled ? 'topics' : 'complete' };
      await persistState(runningJob.state);
      if (!isCurrentJob(pageKey, runningJob)) return runningJob.state;

      let topicResult = initialState.topicResult || null;
      let topicError = initialState.topicError || null;
      if (topicsEnabled && (!topicResult || initialState.force)) {
        try {
          topicResult = await requestTopics(
            reviewTexts,
            initialState.platform,
            runningJob.controller.signal,
            {
              pageKey,
              requestContext: initialState.requestContext || 'background-analysis',
              force: Boolean(initialState.force),
            },
          );
        } catch (error) {
          if (!isCurrentJob(pageKey, runningJob)) return runningJob.state;
          topicError = error?.message || 'Review topic analysis unavailable.';
        }
      }
      if (!isCurrentJob(pageKey, runningJob)) return runningJob.state;

      runningJob.state = {
        ...initialState,
        status: 'completed',
        stage: 'complete',
        svmResult,
        topicResult,
        topicError,
        completedAt: Date.now(),
      };
      const completedState = await persistState(runningJob.state);
      if (!isCurrentJob(pageKey, runningJob)) return runningJob.state;
      if (!topicError && (topicsEnabled ? topicResult !== null : true)) {
        try {
          void Promise.resolve(onCompleted(completedState)).catch(() => {});
        } catch {
          // Activity logging must not change the completed analysis result.
        }
      }
      return completedState;
    } catch (error) {
      if (!isCurrentJob(pageKey, runningJob)) return runningJob.state;
      runningJob.state = {
        ...initialState,
        status: 'error',
        stage: 'error',
        error: error?.message || 'Emotion analysis failed.',
        completedAt: Date.now(),
      };
      return persistState(runningJob.state);
    }
  }

  async function cancel(pageKey) {
    const runningJob = jobs.get(pageKey);
    if (!runningJob) return false;

    jobs.delete(pageKey);
    runningJob.controller.abort(new DOMException(
      "Analysis was replaced or cancelled.",
      "AbortError",
    ));
    runningJob.state = {
      ...runningJob.state,
      status: 'cancelled',
      stage: 'cancelled',
      error: null,
      completedAt: Date.now(),
    };
    runningJob.resolveReady({
      ok: false,
      error: 'Analysis was cancelled.',
      state: runningJob.state,
    });
    await persistState(runningJob.state);
    return true;
  }

  const coordinator = {
    start(input) {
      const pageKey = getPageKey(input?.platform, input?.page_url) || input?.pageKey;
      if (!pageKey || !Array.isArray(input?.reviews)) return Promise.resolve({ ok: false, error: 'Invalid analysis context.' });
      const getStateReviewSignature = getActiveAnalysisReviewSetSignature;
      const inputReviewSignature = getTopicReviewSetSignature(input.reviews.map((review) => (
        typeof review === 'string'
          ? review
          : review?.text || review?.reviewText || review?.comment || review?.review || ''
      )));

      if (jobs.has(pageKey)) {
        const runningJob = jobs.get(pageKey);
        if (input.force || runningJob.state.reviewSetSignature !== inputReviewSignature) {
          return cancel(pageKey).then(() => coordinator.start(input));
        }
        return runningJob.ready.then((result) => ({ ...result, started: false }));
      }

      const initialState = {
        ...input,
        pageKey,
        reviewSetSignature: inputReviewSignature,
        status: 'analyzing',
        stage: 'svm',
        runId: input.runId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        startedAt: Date.now(),
        completedAt: null,
        svmResult: null,
        topicResult: null,
        error: null,
        topicError: null,
      };
      let resolveReady;
      const runningJob = {
        state: initialState,
        controller: new AbortController(),
        ready: new Promise((resolve) => { resolveReady = resolve; }),
        resolveReady: (result) => resolveReady(result),
      };
      jobs.set(pageKey, runningJob);
      const job = (async () => {
        try {
          const existingState = await readState(pageKey);
          if (!isCurrentJob(pageKey, runningJob)) {
            return { ok: false, error: 'Analysis was cancelled.', state: runningJob.state };
          }
          const sameReviewSet = getStateReviewSignature(existingState) === inputReviewSignature;
          const hasCompletedTopics = Array.isArray(existingState?.topicResult?.results);
          if (existingState?.status === 'completed' && sameReviewSet && !input.force &&
            (!topicsEnabled || hasCompletedTopics)) {
            runningJob.state = existingState;
            const result = { ok: true, started: false, state: existingState };
            resolveReady(result);
            return result;
          }

          const stateToRun = existingState?.status === 'analyzing' && sameReviewSet
            ? { ...existingState, pageKey, reviewSetSignature: inputReviewSignature }
            : sameReviewSet
              ? {
                  ...initialState,
                  svmResult: input.force ? null : existingState?.svmResult || null,
                  topicResult: existingState?.topicResult || null,
                }
              : initialState;
          runningJob.state = stateToRun;
          if (existingState?.status === 'analyzing') {
            resolveReady({ ok: true, started: false, state: stateToRun });
            return { ok: true, started: false, state: await run(pageKey, stateToRun, runningJob, false) };
          }

          await persistState(stateToRun);
          if (!isCurrentJob(pageKey, runningJob)) {
            return { ok: false, error: 'Analysis was cancelled.', state: runningJob.state };
          }
          resolveReady({ ok: true, started: true, state: initialState });
          return { ok: true, started: true, state: await run(pageKey, stateToRun, runningJob, false) };
        } catch (error) {
          const result = { ok: false, error: error?.message || 'Analysis could not be started.' };
          resolveReady(result);
          return result;
        }
      })();
      runningJob.promise = job;
      return job.finally(() => {
        if (jobs.get(pageKey) === runningJob) jobs.delete(pageKey);
      });
    },
    async resume() {
      const states = await readStates();
      const pendingStates = Object.values(states)
        .filter((state) => state?.status === 'analyzing')
        .map((state) => ({
          state,
          pageKey: state.pageKey || getPageKey(state.platform, state.page_url),
        }))
        .filter(({ pageKey }) => Boolean(pageKey));

      pendingStates.forEach(({ state, pageKey }) => {
        if (!jobs.has(pageKey)) {
          void coordinator.start({
            ...state,
            pageKey,
            requestContext: 'worker-recovery',
          }).catch(() => {});
        }
      });
      return pendingStates[0]?.pageKey || null;
    },
    cancel,
    getRunningPageKey() {
      return jobs.keys().next().value || null;
    },
  };

  return coordinator;
}