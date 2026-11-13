import { getPageKey } from './pageAnalysisStorage.js';
import { getTopicReviewSetSignature } from '../Users/utils/topicAnalysisRequest.js';
import { prepareReviewsForAnalysis } from '../Users/utils/reviewLanguage.js';
import {
  filterSubstantiveReviews,
  getReviewText as extractReviewText,
  isSubstantiveReviewText,
} from '../Users/utils/reviewTopics.js';
import {
  createAnalysisReviewSample,
  DEFAULT_ANALYSIS_REVIEW_BATCH_SIZE,
  mergeSvmBatchResponses,
  mergeTopicBatchResponses,
  requestReviewBatches,
} from '../Users/utils/analysisReviewBatching.js';
import {
  ensureLegacyReviewPrivacyMigration,
  sanitizeActiveAnalysisState,
  sanitizeLegacyActiveAnalysisMap,
} from './legacyReviewPrivacyMigration.js';
import {
  detectRepeatedReviewText,
  runSuspiciousReviewCheck,
} from '../Users/utils/suspiciousReviewDetection.js';

export const ACTIVE_ANALYSIS_STORAGE_KEY = 'voxreview_active_analysis_states';

function readStorage(key) {
  return ensureLegacyReviewPrivacyMigration().then(() => {
    if (globalThis.chrome?.storage?.local) {
      return new Promise((resolve, reject) => {
        globalThis.chrome.storage.local.get([key], (result) => {
          if (globalThis.chrome.runtime?.lastError) {
            reject(new Error('Stored review data could not be safely privacy-migrated.'));
            return;
          }
          const value = result?.[key];
          resolve(value === undefined ? {} : sanitizeLegacyActiveAnalysisMap(value));
        });
      });
    }

    try {
      const raw = localStorage.getItem(key);
      const value = raw === null ? {} : JSON.parse(raw);
      return sanitizeLegacyActiveAnalysisMap(value);
    } catch {
      throw new Error('Stored review data could not be safely privacy-migrated.');
    }
  });
}

async function writeStorage(key, value) {
  await ensureLegacyReviewPrivacyMigration();
  const safeValue = key === ACTIVE_ANALYSIS_STORAGE_KEY
    ? sanitizeLegacyActiveAnalysisMap(value)
    : value;
  if (globalThis.chrome?.storage?.local) {
    return new Promise((resolve, reject) => {
      globalThis.chrome.storage.local.set({ [key]: safeValue }, () => {
        if (globalThis.chrome.runtime?.lastError) reject(new Error('Stored review data could not be safely privacy-migrated.'));
        else resolve();
      });
    });
  }

  try {
    localStorage.setItem(key, JSON.stringify(safeValue));
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
  const safeState = sanitizeActiveAnalysisState(state);
  const pageKey = getPageKey(safeState.platform, safeState.page_url) || safeState.pageKey;
  if (!pageKey) return null;

  const states = await getActiveAnalysisStates();
  const existingState = states[pageKey];
  const sameReviewSet = getActiveAnalysisReviewSetSignature(existingState) &&
    getActiveAnalysisReviewSetSignature(existingState) ===
      getActiveAnalysisReviewSetSignature(safeState);
  const existingTopicResult = existingState?.topicResult;
  const hasExistingSuccessfulTopics = sameReviewSet && hasCompletedTopicResult(existingState);
  const hasIncomingSuccessfulTopics = hasCompletedTopicResult(safeState);
  const updatedState = sanitizeActiveAnalysisState({ ...existingState, ...safeState, pageKey, updatedAt: Date.now() });
  if (hasExistingSuccessfulTopics && !hasIncomingSuccessfulTopics) {
    updatedState.topicResult = existingTopicResult;
    updatedState.topicError = null;
    if (existingState.status === 'completed' && safeState.status === 'completed') {
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
    state.topicResult.results.every((result, index) => (
      (result?.reviewIndex == null || result.reviewIndex === index) &&
      Array.isArray(result?.topics) &&
      result.topics.every((topic) => (
        typeof topic?.label === 'string' &&
        typeof topic.score === 'number' &&
        Number.isFinite(topic.score)
      ))
    ));
}

function hasCompletedSvmResult(state) {
  return Array.isArray(state?.reviews) &&
    Array.isArray(state?.svmResult?.predictions) &&
    state.svmResult.predictions.length === state.reviews.length &&
    state.svmResult.predictions.every((category) => [1, 2, 3, 4, 5, 6].includes(category));
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
  suspiciousReviewDetector = detectRepeatedReviewText,
  maxSteamReviews,
  batchSize = DEFAULT_ANALYSIS_REVIEW_BATCH_SIZE,
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
      const reportProgress = async (stage, progress) => {
        if (!isCurrentJob(pageKey, runningJob)) return;
        runningJob.state = {
          ...runningJob.state,
          stage,
          analysisProgress: { ...progress, stage },
        };
        await persistState(runningJob.state);
      };
      let svmResult = initialState.svmResult || null;
      if (!svmResult) {
        const svmResponses = await requestReviewBatches(reviewTexts, {
          batchSize: initialState.analysisSampleInfo.batchSize,
          signal: runningJob.controller.signal,
          request: (batch) => requestSvm(
            batch,
            initialState.platform,
            runningJob.controller.signal,
          ),
          onProgress: (progress) => reportProgress('svm', progress),
        });
        svmResult = mergeSvmBatchResponses(svmResponses, reviewTexts.length);
      }
      if (!isCurrentJob(pageKey, runningJob)) return runningJob.state;
      if (!Array.isArray(svmResult?.predictions) ||
        svmResult.predictions.length !== initialState.reviews.length ||
        svmResult.predictions.some((category) => ![1, 2, 3, 4, 5, 6].includes(category))) {
        throw new Error('SVM returned an invalid Category prediction payload.');
      }
      const suspiciousReviewDetection = await runSuspiciousReviewCheck(initialState.reviews, {
        enabled: initialState.suspiciousReviewDetectionEnabled === true,
        detector: suspiciousReviewDetector,
        signal: runningJob.controller.signal,
      });
      if (!isCurrentJob(pageKey, runningJob)) return runningJob.state;
      let completedSampleInfo = {
        ...initialState.analysisSampleInfo,
        analyzedReviewCount: reviewTexts.length,
        failedReviewCount: 0,
        cancelledReviewCount: 0,
        topicFailedReviewCount: 0,
      };
      const topicProgress = {
        stage: 'topics',
        completedReviews: 0,
        totalReviews: reviewTexts.length,
        completedBatches: 0,
        totalBatches: Math.ceil(reviewTexts.length / initialState.analysisSampleInfo.batchSize),
        batchSize: initialState.analysisSampleInfo.batchSize,
      };
      runningJob.state = {
        ...initialState,
        svmResult,
        suspiciousReviewDetection,
        analysisSampleInfo: completedSampleInfo,
        stage: topicsEnabled ? 'topics' : 'complete',
        analysisProgress: topicsEnabled ? topicProgress : {
          ...topicProgress,
          stage: 'complete',
          completedReviews: reviewTexts.length,
          completedBatches: topicProgress.totalBatches,
        },
      };
      await persistState(runningJob.state);
      if (!isCurrentJob(pageKey, runningJob)) return runningJob.state;

      let topicResult = initialState.topicResult || null;
      let topicError = initialState.topicError || null;
      if (topicsEnabled && (!topicResult || initialState.force)) {
        try {
          const topicResponses = await requestReviewBatches(reviewTexts, {
            batchSize: initialState.analysisSampleInfo.batchSize,
            signal: runningJob.controller.signal,
            request: (batch) => requestTopics(
              batch,
              initialState.platform,
              runningJob.controller.signal,
              {
                pageKey,
                requestContext: initialState.requestContext || 'background-analysis',
                force: Boolean(initialState.force),
              },
            ),
            onProgress: (progress) => reportProgress('topics', progress),
          });
          topicResult = mergeTopicBatchResponses(topicResponses, reviewTexts.length);
        } catch (error) {
          if (!isCurrentJob(pageKey, runningJob)) return runningJob.state;
          const diagnostics = [];
          if (Number.isInteger(error?.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599) {
            diagnostics.push(`HTTP ${error.httpStatus}`);
          }
          if (typeof error?.code === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(error.code)) {
            diagnostics.push(`code ${error.code}`);
          }
          topicError = [
            error?.message || 'Review topic analysis unavailable.',
            diagnostics.length ? diagnostics.join(', ') : null,
          ].filter(Boolean).join(' — ');
          completedSampleInfo = {
            ...completedSampleInfo,
            topicFailedReviewCount: reviewTexts.length,
          };
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
        suspiciousReviewDetection,
        analysisSampleInfo: completedSampleInfo,
        analysisProgress: {
          stage: 'complete',
          completedReviews: reviewTexts.length,
          totalReviews: reviewTexts.length,
          completedBatches: Math.ceil(reviewTexts.length / initialState.analysisSampleInfo.batchSize),
          totalBatches: Math.ceil(reviewTexts.length / initialState.analysisSampleInfo.batchSize),
          batchSize: initialState.analysisSampleInfo.batchSize,
        },
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
        analysisSampleInfo: {
          ...initialState.analysisSampleInfo,
          analyzedReviewCount: 0,
          failedReviewCount: initialState.reviews.length,
          cancelledReviewCount: 0,
        },
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
      analysisSampleInfo: {
        ...runningJob.state.analysisSampleInfo,
        analyzedReviewCount: hasCompletedSvmResult(runningJob.state)
          ? runningJob.state.reviews.length
          : 0,
        failedReviewCount: 0,
        cancelledReviewCount: hasCompletedSvmResult(runningJob.state)
          ? 0
          : runningJob.state.reviews.length,
      },
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
    async start(input) {
      const pageKey = getPageKey(input?.platform, input?.page_url) || input?.pageKey;
      if (!pageKey || !Array.isArray(input?.reviews)) return Promise.resolve({ ok: false, error: 'Invalid analysis context.' });
      const sample = input.analysisSampleInfo
        ? { reviews: input.reviews, sampleInfo: input.analysisSampleInfo }
        : createAnalysisReviewSample(input.reviews, {
            platform: input.platform,
            offset: input.sampleOffset || 0,
            maxSteamReviews,
            batchSize,
            sourceReviewCount: input.sourceReviewCount ?? input.reviews.length,
          });
      const substantiveReviews = filterSubstantiveReviews(sample.reviews);
      const emptyReviewRecords = sample.reviews.filter((review) => (
        !isSubstantiveReviewText(extractReviewText(review))
      ));
      const prepared = await prepareReviewsForAnalysis(substantiveReviews);
      const inputSkippedReviews = Array.isArray(input.skippedReviews) ? input.skippedReviews : [];
      const emptyReviewSkips = emptyReviewRecords.map((review) => ({
        review,
        status: 'skipped',
        reason: 'empty_review',
      }));
      const analysisSampleInfo = {
        ...sample.sampleInfo,
        sourceReviewCount: input.sourceReviewCount ?? sample.sampleInfo.sourceReviewCount,
        extractedReviewCount: input.sourceReviewCount ?? sample.sampleInfo.extractedReviewCount ?? sample.sampleInfo.sourceReviewCount,
        emptyReviewCount: Math.max(
          sample.sampleInfo.emptyReviewCount || 0,
          inputSkippedReviews.filter((entry) => entry?.reason === 'empty_review').length +
            emptyReviewRecords.length,
        ),
        supportedReviewCount: prepared.supportedReviewCount,
        uncertainReviewCount: prepared.uncertainReviewCount,
        analyzedReviewCount: 0,
        failedReviewCount: 0,
        cancelledReviewCount: 0,
        topicFailedReviewCount: 0,
        unsupportedReviewCount: inputSkippedReviews.filter((entry) => (
          entry?.reason === 'unsupported_language'
        )).length + prepared.skippedReviews.length,
      };
      const analysisInput = {
        ...input,
        reviews: prepared.reviews,
        analysisSampleInfo,
        skippedReviews: [
          ...inputSkippedReviews,
          ...emptyReviewSkips,
          ...prepared.skippedReviews,
        ],
      };
      if (analysisInput.reviews.length === 0) {
        return {
          ok: false,
          error: `No supported-language reviews were available for analysis. ${analysisInput.skippedReviews.length} review(s) were skipped.`,
          skippedReviews: analysisInput.skippedReviews,
        };
      }
      const getStateReviewSignature = getActiveAnalysisReviewSetSignature;
      const inputReviewSignature = getTopicReviewSetSignature(analysisInput.reviews.map((review) => (
        typeof review === 'string'
          ? review
          : review?.text || review?.reviewText || review?.comment || review?.review || ''
      )));

      if (jobs.has(pageKey)) {
        const runningJob = jobs.get(pageKey);
        if (analysisInput.force || runningJob.state.reviewSetSignature !== inputReviewSignature) {
          return cancel(pageKey).then(() => coordinator.start(analysisInput));
        }
        return runningJob.ready.then((result) => ({ ...result, started: false }));
      }

      const initialState = {
        ...analysisInput,
        pageKey,
        reviewSetSignature: inputReviewSignature,
        status: 'analyzing',
        stage: 'svm',
        runId: analysisInput.runId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        startedAt: Date.now(),
        completedAt: null,
        svmResult: null,
        topicResult: null,
        suspiciousReviewDetection: {
          status: analysisInput.suspiciousReviewDetectionEnabled === true ? 'unavailable' : 'disabled',
          reason: analysisInput.suspiciousReviewDetectionEnabled === true ? 'detector_not_configured' : 'not_enabled',
          evaluatedCount: 0,
          results: [],
        },
        error: null,
        topicError: null,
        analysisSampleInfo,
        analysisProgress: {
          stage: 'svm',
          completedReviews: 0,
          totalReviews: analysisInput.reviews.length,
          completedBatches: 0,
          totalBatches: Math.ceil(analysisInput.reviews.length / analysisSampleInfo.batchSize),
          batchSize: analysisSampleInfo.batchSize,
        },
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
          const hasCompletedTopics = hasCompletedTopicResult(existingState);
          const hasCompletedSvm = hasCompletedSvmResult(existingState);
          if (existingState?.status === 'completed' && sameReviewSet && hasCompletedSvm && !analysisInput.force &&
            (!topicsEnabled || hasCompletedTopics)) {
            const suspiciousReviewDetection = await runSuspiciousReviewCheck(analysisInput.reviews, {
              enabled: analysisInput.suspiciousReviewDetectionEnabled === true,
              detector: suspiciousReviewDetector,
              signal: runningJob.controller.signal,
            });
            runningJob.state = {
              ...existingState,
              suspiciousReviewDetection,
              suspiciousReviewDetectionEnabled: analysisInput.suspiciousReviewDetectionEnabled === true,
              excludeFlaggedFromEmotion: analysisInput.excludeFlaggedFromEmotion === true,
              skippedReviews: analysisInput.skippedReviews,
              analysisSampleInfo: {
                ...analysisSampleInfo,
                analyzedReviewCount: prepared.reviews.length,
                failedReviewCount: 0,
                cancelledReviewCount: 0,
                topicFailedReviewCount: existingState.topicError ? prepared.reviews.length : 0,
              },
            };
            const updatedState = await persistState(runningJob.state);
            if (!isCurrentJob(pageKey, runningJob)) {
              return { ok: false, error: 'Analysis was cancelled.', state: runningJob.state };
            }
            runningJob.state = updatedState;
            const result = { ok: true, started: false, state: updatedState };
            resolveReady(result);
            return result;
          }

          const stateToRun = existingState?.status === 'analyzing' && sameReviewSet
            ? {
                ...existingState,
                pageKey,
                reviewSetSignature: inputReviewSignature,
                suspiciousReviewDetectionEnabled: analysisInput.suspiciousReviewDetectionEnabled === true,
                excludeFlaggedFromEmotion: analysisInput.excludeFlaggedFromEmotion === true,
                skippedReviews: analysisInput.skippedReviews,
                analysisSampleInfo: {
                  ...analysisSampleInfo,
                  analyzedReviewCount: hasCompletedSvm ? prepared.reviews.length : 0,
                },
                topicResult: hasCompletedTopics ? existingState.topicResult : null,
                topicError: null,
              }
            : sameReviewSet
              ? {
                  ...initialState,
                  suspiciousReviewDetectionEnabled: analysisInput.suspiciousReviewDetectionEnabled === true,
                  excludeFlaggedFromEmotion: analysisInput.excludeFlaggedFromEmotion === true,
                  svmResult: analysisInput.force || !hasCompletedSvm ? null : existingState.svmResult,
                  analysisSampleInfo: {
                    ...analysisSampleInfo,
                    analyzedReviewCount: !analysisInput.force && hasCompletedSvm
                      ? prepared.reviews.length
                      : 0,
                  },
                  topicResult: hasCompletedTopics ? existingState.topicResult : null,
                  topicError: null,
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