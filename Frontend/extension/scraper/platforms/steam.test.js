import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const scraperSource = await readFile(new URL("./steam.js", import.meta.url), "utf8");

function runDomExtraction(cards) {
  const document = {
    querySelector(selector) {
      assert.equal(selector, "#app_reviews_hash");
      return {
        querySelectorAll(cardSelector) {
          assert.equal(cardSelector, '[role="list"] > div > div[role="button"]');
          return cards;
        },
      };
    },
  };
  const context = { document, console: { log() {}, info() {}, warn() {} } };
  vm.createContext(context);
  vm.runInContext(`${scraperSource}\nglobalThis.extractForTest = extractSteamReviewsFromDom;`, context);
  return context.extractForTest();
}

function createReviewCard(bodyText, metadataText = "") {
  const body = bodyText ? { innerText: bodyText, textContent: bodyText } : null;
  const metadata = metadataText ? [{ innerText: metadataText, textContent: metadataText }] : [];
  return {
    innerText: `POSTED: today\n${bodyText || metadataText}\nWas this review helpful?`,
    querySelector(selector) {
      if (selector === ".apphub_CardTextContent") return body;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".reviewer_specs, .review_specification_container, [class*='reviewer_spec']") return metadata;
      if (selector === "div") return [];
      return [];
    },
  };
}

test("extracts only Steam's dedicated review body and reports excluded PC specs", () => {
  const metadata = "AMD Ryzen 5 7600X3D 6-Core Processor - RAM: 31 GB";
  const result = runDomExtraction([
    createReviewCard("Posted: Sep 26, 2026\nThe combat is fluid and exploration feels rewarding.", metadata),
    createReviewCard("", "NVIDIA GeForce RTX 4060 Laptop GPU - VRAM: 8 GB"),
  ]);

  assert.equal(result.rawEntries, 2);
  assert.equal(result.reviews.length, 1);
  assert.equal(result.rejectedMetadataEntries, 2);
  assert.equal(result.rejectedEntries, 1);
  assert.equal(result.reviews[0].text, "The combat is fluid and exploration feels rewarding.");
  assert.equal(result.sampleAccepted, result.reviews[0].text);
  assert.equal(result.sampleRejected, metadata);
  assert.equal(result.reviews.some((review) => /Ryzen|GeForce|VRAM|RAM:/i.test(review.text)), false);
});

test("preserves Steam API helpful-vote counts when present", async () => {
  const context = {
    console: { log() {}, info() {}, warn() {} },
    fetch: async () => ({
      ok: true,
      json: async () => ({
        reviews: [
          { review: "Useful review", votes_up: 14, recommendationid: "review-1" },
          { review: "No engagement field", recommendationid: "review-2" },
        ],
      }),
    }),
  };
  vm.createContext(context);
  vm.runInContext(`${scraperSource}\nglobalThis.fetchForTest = fetchSteamReviews;`, context);

  const result = await context.fetchForTest("123");

  assert.equal(result.reviews[0].helpfulCount, 14);
  assert.equal(result.reviews[1].helpfulCount, null);
});