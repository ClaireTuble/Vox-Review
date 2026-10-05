import { getPageKey } from './pageAnalysisStorage.js';

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
  const updatedState = { ...states[pageKey], ...state, pageKey, updatedAt: Date.now() };
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

  async function run(initialState, runningJob, persistInitial = true) {
    try {
      if (persistInitial) await writeState(initialState);
      const reviewTexts = initialState.reviews.map((review) => (
        typeof review === 'string' ? review : review?.text || review?.reviewText || review?.comment || review?.review || ''
      ));
      const svmResult = initialState.svmResult || await requestSvm(reviewTexts, initialState.platform);
      if (!Array.isArray(svmResult?.predictions) ||
        svmResult.predictions.length !== initialState.reviews.length ||
        svmResult.predictions.some((category) => ![1, 2, 3, 4, 5, 6].includes(category))) {
        throw new Error('SVM returned an invalid Category prediction payload.');
      }
      runningJob.state = { ...initialState, svmResult, stage: topicsEnabled ? 'topics' : 'complete' };
      await writeState(runningJob.state);

      let topicResult = initialState.topicResult || null;
      let topicError = initialState.topicError || null;
      if (topicsEnabled && !topicResult && !topicError) {
        try {
          topicResult = await requestTopics(reviewTexts, initialState.platform);
        } catch (error) {
          topicError = error?.message || 'Review topic analysis unavailable.';
        }
      }

      runningJob.state = {
        ...initialState,
        status: 'completed',
        stage: 'complete',
        svmResult,
        topicResult,
        topicError,
        completedAt: Date.now(),
      };
      const completedState = await writeState(runningJob.state);
      if (!topicError && (topicsEnabled ? topicResult !== null : true)) {
        try {
          void Promise.resolve(onCompleted(completedState)).catch(() => {});
        } catch {
          // Activity logging must not change the completed analysis result.
        }
      }
      return completedState;
    } catch (error) {
      runningJob.state = {
        ...initialState,
        status: 'error',
        stage: 'error',
        error: error?.message || 'Emotion analysis failed.',
        completedAt: Date.now(),
      };
      return writeState(runningJob.state);
    }
  }

  return {
    start(input) {
      const pageKey = getPageKey(input?.platform, input?.page_url) || input?.pageKey;
      if (!pageKey || !Array.isArray(input?.reviews)) return Promise.resolve({ ok: false, error: 'Invalid analysis context.' });

      if (jobs.has(pageKey)) {
        return jobs.get(pageKey).ready.then((result) => ({ ...result, started: false }));
      }

      const initialState = {
        ...input,
        pageKey,
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
        ready: new Promise((resolve) => { resolveReady = resolve; }),
      };
      jobs.set(pageKey, runningJob);
      const job = (async () => {
        try {
          const existingState = await readState(pageKey);
          if (existingState?.status === 'completed' && !input.force) {
            runningJob.state = existingState;
            const result = { ok: true, started: false, state: existingState };
            resolveReady(result);
            return result;
          }

          const anotherRunningJob = [...jobs.keys()].find((runningPageKey) => runningPageKey !== pageKey);
          if (anotherRunningJob) {
            const result = { ok: false, error: 'An analysis is already running for another page.' };
            resolveReady(result);
            return result;
          }

          const stateToRun = existingState?.status === 'analyzing'
            ? { ...existingState, pageKey }
            : initialState;
          runningJob.state = stateToRun;
          if (existingState?.status === 'analyzing') {
            resolveReady({ ok: true, started: false, state: stateToRun });
            return { ok: true, started: false, state: await run(stateToRun, runningJob, false) };
          }

          await writeState(stateToRun);
          resolveReady({ ok: true, started: true, state: initialState });
          return { ok: true, started: true, state: await run(stateToRun, runningJob, false) };
        } catch (error) {
          const result = { ok: false, error: error?.message || 'Analysis could not be started.' };
          resolveReady(result);
          return result;
        }
      })();
      runningJob.promise = job;
      return job.finally(() => jobs.delete(pageKey));
    },
    async resume() {
      const states = await readStates();
      const pendingState = Object.values(states).find((state) => state?.status === 'analyzing');
      if (!pendingState) return null;
      const pageKey = pendingState.pageKey || getPageKey(pendingState.platform, pendingState.page_url);
      if (!pageKey || jobs.size > 0) return null;
      void this.start({ ...pendingState, pageKey }).catch(() => {});
      return pageKey;
    },
    getRunningPageKey() {
      return jobs.keys().next().value || null;
    },
  };
}