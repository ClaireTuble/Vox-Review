import assert from "node:assert/strict";
import test from "node:test";
import {
  createTopicAnalysisResultCache,
  computeAndCacheTopicResult,
  getTopicPageIdentity,
  getTopicResultCacheKey,
  getTopicReviewSetSignature,
  runTopicKeywordScoreBatches,
} from "./topicAnalysisResultCache.js";

test("topic result cache keys identify page, operation, platform and ordered review set", () => {
  const identity = {
    pageIdentity: getTopicPageIdentity("shopee:i.123.456"),
    platform: "shopee",
    operation: "classify",
    reviews: ["first", "second"],
  };

  assert.equal(getTopicPageIdentity("shopee:i.123.456"), identity.pageIdentity);
  assert.notEqual(getTopicPageIdentity("shopee:i.654.321"), identity.pageIdentity);
  assert.notEqual(
    getTopicResultCacheKey(identity),
    getTopicResultCacheKey({ ...identity, reviews: ["second", "first"] }),
  );
  assert.notEqual(
    getTopicResultCacheKey(identity),
    getTopicResultCacheKey({ ...identity, operation: "keyword-scores" }),
  );
  assert.equal(getTopicReviewSetSignature(identity.reviews).length, 24);
});

test("topic result cache expires old results and evicts least-recently-used entries", () => {
  let now = 0;
  const cache = createTopicAnalysisResultCache({ maxEntries: 2, ttlMs: 50, now: () => now });
  cache.set("a", { result: "a" });
  cache.set("b", { result: "b" });
  assert.deepEqual(cache.get("a"), { result: "a" });
  cache.set("c", { result: "c" });

  assert.equal(cache.get("b"), null);
  assert.deepEqual(cache.get("a"), { result: "a" });
  now = 51;
  assert.equal(cache.get("a"), null);
});

test("a successful computation is cached even after its HTTP client disconnects", async () => {
  const cache = createTopicAnalysisResultCache();
  const result = { model: "e5", results: [{ topics: [{ label: "Quality", score: 0.8 }] }] };
  let clientDisconnected = false;
  let finishComputation;
  const computation = computeAndCacheTopicResult(
    cache,
    "same-page-review-set",
    () => new Promise((resolve) => { finishComputation = resolve; }),
  );

  clientDisconnected = true;
  finishComputation(result);
  assert.deepEqual(await computation, result);
  assert.deepEqual(cache.get("same-page-review-set"), result);
  assert.equal(clientDisconnected, true);
});

test("keyword score batches yield between chunks and preserve global result indexes", async () => {
  const queued = [];
  const input = Array.from({ length: 70 }, (_, index) => `candidate-${index}`);
  const run = runTopicKeywordScoreBatches(input, {
    batchSize: 32,
    runBatch(batch, offset) {
      return new Promise((resolve) => queued.push({ batch, offset, resolve }));
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(queued.map(({ offset, batch }) => [offset, batch.length]), [[0, 32]]);
  queued[0].resolve({
    model: "e5",
    results: queued[0].batch.map((_, index) => ({ reviewIndex: index, topicScores: [] })),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(queued.map(({ offset, batch }) => [offset, batch.length]), [[0, 32], [32, 32]]);
  queued[1].resolve({
    model: "e5",
    results: queued[1].batch.map((_, index) => ({ reviewIndex: index, topicScores: [] })),
  });
  await new Promise((resolve) => setImmediate(resolve));
  queued[2].resolve({
    model: "e5",
    results: queued[2].batch.map((_, index) => ({ reviewIndex: index, topicScores: [] })),
  });

  const result = await run;
  assert.deepEqual(result.results.map(({ reviewIndex }) => reviewIndex), input.map((_, index) => index));
  assert.equal(result.results.length, input.length);
});

test("keyword score batching stops before another chunk after cancellation", async () => {
  let cancelled = false;
  let batchesRun = 0;
  await assert.rejects(runTopicKeywordScoreBatches(
    Array.from({ length: 65 }, (_, index) => `${index}`),
    {
      batchSize: 32,
      isCancelled: () => cancelled,
      async runBatch(batch) {
        batchesRun += 1;
        cancelled = true;
        return { results: batch.map((_, index) => ({ reviewIndex: index })) };
      },
    },
  ), { code: "CLIENT_CANCELLED" });
  assert.equal(batchesRun, 1);
});

test("review set signature normalizes review objects and plain strings identically", () => {
  const strings = ["Great product", "Fast shipping"];
  const objects = [{ text: "Great product" }, { reviewText: "Fast shipping" }];
  assert.equal(getTopicReviewSetSignature(strings), getTopicReviewSetSignature(objects));
});
