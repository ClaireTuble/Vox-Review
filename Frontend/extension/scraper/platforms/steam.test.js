import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { calculateReviewPriorities } from "../../../src/Users/utils/priorityEngine.js";

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

function getProductMetadata({ appName, ogTitle }) {
  const title = { textContent: ogTitle, getAttribute: () => ogTitle };
  const image = { getAttribute: () => "https://cdn.example/game.jpg" };
  const document = {
    querySelector(selector) {
      if (selector === ".apphub_AppName") {
        return appName ? { innerText: appName, textContent: appName } : null;
      }
      if (selector === "meta[property='og:title']") return title;
      if (selector === "meta[property='og:image']") return image;
      if (selector.includes("game_review_summary")) return null;
      return null;
    },
  };
  const productUrl = "https://store.steampowered.com/app/814380/";
  const context = {
    document,
    window: { location: { href: productUrl } },
    console: { log() {}, info() {}, warn() {} },
  };
  vm.createContext(context);
  vm.runInContext(`${scraperSource}\nglobalThis.metadataForTest = getSteamProductMetadata;`, context);
  return context.metadataForTest();
}

test("uses Steam's canonical title instead of a promotional page title", () => {
  const result = getProductMetadata({
    appName: "Sekiro™: Shadows Die Twice - GOTY Edition",
    ogTitle: "Save 50% on Sekiro™: Shadows Die Twice - GOTY Edition on Steam",
  });

  assert.equal(result.productTitle, "Sekiro™: Shadows Die Twice - GOTY Edition");
  assert.equal(result.platform, "steam");
  assert.equal(result.category, "Steam Store");
  assert.equal(result.productImage, "https://cdn.example/game.jpg");
  assert.equal(result.appId, "814380");
  assert.equal(result.productUrl, "https://store.steampowered.com/app/814380/");
});

test("preserves an ordinary Steam game title as displayed", () => {
  const result = getProductMetadata({
    appName: "Wuthering Waves",
    ogTitle: "Wuthering Waves",
  });

  assert.equal(result.productTitle, "Wuthering Waves");
});

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
  assert.equal(result.reviews[0].helpfulCount, null);
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

test("Steam API review text and helpful votes reach severity-first priorities without Topic Analysis", async () => {
  const steamApiReviews = [
    {
      recommendationid: "minor-bug",
      review: "A small bug makes the inventory tooltip flicker sometimes, but the game is still playable.",
      votes_up: 3,
      voted_up: true,
    },
    {
      recommendationid: "minor-bug-neutral",
      review: "There is a minor bug in one cosmetic animation; it does not affect gameplay.",
      votes_up: 0,
      voted_up: true,
    },
    {
      recommendationid: "major-malfunction",
      review: "The save feature is broken and progress does not save after a long session.",
      votes_up: 0,
      voted_up: false,
    },
    {
      recommendationid: "critical-core-failure",
      review: "I can't open other menus or exit the game after loading a level.",
      votes_up: 0,
      voted_up: false,
    },
  ];
  const context = {
    console: { log() {}, info() {}, warn() {} },
    fetch: async () => ({
      ok: true,
      json: async () => ({ reviews: steamApiReviews }),
    }),
  };
  vm.createContext(context);
  vm.runInContext(`${scraperSource}\nglobalThis.fetchForTest = fetchSteamReviews;`, context);

  const scraped = await context.fetchForTest("123");
  const svmCategories = [3, 1, 1, 1];
  const priorityInputs = scraped.reviews.map((review, index) => ({
    ...review,
    category: svmCategories[index],
  }));
  const priorities = priorityInputs.map((review) => (
    calculateReviewPriorities([review], null)[0]
  ));

  assert.deepEqual(scraped.reviews.map(({ text }) => text), steamApiReviews.map(({ review }) => review));
  assert.deepEqual(scraped.reviews.map(({ helpfulCount }) => helpfulCount), [3, 0, 0, 0]);
  assert.deepEqual(priorities.map(({ severity, level }) => [severity, level]), [
    ["MINOR", "MEDIUM"],
    ["MINOR", "LOW"],
    ["MAJOR", "MEDIUM"],
    ["CRITICAL", "HIGH"],
  ]);
  assert.deepEqual(priorities.map(({ signals }) => signals.find(({ type }) => type === "severity")?.id), [
    "minor_malfunction",
    "minor_malfunction",
    "major_feature_failure",
    "core_unavailable",
  ]);
  assert.equal(priorities[0].factors.emotion, 1);
  assert.equal(priorities[0].factors.engagement, 1);
  assert.equal(priorities.every(({ factors }) => factors.repetition === 0), true);
  assert.equal(priorities[3].factors.repetition, 0);
});