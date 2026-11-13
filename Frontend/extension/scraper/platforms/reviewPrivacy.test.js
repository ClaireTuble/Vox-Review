import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const reviewFields = new Set(["text", "date", "rating", "recommendation", "platform"]);
const privateReviewerText = "Reviewer PrivateName";

async function loadScraper(filename, context, entryPoint) {
  const source = await readFile(new URL(`./${filename}`, import.meta.url), "utf8");
  const helperSource = await readFile(new URL("../helpfulness.js", import.meta.url), "utf8");
  vm.createContext(context);
  vm.runInContext(helperSource, context);
  vm.runInContext(`${source}\nglobalThis.scrapeForPrivacyTest = ${entryPoint};`, context);
  return context.scrapeForPrivacyTest;
}

function textNode(text) {
  return { innerText: text, textContent: text };
}

test("Google Play scraper returns only review allowlist fields and never reads reviewer names", async () => {
  const reviewerSelectors = [];
  const reviewText = "This app is useful and easy to navigate.";
  const card = {
    querySelector(selector) {
      reviewerSelectors.push(selector);
      if (selector.includes("date")) return textNode("Jun 1, 2026");
      if (selector.includes("review-text")) return textNode(reviewText);
      if (selector.includes("reviewer")) return textNode(privateReviewerText);
      return null;
    },
    getAttribute: () => "platform-review-id",
    contains: () => false,
  };
  const context = {
    URL,
    window: { location: new URL("https://play.google.com/store/apps/details?id=app.example") },
    document: {
      title: "Example App - Apps on Google Play",
      querySelector(selector) {
        return selector === ".hnnXjf, [itemprop='name'], header.c1bOId, [data-review-id], .RHo1pe, .EGFGHd"
          ? {}
          : null;
      },
      querySelectorAll(selector) {
        if (selector === "h1") return [];
        return selector.includes("data-review-id") ? [card] : [];
      },
    },
    console: { log() {} },
  };
  const scrape = await loadScraper("googlePlay.js", context, "scrapeGooglePlayReviews");
  const result = scrape();

  assert.deepEqual(Object.keys(result.reviews[0]).sort(), [
    "date", "helpfulCount", "helpfulnessAvailable", "helpfulnessMetric", "platform", "text",
  ]);
  assert.deepEqual(
    [result.reviews[0].helpfulCount, result.reviews[0].helpfulnessMetric, result.reviews[0].helpfulnessAvailable],
    [null, null, false],
  );
  assert.equal(result.reviews[0].text, reviewText);
  assert.equal(result.reviews[0].platform, "googleplay");
  assert.equal(reviewerSelectors.some((selector) => /reviewer|author|user-name/i.test(selector)), false);
  assert.doesNotMatch(JSON.stringify(result.reviews), /PrivateName|platform-review-id/);
  assert.equal("productImage" in result, false);
});

test("Shopee scraper emits no reviewer or comment identifiers and does not log review text", async () => {
  const reviewText = "The item works well and arrived on time.";
  const logEntries = [];
  const reviewerSelectors = [];
  const body = textNode(reviewText);
  const date = textNode("Jun 2, 2026");
  const card = {
    querySelector(selector) {
      reviewerSelectors.push(selector);
      if (selector.includes("rating__time")) return date;
      if (selector.includes("shopee-product-rating__text")) return body;
      if (/author-name|user-name/i.test(selector)) return textNode(privateReviewerText);
      return null;
    },
  };
  const context = {
    window: { location: new URL("https://shopee.ph/product/123/456") },
    document: {
      title: "Example Product | Shopee",
      querySelector: () => textNode("Example Product"),
      querySelectorAll(selector) {
        if (selector === ".product-ratings__list .YNedDV") return [];
        if (selector === "[data-cmtid], .shopee-product-rating") return [card];
        return [];
      },
    },
    console: { log: (...args) => logEntries.push(args) },
  };
  const scrape = await loadScraper("shopee.js", context, "scrapeShopeeReviews");
  const result = scrape();

  assert.deepEqual(Object.keys(result.reviews[0]).sort(), [
    "date", "helpfulCount", "helpfulnessAvailable", "helpfulnessMetric", "platform", "text",
  ]);
  assert.equal(result.reviews[0].text, reviewText);
  assert.equal(reviewerSelectors.some((selector) => /author-name|user-name/i.test(selector)), false);
  assert.doesNotMatch(JSON.stringify(result.reviews), /PrivateName|comment-id/);
  assert.doesNotMatch(JSON.stringify(logEntries), new RegExp(reviewText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal("productImage" in result, false);
});

test("Lazada scraper returns the allowlisted review fields without reviewer-linked IDs", async () => {
  const reviewText = "The packaging was good and the device works as expected.";
  const reviewerSelectors = [];
  const card = {
    querySelector(selector) {
      reviewerSelectors.push(selector);
      if (selector.includes("time")) return textNode("Jun 3, 2026");
      if (selector.includes("main-content-reviews-item")) return textNode(reviewText);
      if (/user-name|reviewer|author/i.test(selector)) return textNode(privateReviewerText);
      return null;
    },
  };
  const context = {
    window: { location: new URL("https://www.lazada.com.ph/products/example-i123456.html") },
    document: {
      title: "Example Product | Lazada",
      querySelector(selector) {
        return selector.includes("product-title") ? textNode("Example Product") : {};
      },
      querySelectorAll(selector) {
        return selector.includes("review-item") || selector.includes("mod-review")
          ? [card]
          : [];
      },
    },
    console: { log() {} },
  };
  const scrape = await loadScraper("lazada.js", context, "scrapeLazadaReviews");
  const result = scrape();

  assert.deepEqual(Object.keys(result.reviews[0]).sort(), [
    "date", "helpfulCount", "helpfulnessAvailable", "helpfulnessMetric", "platform", "text",
  ]);
  assert.equal(result.reviews[0].text, reviewText);
  assert.equal(reviewerSelectors.some((selector) => /user-name|reviewer|author/i.test(selector)), false);
  assert.doesNotMatch(JSON.stringify(result.reviews), /PrivateName|lazada-review-/);
  assert.equal("productImage" in result, false);
});

test("the supported scraper object schema excludes all non-allowlisted fields", async () => {
  const sources = await Promise.all(["steam.js", "googlePlay.js", "shopee.js", "lazada.js"].map(
    (filename) => readFile(new URL(`./${filename}`, import.meta.url), "utf8"),
  ));

  for (const source of sources) {
    assert.doesNotMatch(source, /\b(?:reviewer|reviewerName|reviewId|recommendationid)\s*:/);
  }
  assert.ok([...reviewFields].includes("recommendation"));
});
