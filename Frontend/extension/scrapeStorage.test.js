import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { resolveScrapeReviews } from "./scrapeStorage.js";
import { sanitizeReviewsForAnalysis } from "../src/services/privacyRedaction.js";

const pageContext = {
  sessionId: 1,
  productTitle: "Product",
  url: "https://example.com/product",
  ratingFilter: "all",
};

test("reviews found after an initial empty scan are retained in source order", () => {
  const afterEmptyScan = resolveScrapeReviews({
    currentScrape: { ...pageContext, reviews: [] },
    incomingReviews: [{ id: "review-1" }, { id: "review-2" }],
    productTitle: pageContext.productTitle,
    pageUrl: pageContext.url,
    ratingFilter: pageContext.ratingFilter,
  });

  assert.deepEqual(afterEmptyScan, [{ id: "review-1" }, { id: "review-2" }]);
});

test("the scrape handler sanitizes old merged reviews before storage", async () => {
  const source = await readFile(new URL("./background.js", import.meta.url), "utf8");
  const handlerStart = source.indexOf('if (message?.type === "reviewsScraped")');
  const handlerEnd = source.indexOf('if (message?.type === "scrapeError")', handlerStart);
  assert.notEqual(handlerStart, -1);
  assert.ok(handlerEnd > handlerStart);

  const storedValues = {
    voxreviewLastScrape: {
      ...pageContext,
      reviews: [{
        id: "old-review",
        reviewerName: "Old Reviewer",
        username: "old-user",
        text: "Bad delivery. Tracking No: OLD-1234. Email old@example.com.",
      }],
    },
  };
  const storage = {
    get(_keys, callback) {
      callback(storedValues);
    },
    set(values, callback) {
      Object.assign(storedValues, values);
      callback?.();
    },
  };
  const handler = runInNewContext(`(message, sender, sendResponse) => {
    ${source.slice(handlerStart, handlerEnd)}
  }`, {
    VALID_PLATFORMS: new Set(["googleplay"]),
    sanitizeProductImageUrl: (value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
      } catch {
        return null;
      }
    },
    filterSubstantiveReviews: (reviews) => reviews,
    sanitizeReviewsForAnalysis,
    ensureLegacyReviewPrivacyMigration: async () => {},
    resolveScrapeReviews,
    chrome: { runtime: { lastError: null }, storage: { local: storage } },
    console: { log() {} },
    reportHealthToBackend() {},
  });
  const responses = [];

  await new Promise((resolve) => {
    handler({
      type: "reviewsScraped",
      platform: "googleplay",
      isProductPage: false,
      productTitle: pageContext.productTitle,
      productImage: "https://cdn.example/product.png",
      productMediaType: "image",
      url: pageContext.url,
      reviews: [{
        id: "new-review",
        name: "New Reviewer",
        reviewText: "Terrible support. Contact new@example.com or +63 917 123 4567.",
      }],
    }, {
      tab: { id: 9, url: pageContext.url },
    }, (response) => {
      responses.push(response);
      resolve();
    });
  });

  const storedReviews = storedValues.voxreviewLastScrape.reviews;
  assert.equal(responses[0].ok, true);
  assert.equal(storedReviews.length, 2);
  assert.equal(storedReviews[0].text, "Bad delivery. Tracking No [ORDER_ID]. Email [EMAIL].");
  assert.equal(storedReviews[1].text, "Terrible support. Contact [EMAIL] or [PHONE].");
  assert.equal(storedReviews[0].reviewerName, undefined);
  assert.equal(storedReviews[0].username, undefined);
  assert.equal(storedReviews[1].name, undefined);
  assert.equal(storedValues.voxreviewLastScrape.productImage, "https://cdn.example/product.png");
  assert.equal(storedValues.voxreviewLastScrape.productMediaType, "image");
});

test("an empty later scan does not clear valid reviews for the same page, including a rescan", () => {
  const existingReviews = [{ id: "review-1" }, { id: "review-2" }];
  const afterEmptyScan = resolveScrapeReviews({
    currentScrape: { ...pageContext, reviews: existingReviews },
    incomingReviews: [],
    productTitle: pageContext.productTitle,
    pageUrl: pageContext.url,
    ratingFilter: pageContext.ratingFilter,
    forceRefresh: true,
  });

  assert.deepEqual(afterEmptyScan, existingReviews);
});

test("repeated scans merge duplicate reviews only once and preserve review order", () => {
  const firstReview = { id: "review-1", text: "Good product" };
  const secondReview = { id: "review-2", text: "Fast delivery" };
  const mergedReviews = resolveScrapeReviews({
    currentScrape: { ...pageContext, reviews: [firstReview] },
    incomingReviews: [firstReview, secondReview],
    productTitle: pageContext.productTitle,
    pageUrl: pageContext.url,
    ratingFilter: pageContext.ratingFilter,
  });

  assert.deepEqual(mergedReviews, [firstReview, secondReview]);
});

test("review identity supports the same text fields as shared review normalization", () => {
  const mergedReviews = resolveScrapeReviews({
    currentScrape: { ...pageContext, reviews: [{ content: "Same review" }] },
    incomingReviews: [{ reviewBody: " same   review " }, "Another review"],
    productTitle: pageContext.productTitle,
    pageUrl: pageContext.url,
    ratingFilter: pageContext.ratingFilter,
  });

  assert.deepEqual(mergedReviews, [
    { content: "Same review" },
    "Another review",
  ]);
});

test("a refreshed valid helpfulness count replaces the cached value without changing review order", () => {
  const mergedReviews = resolveScrapeReviews({
    currentScrape: {
      ...pageContext,
      reviews: [
        {
          text: "Same review",
          helpfulCount: 2,
          helpfulnessMetric: "helpful_votes",
          helpfulnessAvailable: true,
        },
        { text: "Second review", helpfulCount: null, helpfulnessMetric: null, helpfulnessAvailable: false },
      ],
    },
    incomingReviews: [{
      text: " same   review ",
      helpfulCount: 12,
      helpfulnessMetric: "review_likes",
      helpfulnessAvailable: true,
    }],
    productTitle: pageContext.productTitle,
    pageUrl: pageContext.url,
    ratingFilter: pageContext.ratingFilter,
  });

  assert.deepEqual(mergedReviews.map((review) => review.text), ["Same review", "Second review"]);
  assert.deepEqual([
    mergedReviews[0].helpfulCount,
    mergedReviews[0].helpfulnessMetric,
    mergedReviews[0].helpfulnessAvailable,
  ], [12, "review_likes", true]);
});

test("an unavailable refresh preserves a prior valid count and never fabricates zero", () => {
  const prior = {
    text: "Same review",
    helpfulCount: 9,
    helpfulnessMetric: "helpful_votes",
    helpfulnessAvailable: true,
  };
  const mergedReviews = resolveScrapeReviews({
    currentScrape: { ...pageContext, reviews: [prior] },
    incomingReviews: [{
      text: "Same review",
      helpfulCount: null,
      helpfulnessMetric: null,
      helpfulnessAvailable: false,
    }],
    productTitle: pageContext.productTitle,
    pageUrl: pageContext.url,
    ratingFilter: pageContext.ratingFilter,
  });

  assert.deepEqual([
    mergedReviews[0].helpfulCount,
    mergedReviews[0].helpfulnessMetric,
    mergedReviews[0].helpfulnessAvailable,
  ], [9, "helpful_votes", true]);
});

test("the active worker helper has no imports outside the extension root", async () => {
  const source = await readFile(new URL("./scrapeStorage.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']\.\.\//);
});

test("the active worker uses the backend URL export for availability requests", async () => {
  const worker = await readFile(new URL("./background.js", import.meta.url), "utf8");

  assert.match(worker, /import \{ API_BASE_URL \} from "\.\.\/src\/services\/apiConfig\.js"/);
  assert.match(worker, /const BACKEND_URLS = \[API_BASE_URL\]/);
  assert.match(worker, /fetch\(`\$\{baseUrl\}\/api\/health\/status`/);
});

test("the active worker scrape handler does not shadow the review filter with its page URL", async () => {
  const source = await readFile(new URL("./background.js", import.meta.url), "utf8");
  const handlerStart = source.indexOf('if (message?.type === "reviewsScraped")');
  const handlerEnd = source.indexOf('if (message?.type === "scrapeError")', handlerStart);
  assert.notEqual(handlerStart, -1);
  assert.ok(handlerEnd > handlerStart);

  const handler = source.slice(handlerStart, handlerEnd);
  assert.match(handler, /const reviews = sanitizeReviewsForAnalysis\(\s*filterSubstantiveReviews\(scrapedReviews\),\s*platform,\s*\)/);
  assert.match(handler, /const scrapePageUrl = url \|\| sender\.tab\?\.url \|\| ""/);
  assert.doesNotMatch(handler, /url: pageUrl/);
});

test("the reviewsScraped handler stores reviews with the resolved page URL", async () => {
  const source = await readFile(new URL("./background.js", import.meta.url), "utf8");
  const handlerStart = source.indexOf('if (message?.type === "reviewsScraped")');
  const handlerEnd = source.indexOf('if (message?.type === "scrapeError")', handlerStart);
  const handlerSource = source.slice(handlerStart, handlerEnd);
  assert.notEqual(handlerStart, -1);
  assert.ok(handlerEnd > handlerStart);
  assert.match(handlerSource, /url: scrapePageUrl,/);
  assert.doesNotMatch(handlerSource, /url: pageUrl,/);
  const storedValues = {};
  const storage = {
    get(_keys, callback) {
      callback({ voxreviewLastScrape: storedValues.voxreviewLastScrape });
    },
    set(values, callback) {
      Object.assign(storedValues, values);
      callback?.();
    },
  };
  const handler = runInNewContext(`(message, sender, sendResponse) => { ${handlerSource} }`, {
    VALID_PLATFORMS: new Set(["googleplay"]),
    sanitizeProductImageUrl: (value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
      } catch {
        return null;
      }
    },
    filterSubstantiveReviews: (reviews) => reviews,
    sanitizeReviewsForAnalysis,
    ensureLegacyReviewPrivacyMigration: async () => {},
    resolveScrapeReviews,
    chrome: { runtime: { lastError: null }, storage: { local: storage } },
    console: { log() {} },
    reportHealthToBackend() {},
  });
  const responses = [];
  const incomingReviews = [{ id: "play-review-1", text: "A valid review" }];

  await new Promise((resolve) => {
    handler({
      type: "reviewsScraped",
      platform: "googleplay",
      productTitle: "Test app",
      url: "https://play.google.com/store/apps/details?id=test",
      reviews: incomingReviews,
    }, {
      tab: { id: 9, url: "https://play.google.com/store/apps/details?id=test" },
    }, (response) => {
      responses.push(response);
      resolve();
    });
  });

  assert.equal(responses[0].ok, true);
  assert.deepEqual(storedValues.voxreviewLastScrape.reviews, [{ text: "A valid review" }]);
  assert.equal(storedValues.voxreviewLastScrape.reviewCount, 1);
  assert.equal(
    storedValues.voxreviewLastScrape.url,
    "https://play.google.com/store/apps/details?id=test",
  );
});

test("an empty scan for a different page clears the previous page's reviews", () => {
  const afterPageChange = resolveScrapeReviews({
    currentScrape: { ...pageContext, reviews: [{ id: "old-review" }] },
    incomingReviews: [],
    productTitle: "New product",
    pageUrl: "https://example.com/new-product",
    ratingFilter: pageContext.ratingFilter,
  });

  assert.deepEqual(afterPageChange, []);
});
