import assert from "node:assert/strict";
import test from "node:test";

import {
  getSafeTopicRequestMetadata,
  sanitizeTopicWorkerStderr,
} from "./topicWorkerDiagnostics.js";

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

test("request metadata accepts only bounded safe diagnostic identifiers", () => {
  assert.deepEqual(getSafeTopicRequestMetadata({
    get(name) {
      return {
        "x-voxreview-request-context": "topic-keyword-scoring",
        "x-voxreview-client-request-id": "topic-client-17",
      }[name];
    },
  }), {
    requestContext: "topic-keyword-scoring",
    clientRequestId: "topic-client-17",
  });
  assert.deepEqual(getSafeTopicRequestMetadata({
    get: () => "private review text",
  }), {
    requestContext: "unspecified",
    clientRequestId: null,
  });
});
