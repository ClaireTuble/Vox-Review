import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const controllerDirectory = path.dirname(fileURLToPath(import.meta.url));
const nlpDirectory = path.resolve(controllerDirectory, "../../../Frontend/nlp");
const predictionScript = path.join(nlpDirectory, "predict_svm_batch.py");
const topicPredictionScript = path.join(nlpDirectory, "predict_topics_batch.py");
const topicWorkerScript = path.join(nlpDirectory, "topic_worker.py");
const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
const topicProcessTimeoutBaseMs = Number(process.env.TOPIC_PROCESS_TIMEOUT_BASE_MS || 60000);
const topicProcessTimeoutPerReviewMs = Number(process.env.TOPIC_PROCESS_TIMEOUT_PER_REVIEW_MS || 12000);
const validCategories = new Set([1, 2, 3, 4, 5, 6]);
const validTopicLabels = new Set([
  "Quality", "Performance / Functionality", "Features / Content", "Service / Support",
  "Delivery / Transaction", "Price / Value", "Usability / Experience",
  "Accuracy / Expectations", "Availability / Accessibility", "Environment / Location", "Other / General",
]);
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
  console.log("[TOPIC WORKER RESULT]", {
    requestId: diagnostics.requestId,
    elapsedMs: diagnostics.workerStartedAt
      ? Date.now() - diagnostics.workerStartedAt
      : null,
    workerExitCode: diagnostics.workerExitCode,
    stdoutValidJson: diagnostics.stdoutValidJson,
    resultCount: diagnostics.resultCount,
    assignmentCount: diagnostics.assignmentCount,
  });
}

function runPrediction(reviews) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [predictionScript], {
      cwd: nlpDirectory,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `SVM process exited with code ${code}`));
        return;
      }

      try {
        const response = JSON.parse(stdout.trim());
        const predictions = response?.predictions;
        const results = response?.results;
        const categoryDrivers = response?.categoryDrivers;
        if (
          !Array.isArray(predictions) ||
          predictions.length !== reviews.length ||
          predictions.some((category) => !validCategories.has(category)) ||
          (results !== undefined && (
            !Array.isArray(results) ||
            results.length !== reviews.length ||
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
          reject(new Error("SVM returned an invalid prediction explanation payload"));
          return;
        }
        resolve({
          predictions,
          results: Array.isArray(results)
            ? results
            : predictions.map((category) => ({ category, emotionDrivers: [] })),
          categoryDrivers: categoryDrivers && typeof categoryDrivers === "object"
            ? categoryDrivers
            : {},
        });
      } catch (error) {
        reject(new Error(`Unable to parse SVM response: ${error.message}`));
      }
    });

    child.stdin.end(JSON.stringify({ reviews }));
  });
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

  try {
    const predictionResponse = await runPrediction(reviews);
    return res.json({ success: true, ...predictionResponse });
  } catch (error) {
    console.error("VoxReview SVM prediction error:", error);
    return res.status(503).json({
      success: false,
      error: "SVM prediction service unavailable",
    });
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
    env: { ...process.env },
  });
  topicWorker = worker;
  topicWorkerRequestIds.set(worker, requestId);
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
        stopTopicWorker(new Error(`Unable to parse topic worker response: ${error.message}`));
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
      console.warn("[TOPIC WORKER STDERR]", {
        requestId: diagnostics.requestId,
        elapsedMs: Date.now() - diagnostics.workerStartedAt,
        excerpt: safeTopicDiagnosticText(stderrText, diagnostics.reviews),
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
  if (!response?.success || !Array.isArray(results) || results.length !== reviews.length || results.some((result, index) => (
    result?.reviewIndex !== index ||
    !Array.isArray(result?.topics) || result.topics.some((topic) => (
      !validTopicLabels.has(topic?.label) || typeof topic?.score !== "number"
    ))
  ))) {
    throw new Error(response?.error || "Topic classifier returned an invalid payload");
  }
  return {
    model: typeof response.model === "string" ? response.model : null,
    threshold: typeof response.threshold === "number" ? response.threshold : null,
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
  const { requestId, reviews, resolve, reject, topicProcessTimeoutMs, diagnostics } = item;
  diagnostics.queueWaitMs = Date.now() - item.queuedAt;
  diagnostics.workerStartedAt = Date.now();
  diagnostics.stderr = "";
  diagnostics.stdoutBytesReceived = 0;
  diagnostics.reviews = reviews;
  activeTopicDiagnostics = diagnostics;
  console.log("[TOPIC WORKER START]", {
    requestId,
    queueWaitMs: diagnostics.queueWaitMs,
    reviewCount: reviews.length,
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
    const error = new Error(`Topic process timed out after ${topicProcessTimeoutMs} ms`);
    console.error("[TOPIC WORKER TIMEOUT]", {
      requestId,
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
        resolve(validateTopicResponse(response, reviews));
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
    const requestLine = `${JSON.stringify({ id: requestId, reviews })}\n`;
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

function runTopicPrediction(reviews, diagnostics, registerCancel) {
  return new Promise((resolve, reject) => {
    const { requestId } = diagnostics;
    const topicProcessTimeoutMs = topicProcessTimeoutBaseMs + reviews.length * topicProcessTimeoutPerReviewMs;
    const queueItem = {
      requestId,
      reviews,
      diagnostics,
      queuedAt: Date.now(),
      resolve,
      reject,
      topicProcessTimeoutMs,
      cancelled: false,
    };
    if (typeof registerCancel === "function") {
      registerCancel(() => {
        queueItem.cancelled = true;
        const index = topicQueue.indexOf(queueItem);
        if (index !== -1) {
          topicQueue.splice(index, 1);
        }
      });
    }
    topicQueue.push(queueItem);
    processNextTopicRequest();
  });
}

export async function predictTopics(req, res) {
  const requestId = ++topicRequestId;
  const requestStartedAt = Date.now();
  const reviews = req.body?.reviews;
  const reviewCount = Array.isArray(reviews) ? reviews.length : 0;
  const diagnostics = {
    requestId,
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
  topicRequestDiagnostics.set(requestId, diagnostics);
  console.log("[TOPIC BACKEND START]", {
    requestId,
    reviewCount,
    timestamp: new Date(requestStartedAt).toISOString(),
  });

  const respond = (status, body, failureReason = null) => {
    console.log("[TOPIC BACKEND RESPONSE]", {
      requestId,
      finalHttpStatus: status,
      elapsedMs: Date.now() - requestStartedAt,
      failureReason: failureReason
        ? safeTopicDiagnosticText(failureReason, Array.isArray(reviews) ? reviews : [])
        : null,
    });
    topicRequestDiagnostics.delete(requestId);
    return res.status(status).json(body);
  };

  if (!Array.isArray(reviews) || reviews.length === 0 || reviews.length > 500) {
    const failureReason = "reviews must contain between 1 and 500 items";
    return respond(400, { success: false, error: failureReason }, failureReason);
  }
  if (reviews.some((review) => typeof review !== "string" || !review.trim())) {
    const failureReason = "each review must be a non-empty string";
    return respond(400, { success: false, error: failureReason }, failureReason);
  }
  let cancelCallback = null;
  let clientDisconnected = false;
  const cancelQueuedRequest = () => {
    clientDisconnected = true;
    if (cancelCallback) cancelCallback();
  };
  req.on("aborted", cancelQueuedRequest);
  res.on("close", () => {
    if (!res.writableEnded) cancelQueuedRequest();
  });
  try {
    const predictionResponse = await runTopicPrediction(reviews, diagnostics, (fn) => {
      cancelCallback = fn;
      if (clientDisconnected) cancelCallback();
    });
    return respond(200, { success: true, ...predictionResponse });
  } catch (error) {
    const errorMessage = error?.message || String(error);
    const stderrExcerpt = safeTopicDiagnosticText(diagnostics.stderr, reviews);
    const safeErrorMessage = safeTopicDiagnosticText(errorMessage, reviews);
    console.error("[TOPIC WORKER ERROR]", {
      requestId,
      stderrExcerpt,
      workerExitCode: diagnostics.workerExitCode,
      errorMessage: safeErrorMessage,
    });
    console.error("VoxReview topic prediction error:", safeErrorMessage);
    return respond(
      503,
      { success: false, error: "Review topic model unavailable" },
      safeErrorMessage,
    );
  }
}