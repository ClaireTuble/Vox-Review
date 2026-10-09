import { createHash } from "node:crypto";

const SAFE_TOPIC_WORKER_FIELDS = new Set([
  "event",
  "requestId",
  "workerPid",
  "operation",
  "model",
  "cached",
  "loadDurationMs",
  "descriptionCount",
  "embeddingDurationMs",
  "embeddingCount",
  "reviewCount",
  "torchNumThreads",
  "previousTorchNumThreads",
  "processCpuCount",
  "cgroupCpuQuotaCount",
  "candidateCount",
  "batchSize",
  "inferenceDurationMs",
  "refinementDurationMs",
  "resultCount",
  "serializationDurationMs",
  "responseBytes",
  "requestDurationMs",
  "outputDurationMs",
  "errorType",
  "errorCategory",
  "stage",
  "platform",
  "cpuAffinityCount",
  "cpuQuotaMicros",
  "cpuQuotaPeriodMicros",
  "torchThreadLimit",
]);
const SAFE_TOPIC_WORKER_EVENTS = new Set([
  "topic_request_received",
  "topic_request_failed",
  "model_load_start",
  "model_load_failed",
  "model_load_complete",
  "model_cache_reused",
  "torch_thread_limit_applied",
  "topic_embeddings_start",
  "topic_embeddings_complete",
  "topic_embeddings_cache_reused",
  "review_inference_start",
  "review_inference_complete",
  "topic_refinement_complete",
  "keyword_score_inference_start",
  "keyword_score_inference_complete",
  "torch_thread_configuration",
  "result_serialization_complete",
  "result_output_complete",
]);
const SAFE_REQUEST_CONTEXTS = new Set([
  "active-analysis-retry",
  "background-analysis",
  "manual-rescan",
  "popup-analyze",
  "popup-analysis",
  "popup-request",
  "popup-restore",
  "popup-retry",
  "saved-analysis-refresh",
  "saved-analysis-restore",
  "saved-page-topic-restore",
  "topic-keyword-scoring",
  "unspecified",
  "worker-recovery",
]);
const SAFE_TOPIC_STAGES = new Set([
  "model_load",
  "request_validation",
  "result_output",
  "result_serialization",
  "review_inference",
  "topic_embeddings",
  "topic_refinement",
  "unknown",
]);
const SAFE_TOPIC_ERROR_CATEGORIES = new Set([
  "client_cancelled",
  "inference",
  "model_initialization",
  "refinement",
  "request_validation",
  "serialization",
  "unknown",
  "worker_process",
]);
const SAFE_EXCEPTION_TYPES = new Set([
  "AttributeError",
  "ImportError",
  "IndexError",
  "JSONDecodeError",
  "KeyError",
  "MemoryError",
  "ModuleNotFoundError",
  "OSError",
  "RuntimeError",
  "TimeoutError",
  "TypeError",
  "ValueError",
]);

export function getTopicWorkerFailureDetails(error) {
  if (error?.code === "CLIENT_CANCELLED") {
    return {
      status: 503,
      code: "TOPIC_REQUEST_CANCELLED",
      failureReason: "shared_computation_cancelled",
    };
  }
  if (error?.code === "TOPIC_WORKER_TIMEOUT") {
    return {
      status: 504,
      code: "TOPIC_WORKER_TIMEOUT",
      failureReason: "worker_timeout",
    };
  }
  if (error?.code === "TOPIC_WORKER_INVALID_RESPONSE") {
    return {
      status: 502,
      code: "TOPIC_WORKER_INVALID_RESPONSE",
      failureReason: "invalid_worker_response",
    };
  }
  if (error?.code === "TOPIC_INFERENCE_FAILED") {
    return {
      status: 503,
      code: "TOPIC_INFERENCE_FAILED",
      failureReason: "inference_failure",
    };
  }
  return {
    status: 503,
    code: "TOPIC_WORKER_UNAVAILABLE",
    failureReason: "worker_unavailable",
  };
}

function isSafeTopicWorkerValue(key, value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (typeof value !== "string") return false;

  if (key === "event") return SAFE_TOPIC_WORKER_EVENTS.has(value);
  if (key === "stage") return SAFE_TOPIC_STAGES.has(value);
  if (key === "errorCategory") return SAFE_TOPIC_ERROR_CATEGORIES.has(value);
  if (key === "model") return value === "intfloat/multilingual-e5-small";
  if (key === "platform") return /^(google|googleplay|shopee|steam|lazada|agoda)$/.test(value);
  if (key === "errorType") return SAFE_EXCEPTION_TYPES.has(value);
  if (key === "requestId") return /^\d{1,20}$/.test(value);
  if (key === "operation") return value === "classify" || value === "keyword-scores";
  return false;
}

export function sanitizeTopicWorkerStderr(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("unstructured worker diagnostic");
        }
        const safe = Object.fromEntries(
          Object.entries(parsed).filter(([key, fieldValue]) => (
            SAFE_TOPIC_WORKER_FIELDS.has(key) &&
            isSafeTopicWorkerValue(key, fieldValue)
          )),
        );
        if (!safe.event) throw new Error("missing worker event");
        return JSON.stringify(safe);
      } catch {
        return JSON.stringify({
          event: "unstructured_stderr_redacted",
          byteCount: Buffer.byteLength(line),
        });
      }
    })
    .join("\n");
}

export function getSafeTopicRequestMetadata(req) {
  const requestContext = req.get?.("x-voxreview-request-context") || "";
  const clientRequestId = req.get?.("x-voxreview-client-request-id") || "";
  const pageKey = req.get?.("x-voxreview-page-key") || "";
  const forceRefresh = req.get?.("x-voxreview-force-refresh") === "true";
  return {
    requestContext: SAFE_REQUEST_CONTEXTS.has(requestContext)
      ? requestContext
      : "unspecified",
    clientRequestId: /^[A-Za-z0-9_-]{1,100}$/.test(clientRequestId)
      ? clientRequestId
      : null,
    pageIdentity: typeof pageKey === "string" &&
      /^[a-z0-9_-]+:[^\r\n\t]{1,450}$/i.test(pageKey)
      ? createHash("sha256").update(pageKey.trim()).digest("hex").slice(0, 24)
      : null,
    forceRefresh,
  };
}
