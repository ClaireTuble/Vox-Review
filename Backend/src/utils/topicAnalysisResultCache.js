import { createHash } from "node:crypto";

const DEFAULT_MAX_ENTRIES = 50;
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export function getTopicReviewSetSignature(reviews) {
  const texts = Array.isArray(reviews)
    ? reviews.map((review) => (
        typeof review === "string"
          ? review
          : review?.text || review?.reviewText || review?.comment || review?.review || ""
      ))
    : [];
  return createHash("sha256")
    .update(JSON.stringify(texts) ?? "undefined")
    .digest("hex")
    .slice(0, 24);
}

export function getTopicPageIdentity(pageKey) {
  if (typeof pageKey !== "string" || !pageKey) return null;
  return createHash("sha256").update(pageKey).digest("hex").slice(0, 24);
}

export function getTopicResultCacheKey({ pageIdentity, platform, operation, reviews }) {
  return createHash("sha256")
    .update(JSON.stringify({ pageIdentity, platform, operation, reviews }))
    .digest("hex");
}

export function createTopicAnalysisResultCache({
  maxEntries = DEFAULT_MAX_ENTRIES,
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now,
} = {}) {
  const entries = new Map();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value);
      }
    },
    get size() {
      return entries.size;
    },
  };
}

export async function computeAndCacheTopicResult(cache, key, compute) {
  const result = await compute();
  cache.set(key, result);
  return result;
}

export async function runTopicKeywordScoreBatches(
  reviews,
  {
    batchSize = 32,
    runBatch,
    isCancelled = () => false,
  },
) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("batchSize must be a positive integer");
  }
  if (typeof runBatch !== "function") {
    throw new TypeError("runBatch must be a function");
  }

  const results = [];
  let model = null;
  for (let offset = 0; offset < reviews.length; offset += batchSize) {
    if (isCancelled()) {
      throw Object.assign(new Error("Topic keyword scoring was cancelled"), {
        code: "CLIENT_CANCELLED",
      });
    }
    const batch = reviews.slice(offset, offset + batchSize);
    const response = await runBatch(batch, offset);
    model = response.model || model;
    results.push(...response.results.map((result, index) => ({
      ...result,
      reviewIndex: offset + index,
    })));
  }
  return { model, results };
}
