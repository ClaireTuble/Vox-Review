import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PersistentJsonWorker } from "../utils/persistentJsonWorker.js";
import { getTopicProcessTimeoutMs } from "../utils/topicWorkerTimeout.js";
import {
  createTopicAnalysisResultCache,
  computeAndCacheTopicResult,
  getTopicResultCacheKey,
  getTopicReviewSetSignature,
  runTopicKeywordScoreBatches,
} from "../utils/topicAnalysisResultCache.js";
import {
  getTopicWorkerFailureDetails,
  getSafeTopicRequestMetadata,
  sanitizeTopicWorkerStderr,
} from "../utils/topicWorkerDiagnostics.js";

const controllerDirectory = path.dirname(fileURLToPath(import.meta.url));
const nlpDirectory = path.resolve(controllerDirectory, "../../../Frontend/nlp");
const svmWorkerScript = path.join(nlpDirectory, "svm_worker.py");
const topicWorkerScript = path.join(nlpDirectory, "topic_worker.py");
const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
const svmWorkerTimeoutMs = Number(process.env.SVM_WORKER_TIMEOUT_MS || 60000);
const validCategories = new Set([1, 2, 3, 4, 5, 6]);
const validTopicLabels = new Set([
  "Quality", "Performance / Functionality", "Features / Content", "Service / Support",
  "Delivery / Transaction", "Price / Value", "Usability / Experience",
  "Accuracy / Expectations", "Availability / Accessibility", "Environment / Location", "Other / General",
]);
const validTopicOperations = new Set(["classify", "keyword-scores"]);
let topicWorker = null;
let topicWorkerBuffer = "";
let topicRequestId = 0;
let isProcessingTopic = false;
let isStoppingTopicWorker = false;
let activeTopicDiagnostics = null;
let topicWorkerRequestId = null;
const pendingTopicRequests = new Map();
const topicQueue = [];
const topicRequestDiagnostics = new Map();
const topicWorkerRequestIds = new WeakMap();
const topicResultCache = createTopicAnalysisResultCache();
const inFlightTopicComputations = new Map();
const TOPIC_KEYWORD_QUEUE_BATCH_SIZE = 32;
const svmWorker = new PersistentJsonWorker({
  command: pythonExecutable,
  args: [svmWorkerScript],
  cwd: nlpDirectory,
  timeoutMs: svmWorkerTimeoutMs,
});
process.once("exit", () => svmWorker.dispose());
function safeTopicDiagnosticText(value, reviews) {
  let text = String(value ?? "");
  reviews.forEach((review) => {
    if (typeof review === "string" && review) {
      text = text.split(review).join("[review text redacted]");
    }
  });
  return text
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/\b(password|token|api[_ -]?key|secret)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1$2[redacted]")
    .slice(-2000);
}

function getTopicResultCounts(response) {
  const results = Array.isArray(response?.results) ? response.results : null;
  return {
    resultCount: results?.length ?? null,
    assignmentCount: results
      ? results.reduce((total, result) => total + (Array.isArray(result?.topics) ? result.topics.length : 0), 0)
      : null,
    topicScoreCount: results
      ? results.reduce((total, result) => total + (Array.isArray(result?.topicScores) ? result.topicScores.length : 0), 0)
      : null,
  };
}

function getTopicReviewBatchStats(reviews) {
  const lengths = reviews.map((review) => review.length);
  const totalCharacters = lengths.reduce((total, length) => total + length, 0);
  return {
    reviewCount: reviews.length,
    minReviewTextLength: lengths.length ? Math.min(...lengths) : 0,
    maxReviewTextLength: lengths.length ? Math.max(...lengths) : 0,
    averageReviewTextLength: lengths.length ? totalCharacters / lengths.length : 0,
    totalCharacters,
    reviewsAbove500Chars: lengths.filter((length) => length > 500).length,
    reviewsAbove1000Chars: lengths.filter((length) => length > 1000).length,
    reviewsAbove2000Chars: lengths.filter((length) => length > 2000).length,
    reviewsAbove4000Chars: lengths.filter((length) => length > 4000).length,
  };
}

function logTopicWorkerResult(diagnostics, response = null) {
  if (!diagnostics || diagnostics.workerResultLogged) return;
  diagnostics.workerResultLogged = true;
  const counts = getTopicResultCounts(response);
  diagnostics.resultCount = counts.resultCount;
  diagnostics.assignmentCount = counts.assignmentCount;
  diagnostics.topicScoreCount = counts.topicScoreCount;
  console.log("[TOPIC WORKER RESULT]", {
    requestId: diagnostics.requestId,
    clientRequestId: diagnostics.clientRequestId,
    requestContext: diagnostics.requestContext,
    elapsedMs: diagnostics.workerStartedAt
      ? Date.now() - diagnostics.workerStartedAt
      : null,
    workerExitCode: diagnostics.workerExitCode,
    stdoutValidJson: diagnostics.stdoutValidJson,
    resultCount: diagnostics.resultCount,
    assignmentCount: diagnostics.assignmentCount,
    topicScoreCount: diagnostics.topicScoreCount,
  });
}

function validateSvmResponse(response, reviewCount) {
  const predictions = response?.predictions;
  const results = response?.results;
  const categoryDrivers = response?.categoryDrivers;
  if (
    !Array.isArray(predictions) ||
    predictions.length !== reviewCount ||
    predictions.some((category) => !validCategories.has(category)) ||
    (results !== undefined && (
      !Array.isArray(results) ||
      results.length !== reviewCount ||
      results.some((result, index) => (
        result?.category !== predictions[index] ||
        !Array.isArray(result?.emotionDrivers) ||
        result.emotionDrivers.some((driver) => typeof driver !== "string")
      ))
    )) ||
    (categoryDrivers !== undefined && (
      typeof categoryDrivers !== "object" ||
      Object.values(categoryDrivers).some((drivers) => (
        !Array.isArray(drivers) || drivers.some((driver) => typeof driver !== "string")
      ))
    ))
  ) {
    throw new Error("SVM returned an invalid prediction explanation payload");
  }

  return {
    predictions,
    results: Array.isArray(results)
      ? results
      : predictions.map((category) => ({ category, emotionDrivers: [] })),
    categoryDrivers: categoryDrivers && typeof categoryDrivers === "object"
      ? categoryDrivers
      : {},
  };
}

export async function predictSvm(req, res) {
  const reviews = req.body?.reviews;
  if (!Array.isArray(reviews) || reviews.length === 0 || reviews.length > 500) {
    return res.status(400).json({
      success: false,
      error: "reviews must contain between 1 and 500 items",
    });
  }

  if (reviews.some((review) => typeof review !== "string" || !review.trim())) {
    return res.status(400).json({
      success: false,
      error: "each review must be a non-empty string",
    });
  }

  const workerAbortController = new AbortController();
  const abortWorkerRequest = () => workerAbortController.abort();
  const abortWorkerOnResponseClose = () => {
    if (!res.writableEnded) abortWorkerRequest();
  };
  req.once("aborted", abortWorkerRequest);
  res.once("close", abortWorkerOnResponseClose);

  try {
    const workerResponse = await svmWorker.request(
      { reviews },
      { signal: workerAbortController.signal },
    );
    if (workerResponse.success !== true) {
      throw new Error("SVM worker returned an unsuccessful response");
    }
    const predictionResponse = validateSvmResponse(workerResponse, reviews.length);
    return res.json({ success: true, ...predictionResponse });
  } catch (error) {
    if (req.aborted || res.destroyed) return;
    if (error.code === "ETIMEDOUT") {
      return res.status(504).json({
        success: false,
        error: "SVM prediction timed out. Please retry.",
      });
    }
    console.error("VoxReview SVM prediction error:", error);
    return res.status(503).json({
      success: false,
      error: "SVM prediction service unavailable",
    });
  } finally {
    req.removeListener("aborted", abortWorkerRequest);
    res.removeListener("close", abortWorkerOnResponseClose);
  }
}

function stopTopicWorker(error, workerExitCode = topicWorker?.exitCode ?? null) {
  const worker = topicWorker;
  topicWorker = null;
  topicWorkerBuffer = "";
  topicWorkerRequestId = null;
  isProcessingTopic = false;
  if (activeTopicDiagnostics) activeTopicDiagnostics.workerExitCode = workerExitCode;
  const pendingRequests = [...pendingTopicRequests.values()];
  pendingTopicRequests.clear();
  isStoppingTopicWorker = true;
  pendingRequests.forEach(({ reject }) => reject(error));
  activeTopicDiagnostics = null;
  if (worker && !worker.killed) {
    try {
      worker.kill();
    } catch {
      // Ignore cleanup error
    }
  }
  isStoppingTopicWorker = false;
  processNextTopicRequest();
}

function ensureTopicWorker(requestId) {
  if (topicWorker) {
    console.log("[TOPIC WORKER REUSE]", {
      requestId,
      workerPid: topicWorker.pid ?? null,
    });
    return topicWorker;
  }
  const worker = spawn(pythonExecutable, [topicWorkerScript], {
    cwd: nlpDirectory,
    windowsHide: true,
    env: {
      ...process.env,
      OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || "8",
      MKL_NUM_THREADS: process.env.MKL_NUM_THREADS || "8",
      TORCH_NUM_THREADS: process.env.TORCH_NUM_THREADS || "8",
    },
  });
  topicWorker = worker;
  topicWorkerRequestIds.set(worker, requestId);
  let stderrBuffer = "";
  console.log("[TOPIC WORKER SPAWN REQUESTED]", {
    requestId,
    workerPid: worker.pid ?? null,
  });
  worker.on("spawn", () => {
    console.log("[TOPIC WORKER SPAWN]", {
      requestId,
      workerPid: worker.pid ?? null,
      elapsedMs: activeTopicDiagnostics?.requestId === requestId
        ? Date.now() - activeTopicDiagnostics.workerStartedAt
        : null,
    });
  });
  worker.stdin.on("error", (err) => {
    const diagnostics = activeTopicDiagnostics;
    console.error("[TOPIC WORKER STDIN ERROR]", {
      requestId: diagnostics?.requestId ?? requestId,
      errorMessage: safeTopicDiagnosticText(err?.message || err, diagnostics?.reviews || []),
    });
  });
  worker.stdout.on("data", (chunk) => {
    const chunkText = chunk.toString();
    const workerRequestId = topicWorkerRequestIds.get(worker) ?? requestId;
    const diagnostics = topicRequestDiagnostics.get(workerRequestId) || activeTopicDiagnostics;
    if (diagnostics) {
      diagnostics.stdoutBytesReceived += Buffer.byteLength(chunkText);
      console.log("[TOPIC WORKER STDOUT]", {
        requestId: diagnostics.requestId,
        receivedBytes: Buffer.byteLength(chunkText),
        totalReceivedBytes: diagnostics.stdoutBytesReceived,
        bufferedBytes: Buffer.byteLength(topicWorkerBuffer) + Buffer.byteLength(chunkText),
        elapsedMs: Date.now() - diagnostics.workerStartedAt,
      });
    }
    topicWorkerBuffer += chunkText;
    const lines = topicWorkerBuffer.split(/\r?\n/);
    topicWorkerBuffer = lines.pop() || "";
    lines.filter(Boolean).forEach((line) => {
      try {
        const response = JSON.parse(line);
        const pending = pendingTopicRequests.get(response.id);
        const responseDiagnostics = topicRequestDiagnostics.get(response?.id) || activeTopicDiagnostics;
        if (responseDiagnostics) {
          responseDiagnostics.stdoutValidJson = true;
          console.log("[TOPIC WORKER JSON]", {
            requestId: responseDiagnostics.requestId,
            responseRequestId: response?.id ?? null,
            matchesPendingRequest: Boolean(pending),
            success: response?.success === true,
            ...getTopicResultCounts(response),
          });
          logTopicWorkerResult(responseDiagnostics, response);
        }
        if (!pending) return;
        pendingTopicRequests.delete(response.id);
        pending.resolve(response);
      } catch (error) {
        if (activeTopicDiagnostics) {
          activeTopicDiagnostics.stdoutValidJson = false;
          logTopicWorkerResult(activeTopicDiagnostics);
          console.error("[TOPIC WORKER JSON ERROR]", {
            requestId: activeTopicDiagnostics.requestId,
            stdoutValidJson: false,
            lineByteCount: Buffer.byteLength(line),
            errorMessage: safeTopicDiagnosticText(error?.message || error, activeTopicDiagnostics.reviews),
          });
        }
        stopTopicWorker(Object.assign(
          new Error("Unable to parse topic worker response"),
          { code: "TOPIC_WORKER_INVALID_RESPONSE" },
        ));
      }
    });
  });
  worker.stderr.on("data", (chunk) => {
    const workerRequestId = topicWorkerRequestIds.get(worker) ?? requestId;
    const diagnostics = topicRequestDiagnostics.get(workerRequestId) || activeTopicDiagnostics;
    if (diagnostics) {
      const stderrText = chunk.toString();
      diagnostics.stderr += stderrText;
      diagnostics.stderr = diagnostics.stderr.slice(-8000);
      stderrBuffer += stderrText;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || "";
      lines.filter(Boolean).forEach((line) => {
        console.warn("[TOPIC WORKER STDERR]", {
          requestId: diagnostics.requestId,
          clientRequestId: diagnostics.clientRequestId,
          requestContext: diagnostics.requestContext,
          elapsedMs: Date.now() - diagnostics.workerStartedAt,
          excerpt: sanitizeTopicWorkerStderr(line),
        });
      });
    }
  });
  worker.on("error", (error) => {
    const workerRequestId = topicWorkerRequestIds.get(worker) ?? requestId;
    const diagnostics = topicRequestDiagnostics.get(workerRequestId) || activeTopicDiagnostics;
    console.error("[TOPIC WORKER PROCESS ERROR]", {
      requestId: workerRequestId,
      workerPid: worker.pid ?? null,
      workerExitCode: worker.exitCode,
      errorMessage: safeTopicDiagnosticText(error?.message || error, diagnostics?.reviews || []),
    });
    stopTopicWorker(error);
  });
  worker.on("exit", (code, signal) => {
    const workerRequestId = topicWorkerRequestIds.get(worker) ?? requestId;
    const diagnostics = topicRequestDiagnostics.get(workerRequestId) || activeTopicDiagnostics;
    if (diagnostics) diagnostics.workerExitCode = code;
    console.log("[TOPIC WORKER EXIT]", {
      requestId: workerRequestId,
      clientRequestId: diagnostics?.clientRequestId ?? null,
      requestContext: diagnostics?.requestContext ?? "unspecified",
      workerPid: worker.pid ?? null,
      workerExitCode: code,
      signal,
    });
  });
  worker.on("close", (code) => {
    const workerRequestId = topicWorkerRequestIds.get(worker) ?? requestId;
    const diagnostics = topicRequestDiagnostics.get(workerRequestId) || activeTopicDiagnostics;
    console.log("[TOPIC WORKER CLOSE]", {
      requestId: workerRequestId,
      workerPid: worker.pid ?? null,
      workerExitCode: code,
      signalCode: worker.signalCode,
    });
    if (topicWorker === worker) {
      stopTopicWorker(new Error(`Topic worker exited with code ${code}`), code);
    }
  });
  return worker;
}

function validateTopicResponse(response, reviews) {
  const results = response?.results;
  if (!response?.success) {
    throw Object.assign(
      new Error("Topic classifier reported an inference failure"),
      { code: "TOPIC_INFERENCE_FAILED" },
    );
  }
  if (!Array.isArray(results) || results.length !== reviews.length || results.some((result, index) => (
    result?.reviewIndex !== index ||
    !Array.isArray(result?.topics) || result.topics.some((topic) => (
      !validTopicLabels.has(topic?.label) || typeof topic?.score !== "number"
    ))
  ))) {
    throw Object.assign(
      new Error("Topic classifier returned an invalid response"),
      { code: "TOPIC_WORKER_INVALID_RESPONSE" },
    );
  }
  return {
    model: typeof response.model === "string" ? response.model : null,
    threshold: typeof response.threshold === "number" ? response.threshold : null,
    results,
  };
}

function validateTopicKeywordScoreResponse(response, reviews) {
  const results = response?.results;
  if (!response?.success) {
    throw Object.assign(
      new Error("Topic classifier reported a keyword-scoring inference failure"),
      { code: "TOPIC_INFERENCE_FAILED" },
    );
  }
  if (
    !Array.isArray(results) ||
    results.length !== reviews.length ||
    results.some((result, index) => (
      result?.reviewIndex !== index ||
      !Array.isArray(result?.topicScores) ||
      result.topicScores.length !== validTopicLabels.size ||
      new Set(result.topicScores.map((topic) => topic?.label)).size !== validTopicLabels.size ||
      result.topicScores.some((topic) => (
        !validTopicLabels.has(topic?.label) ||
        typeof topic?.score !== "number" ||
        !Number.isFinite(topic.score)
      ))
    ))
  ) {
    throw Object.assign(
      new Error("Topic classifier returned invalid keyword scores"),
      { code: "TOPIC_WORKER_INVALID_RESPONSE" },
    );
  }
  return {
    model: typeof response.model === "string" ? response.model : null,
    results,
  };
}

function processNextTopicRequest() {
  if (isStoppingTopicWorker || isProcessingTopic || topicQueue.length === 0) return;
  const item = topicQueue.shift();
  if (item.cancelled) {
    processNextTopicRequest();
    return;
  }
  isProcessingTopic = true;
  const {
    requestId,
    reviews,
    platform,
    operation,
    resolve,
    reject,
    topicProcessTimeoutMs,
    diagnostics,
  } = item;
  const queueWaitMs = Date.now() - item.queuedAt;
  diagnostics.queueWaitMs ??= queueWaitMs;
  diagnostics.totalQueueWaitMs = (diagnostics.totalQueueWaitMs || 0) + queueWaitMs;
  diagnostics.computationStartedAt ??= Date.now();
  diagnostics.workerStartedAt = Date.now();
  diagnostics.stderr = "";
  diagnostics.stdoutBytesReceived = 0;
  diagnostics.workerResultLogged = false;
  diagnostics.reviews = reviews;
  activeTopicDiagnostics = diagnostics;
  console.log("[TOPIC WORKER START]", {
    requestId,
    clientRequestId: diagnostics.clientRequestId,
    requestContext: diagnostics.requestContext,
    pageIdentity: diagnostics.pageIdentity,
    reviewSetSignature: diagnostics.reviewSetSignature,
    operation,
    queueWaitMs: diagnostics.queueWaitMs,
    reviewCount: reviews.length,
    candidateChunkIndex: diagnostics.candidateChunkIndex ?? null,
    candidateChunkCount: diagnostics.candidateChunkCount ?? null,
    candidateChunkOffset: diagnostics.candidateChunkOffset ?? null,
  });

  let timeout = null;
  let completed = false;
  const onComplete = () => {
    if (completed) return;
    completed = true;
    if (timeout) clearTimeout(timeout);
    pendingTopicRequests.delete(requestId);
    isProcessingTopic = false;
    if (activeTopicDiagnostics === diagnostics) activeTopicDiagnostics = null;
    processNextTopicRequest();
  };

  timeout = setTimeout(() => {
    const worker = topicWorker;
    const error = Object.assign(
      new Error(`Topic process timed out after ${topicProcessTimeoutMs} ms`),
      { code: "TOPIC_WORKER_TIMEOUT" },
    );
    console.error("[TOPIC WORKER TIMEOUT]", {
      requestId,
      clientRequestId: diagnostics.clientRequestId,
      requestContext: diagnostics.requestContext,
      reviewCount: reviews.length,
      timeoutMs: topicProcessTimeoutMs,
      elapsedMs: Date.now() - diagnostics.workerStartedAt,
      workerPid: worker?.pid ?? null,
      workerProcessAlive: Boolean(worker && worker.exitCode === null && worker.signalCode === null),
      stdoutBytesReceived: diagnostics.stdoutBytesReceived,
    });
    if (pendingTopicRequests.has(requestId)) {
      stopTopicWorker(error);
    } else {
      reject(error);
      onComplete();
    }
  }, topicProcessTimeoutMs);

  pendingTopicRequests.set(requestId, {
    resolve: (response) => {
      try {
        resolve(operation === "keyword-scores"
          ? validateTopicKeywordScoreResponse(response, reviews)
          : validateTopicResponse(response, reviews));
      } catch (error) {
        reject(error);
      } finally {
        onComplete();
      }
    },
    reject: (error) => {
      reject(error);
      onComplete();
    },
  });

  try {
    const worker = ensureTopicWorker(requestId);
    topicWorkerRequestId = requestId;
    topicWorkerRequestIds.set(worker, requestId);
    const requestLine = `${JSON.stringify({ id: requestId, reviews, platform, operation })}\n`;
    console.log("[TOPIC WORKER INPUT]", {
      requestId,
      platform: diagnostics.platform,
      ...getTopicReviewBatchStats(reviews),
    });
    const writeAccepted = worker.stdin.write(requestLine, (error) => {
      if (error) {
        console.error("[TOPIC WORKER STDIN WRITE ERROR]", {
          requestId,
          errorMessage: safeTopicDiagnosticText(error.message, reviews),
        });
      }
    });
    console.log("[TOPIC WORKER STDIN WRITE]", {
      requestId,
      reviewCount: reviews.length,
      byteCount: Buffer.byteLength(requestLine),
      writeAccepted,
      elapsedMs: Date.now() - diagnostics.workerStartedAt,
    });
  } catch (error) {
    reject(error);
    onComplete();
  }
}

function enqueueTopicWorkerRequest(reviews, platform, operation, diagnostics, registerCancel) {
  return new Promise((resolve, reject) => {
    const { requestId } = diagnostics;
    const topicProcessTimeoutMs = getTopicProcessTimeoutMs(reviews.length);
    const queueItem = {
      requestId,
      reviews,
      platform,
      operation,
      diagnostics,
      queuedAt: Date.now(),
      resolve,
      reject,
      topicProcessTimeoutMs,
      cancelled: false,
    };
    if (typeof registerCancel === "function") {
      registerCancel(() => {
        if (queueItem.cancelled) return;
        queueItem.cancelled = true;
        const index = topicQueue.indexOf(queueItem);
        if (index !== -1) {
          topicQueue.splice(index, 1);
          reject(Object.assign(new Error("Topic request cancelled before worker start"), {
            code: "CLIENT_CANCELLED",
          }));
        }
      });
    }
    if (operation === "classify") {
      const firstKeywordIndex = topicQueue.findIndex((item) => item.operation === "keyword-scores");
      if (firstKeywordIndex !== -1) {
        topicQueue.splice(firstKeywordIndex, 0, queueItem);
      } else {
        topicQueue.push(queueItem);
      }
    } else {
      topicQueue.push(queueItem);
    }
    processNextTopicRequest();
  });
}

function runTopicPrediction(reviews, platform, operation, diagnostics, registerCancel) {
  if (operation !== "keyword-scores") {
    return enqueueTopicWorkerRequest(reviews, platform, operation, diagnostics, registerCancel);
  }

  let cancelled = false;
  let cancelCurrentBatch = null;
  if (typeof registerCancel === "function") {
    registerCancel(() => {
      cancelled = true;
      cancelCurrentBatch?.();
    });
  }
  let chunkIndex = 0;
  const chunkCount = Math.ceil(reviews.length / TOPIC_KEYWORD_QUEUE_BATCH_SIZE);
  return runTopicKeywordScoreBatches(reviews, {
    batchSize: TOPIC_KEYWORD_QUEUE_BATCH_SIZE,
    isCancelled: () => cancelled,
    runBatch: (batch, offset) => {
      chunkIndex += 1;
      diagnostics.candidateChunkIndex = chunkIndex;
      diagnostics.candidateChunkCount = chunkCount;
      diagnostics.candidateChunkOffset = offset;
      diagnostics.candidateChunkSize = batch.length;
      return enqueueTopicWorkerRequest(
        batch,
        platform,
        operation,
        diagnostics,
        (cancel) => { cancelCurrentBatch = cancel; },
      ).finally(() => {
        cancelCurrentBatch = null;
      });
    },
  });
}

export async function predictTopics(req, res) {
  const requestId = ++topicRequestId;
  const requestStartedAt = Date.now();
  const reviews = req.body?.reviews;
  const reviewCount = Array.isArray(reviews) ? reviews.length : 0;
  const requestedOperation = req.body?.operation ?? "classify";
  const operation = validTopicOperations.has(requestedOperation)
    ? requestedOperation
    : "invalid";
  const requestMetadata = getSafeTopicRequestMetadata(req);
  const diagnostics = {
    requestId,
    ...requestMetadata,
    reviewSetSignature: getTopicReviewSetSignature(reviews),
    reviewCount,
    platform: typeof (req.get?.("x-voxreview-platform") || req.body?.platform) === "string"
      ? (req.get?.("x-voxreview-platform") || req.body?.platform).slice(0, 40)
      : "not provided",
    requestStartedAt,
    workerStartedAt: null,
    workerExitCode: null,
    stdoutValidJson: false,
    resultCount: null,
    assignmentCount: null,
    stderr: "",
    workerResultLogged: false,
    stdoutBytesReceived: 0,
    reviews,
  };
  const cacheKey = operation === "classify"
    ? getTopicResultCacheKey({
        pageIdentity: diagnostics.pageIdentity,
        platform: diagnostics.platform,
        operation,
        reviews,
      })
    : null;
  topicRequestDiagnostics.set(requestId, diagnostics);
  console.log("[TOPIC BACKEND START]", {
    requestId,
    clientRequestId: diagnostics.clientRequestId,
    requestContext: diagnostics.requestContext,
    pageIdentity: diagnostics.pageIdentity,
    reviewSetSignature: diagnostics.reviewSetSignature,
    operation,
    reviewCount,
    timestamp: new Date(requestStartedAt).toISOString(),
  });

  let clientDisconnected = false;
  const respond = (status, body, failureReason = null) => {
    console.log("[TOPIC BACKEND RESPONSE]", {
      requestId,
      clientRequestId: diagnostics.clientRequestId,
      requestContext: diagnostics.requestContext,
      pageIdentity: diagnostics.pageIdentity,
      reviewSetSignature: diagnostics.reviewSetSignature,
      operation,
      queueWaitMs: diagnostics.queueWaitMs ?? null,
      totalQueueWaitMs: diagnostics.totalQueueWaitMs ?? null,
      computationDurationMs: diagnostics.computationStartedAt
        ? (diagnostics.computationCompletedAt || Date.now()) - diagnostics.computationStartedAt
        : null,
      cacheHit: Boolean(diagnostics.cacheHit),
      finalHttpStatus: status,
      status,
      elapsedMs: Date.now() - requestStartedAt,
      computationOutcome: diagnostics.computationOutcome || "not_started",
      clientDisconnected,
      failureReason: failureReason
        ? safeTopicDiagnosticText(failureReason, Array.isArray(reviews) ? reviews : [])
        : null,
      terminalOutcome: clientDisconnected
        ? "client_disconnected"
        : status >= 200 && status < 300 ? "success" : "failure",
    });
    topicRequestDiagnostics.delete(requestId);
    return res.status(status).json(body);
  };

  if (!Array.isArray(reviews) || reviews.length === 0 || reviews.length > 500) {
    const failureReason = "reviews must contain between 1 and 500 items";
    return respond(400, { success: false, error: failureReason }, failureReason);
  }
  if (operation === "invalid") {
    const failureReason = "operation must be classify or keyword-scores";
    return respond(400, { success: false, error: failureReason }, failureReason);
  }
  if (reviews.some((review) => typeof review !== "string" || !review.trim())) {
    const failureReason = "each review must be a non-empty string";
    return respond(400, { success: false, error: failureReason }, failureReason);
  }
  if (cacheKey && !requestMetadata.forceRefresh) {
    const cachedResult = topicResultCache.get(cacheKey);
    if (cachedResult) {
      diagnostics.cacheHit = true;
      console.info("[TOPIC BACKEND CACHE HIT]", {
        requestId,
        clientRequestId: diagnostics.clientRequestId,
        requestContext: diagnostics.requestContext,
        pageIdentity: diagnostics.pageIdentity,
        reviewSetSignature: diagnostics.reviewSetSignature,
        operation,
        reviewCount,
        outcome: "restored",
        preservedSuccessfulResult: true,
      });
      return respond(200, { success: true, ...cachedResult });
    }

    if (inFlightTopicComputations.has(cacheKey)) {
      diagnostics.deduplicated = true;
      console.info("[TOPIC BACKEND IN-FLIGHT JOIN]", {
        requestId,
        clientRequestId: diagnostics.clientRequestId,
        requestContext: diagnostics.requestContext,
        pageIdentity: diagnostics.pageIdentity,
        reviewSetSignature: diagnostics.reviewSetSignature,
        operation,
        reviewCount,
        outcome: "deduplicated",
      });
      try {
        const inFlightResult = await inFlightTopicComputations.get(cacheKey);
        diagnostics.computationCompletedAt = Date.now();
        diagnostics.computationOutcome = "success";
        return respond(200, { success: true, ...inFlightResult });
      } catch (error) {
        diagnostics.computationCompletedAt = Date.now();
        diagnostics.computationOutcome = error?.code === "CLIENT_CANCELLED" ? "cancelled" : "failure";
        const failure = getTopicWorkerFailureDetails(error);
        console.error("[TOPIC WORKER ERROR]", {
          requestId,
          clientRequestId: diagnostics.clientRequestId,
          operation,
          status: failure.status,
          failureReason: failure.failureReason,
          errorCode: failure.code,
        });
        return respond(failure.status, {
          success: false,
          error: failure.code === "TOPIC_WORKER_TIMEOUT"
            ? "Review topic model timed out. Please retry."
            : failure.code === "TOPIC_WORKER_INVALID_RESPONSE"
              ? "Review topic model returned an invalid response."
              : "Review topic model unavailable",
          code: failure.code,
        }, failure.failureReason);
      }
    }
  }
  let cancelCallback = null;
  const cancelQueuedRequest = () => {
    if (clientDisconnected) return;
    clientDisconnected = true;
    diagnostics.clientDisconnected = true;
    console.warn("[TOPIC BACKEND CLIENT DISCONNECTED]", {
      requestId,
      clientRequestId: diagnostics.clientRequestId,
      requestContext: diagnostics.requestContext,
      pageIdentity: diagnostics.pageIdentity,
      reviewSetSignature: diagnostics.reviewSetSignature,
      operation,
      status: null,
      failureReason: "client_disconnected",
      queueWaitMs: diagnostics.queueWaitMs ?? null,
      workerStarted: diagnostics.workerStartedAt != null,
      outcome: "client_disconnected",
      elapsedMs: Date.now() - requestStartedAt,
    });
    if (cancelCallback) cancelCallback();
  };
  req.on("aborted", cancelQueuedRequest);
  res.on("close", () => {
    if (!res.writableEnded) cancelQueuedRequest();
  });
  try {
    const platform = diagnostics.platform === "not provided"
      ? null
      : diagnostics.platform;
    const computePrediction = () => runTopicPrediction(
      reviews,
      platform,
      operation,
      diagnostics,
      (fn) => {
        cancelCallback = fn;
        if (clientDisconnected) cancelCallback();
      },
    );
    const predictionPromise = cacheKey
      ? computeAndCacheTopicResult(topicResultCache, cacheKey, computePrediction)
      : computePrediction();
    if (cacheKey) inFlightTopicComputations.set(cacheKey, predictionPromise);

    let predictionResponse;
    try {
      predictionResponse = await predictionPromise;
    } finally {
      if (cacheKey && inFlightTopicComputations.get(cacheKey) === predictionPromise) {
        inFlightTopicComputations.delete(cacheKey);
      }
    }
    diagnostics.computationCompletedAt = Date.now();
    diagnostics.computationOutcome = "success";
    if (cacheKey && predictionResponse?.results?.length === reviewCount) {
      console.info("[TOPIC BACKEND RESULT CACHED]", {
        requestId,
        clientRequestId: diagnostics.clientRequestId,
        requestContext: diagnostics.requestContext,
        pageIdentity: diagnostics.pageIdentity,
        reviewSetSignature: diagnostics.reviewSetSignature,
        operation,
        reviewCount,
        ...getTopicResultCounts(predictionResponse),
        outcome: "cached",
        preservedSuccessfulResult: true,
      });
    }
    return respond(200, { success: true, ...predictionResponse });
  } catch (error) {
    diagnostics.computationCompletedAt = Date.now();
    diagnostics.computationOutcome = error?.code === "CLIENT_CANCELLED" ? "cancelled" : "failure";
    if (clientDisconnected || res.destroyed || res.writableEnded) {
      topicRequestDiagnostics.delete(requestId);
      return;
    }
    const stderrExcerpt = sanitizeTopicWorkerStderr(diagnostics.stderr);
    const failure = getTopicWorkerFailureDetails(error);
    console.error("[TOPIC WORKER ERROR]", {
      requestId,
      clientRequestId: diagnostics.clientRequestId,
      requestContext: diagnostics.requestContext,
      operation,
      status: failure.status,
      failureReason: failure.failureReason,
      errorCode: failure.code,
      stderrExcerpt,
      workerExitCode: diagnostics.workerExitCode,
      errorType: failure.code === "TOPIC_WORKER_TIMEOUT"
        ? "TimeoutError"
        : error?.name === "TypeError" ? "TypeError" : "Error",
    });
    return respond(
      failure.status,
      {
        success: false,
        error: failure.code === "TOPIC_WORKER_TIMEOUT"
          ? "Review topic model timed out. Please retry."
          : failure.code === "TOPIC_WORKER_INVALID_RESPONSE"
            ? "Review topic model returned an invalid response."
            : "Review topic model unavailable",
        code: failure.code,
      },
      failure.failureReason,
    );
  }
}