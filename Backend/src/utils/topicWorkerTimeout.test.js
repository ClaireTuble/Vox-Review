import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TOPIC_PROCESS_TIMEOUT_BASE_MS,
  DEFAULT_TOPIC_PROCESS_TIMEOUT_PER_REVIEW_MS,
  getTopicProcessTimeoutMs,
} from "./topicWorkerTimeout.js";

test("three-review cold-start timeout fits the extension request budget", () => {
  const timeoutMs = getTopicProcessTimeoutMs(3, {
    baseMs: DEFAULT_TOPIC_PROCESS_TIMEOUT_BASE_MS,
    perReviewMs: DEFAULT_TOPIC_PROCESS_TIMEOUT_PER_REVIEW_MS,
  });

  assert.equal(timeoutMs, 186_000);
  assert.ok(timeoutMs < 216_000);
});

test("supports deployment-specific timeout overrides", () => {
  assert.equal(getTopicProcessTimeoutMs(3, { baseMs: 120_000, perReviewMs: 10_000 }), 150_000);
});
