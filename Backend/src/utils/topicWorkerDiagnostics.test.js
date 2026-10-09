import assert from "node:assert/strict";
import test from "node:test";

import {
  getTopicWorkerFailureDetails,
  getSafeTopicRequestMetadata,
  sanitizeTopicWorkerStderr,
} from "./topicWorkerDiagnostics.js";

test("topic worker failures retain distinct timeout, response, inference, and process outcomes", () => {
  assert.deepEqual(
    getTopicWorkerFailureDetails({ code: "CLIENT_CANCELLED" }),
    { status: 503, code: "TOPIC_REQUEST_CANCELLED", failureReason: "shared_computation_cancelled" },
  );
  assert.deepEqual(
    getTopicWorkerFailureDetails({ code: "TOPIC_WORKER_TIMEOUT" }),
    { status: 504, code: "TOPIC_WORKER_TIMEOUT", failureReason: "worker_timeout" },
  );
  assert.deepEqual(
    getTopicWorkerFailureDetails({ code: "TOPIC_WORKER_INVALID_RESPONSE" }),
    { status: 502, code: "TOPIC_WORKER_INVALID_RESPONSE", failureReason: "invalid_worker_response" },
  );
  assert.deepEqual(
    getTopicWorkerFailureDetails({ code: "TOPIC_INFERENCE_FAILED" }),
    { status: 503, code: "TOPIC_INFERENCE_FAILED", failureReason: "inference_failure" },
  );
  assert.deepEqual(
    getTopicWorkerFailureDetails(new Error("worker spawn failed")),
    { status: 503, code: "TOPIC_WORKER_UNAVAILABLE", failureReason: "worker_unavailable" },
  );
});

test("structured worker stderr preserves safe event metadata and redacts unsafe values", () => {
  const stderr = JSON.stringify({
    event: "review_inference_complete",
    requestId: "17",
    inferenceDurationMs: 834.2,
    reviewCount: 3,
    error: "private review phrase",
    detail: "Bearer secret-token",
  });

  const sanitized = sanitizeTopicWorkerStderr(stderr);
  assert.deepEqual(JSON.parse(sanitized), {
    event: "review_inference_complete",
    requestId: "17",
    inferenceDurationMs: 834.2,
    reviewCount: 3,
  });
  assert.doesNotMatch(sanitized, /private review phrase|secret-token/);
});

test("unsafe event names and unstructured stderr are replaced with safe metadata", () => {
  const sanitized = sanitizeTopicWorkerStderr([
    JSON.stringify({ event: "review text copied here", requestId: "18" }),
    "Traceback includes private review text",
  ].join("\n"));
  const records = sanitized.split("\n").map((line) => JSON.parse(line));

  assert.deepEqual(records, [
    { event: "unstructured_stderr_redacted", byteCount: Buffer.byteLength(JSON.stringify({ event: "review text copied here", requestId: "18" })) },
    { event: "unstructured_stderr_redacted", byteCount: Buffer.byteLength("Traceback includes private review text") },
  ]);
  assert.doesNotMatch(sanitized, /private review text|review text copied/);
});

test("keyword scoring diagnostics retain safe performance fields but drop candidate content", () => {
  const sanitized = sanitizeTopicWorkerStderr(JSON.stringify({
    event: "keyword_score_inference_complete",
    requestId: "19",
    operation: "keyword-scores",
    candidateCount: 119,
    batchSize: 64,
    inferenceDurationMs: 378.3,
    candidates: ["private candidate phrase"],
  }));

  assert.deepEqual(JSON.parse(sanitized), {
    event: "keyword_score_inference_complete",
    requestId: "19",
    operation: "keyword-scores",
    candidateCount: 119,
    batchSize: 64,
    inferenceDurationMs: 378.3,
  });
  assert.doesNotMatch(sanitized, /private candidate phrase/);
});

test("thread configuration diagnostics preserve only sanitized runtime allocation metadata", () => {
  const sanitized = sanitizeTopicWorkerStderr(JSON.stringify({
    event: "torch_thread_configuration",
    torchNumThreads: 8,
    previousTorchNumThreads: 48,
    processCpuCount: 48,
    cpuAffinityCount: 12,
    cgroupCpuQuotaCount: 4,
    cpuQuotaMicros: 400000,
    cpuQuotaPeriodMicros: 100000,
    torchThreadLimit: 4,
    reviewText: "private review",
  }));

  assert.deepEqual(JSON.parse(sanitized), {
    event: "torch_thread_configuration",
    torchNumThreads: 8,
    previousTorchNumThreads: 48,
    processCpuCount: 48,
    cpuAffinityCount: 12,
    cgroupCpuQuotaCount: 4,
    cpuQuotaMicros: 400000,
    cpuQuotaPeriodMicros: 100000,
    torchThreadLimit: 4,
  });
  assert.doesNotMatch(sanitized, /private review/);
});

test("request metadata accepts only bounded safe diagnostic identifiers", () => {
  assert.deepEqual(getSafeTopicRequestMetadata({
    get(name) {
      return {
        "x-voxreview-request-context": "topic-keyword-scoring",
        "x-voxreview-client-request-id": "topic-client-17",
        "x-voxreview-page-key": "shopee:i.123.456",
        "x-voxreview-force-refresh": "true",
      }[name];
    },
  }), {
    requestContext: "topic-keyword-scoring",
    clientRequestId: "topic-client-17",
    pageIdentity: getSafeTopicRequestMetadata({
      get: (name) => name === "x-voxreview-page-key" ? "shopee:i.123.456" : undefined,
    }).pageIdentity,
    forceRefresh: true,
  });
  assert.deepEqual(getSafeTopicRequestMetadata({
    get: () => "private review text",
  }), {
    requestContext: "unspecified",
    clientRequestId: null,
    pageIdentity: null,
    forceRefresh: false,
  });
  const metadata = getSafeTopicRequestMetadata({
    get(name) {
      return {
        "x-voxreview-page-key": "shopee:i.123.456",
      }[name];
    },
  });
  assert.equal(metadata.pageIdentity.length, 24);
  assert.notEqual(metadata.pageIdentity, "shopee:i.123.456");
});
