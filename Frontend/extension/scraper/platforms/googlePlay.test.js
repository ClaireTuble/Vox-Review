import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const scraperSource = await readFile(new URL("./googlePlay.js", import.meta.url), "utf8");

function createReviewCard(text, date = "June 1, 2026") {
  const dateElement = { innerText: date, textContent: date };
  const textElement = { innerText: text, textContent: text };
  return {
    contains: () => false,
    querySelector(selector) {
      if (selector === ".bp9Aid, [class*='date']") return dateElement;
      if (selector === ".h3YV2d, [class*='review-text']") return textElement;
      return null;
    },
  };
}

function createScraperContext({ url, cards = [] }) {
  const context = {
    URL,
    console: { log() {} },
    document: {
      title: "Rise of Kingdoms: Lost Crusade - Apps on Google Play",
      querySelector: () => null,
      querySelectorAll(selector) {
        if (selector === "h1") return [];
        return cards;
      },
    },
    window: { location: new URL(url) },
  };
  vm.createContext(context);
  vm.runInContext(
    `${scraperSource}
      globalThis.scrapeForTest = scrapeGooglePlayReviews;
      globalThis.getAppIdForTest = getGooglePlayAppId;`,
    context,
  );
  return context;
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

test("Google Play scraper requires an app-details URL with an app ID", () => {
  const context = createScraperContext({
    url: "https://play.google.com/store/apps/details?id=com.lilithgame.roc.gp",
  });
  assert.equal(context.getAppIdForTest(), "com.lilithgame.roc.gp");
  assert.equal(context.scrapeForTest().isProductPage, true);

  context.window.location = new URL("https://play.google.com/store/search?q=id=com.lilithgame.roc.gp");
  assert.deepEqual(toPlainObject(context.scrapeForTest()), {
    isProductPage: false,
    productTitle: "",
    reviews: [],
  });
});

test("Google Play scraper picks up reviews rendered after the initial scan", () => {
  const cards = [];
  const context = createScraperContext({
    url: "https://play.google.com/store/apps/details?id=com.lilithgame.roc.gp",
    cards,
  });

  assert.deepEqual(toPlainObject(context.scrapeForTest().reviews), []);
  cards.push(createReviewCard("The game has great graphics."));
  assert.deepEqual(
    toPlainObject(context.scrapeForTest().reviews).map((review) => review.text),
    ["The game has great graphics."],
  );
});

test("Google Play scraper resets accumulated reviews when the app ID changes", () => {
  const cards = [createReviewCard("Review for the first app.")];
  const context = createScraperContext({
    url: "https://play.google.com/store/apps/details?id=com.example.first",
    cards,
  });

  assert.deepEqual(
    toPlainObject(context.scrapeForTest().reviews).map((review) => review.text),
    ["Review for the first app."],
  );

  context.window.location = new URL("https://play.google.com/store/apps/details?id=com.example.second");
  cards.splice(0, cards.length, createReviewCard("Review for the second app."));
  assert.deepEqual(
    toPlainObject(context.scrapeForTest().reviews).map((review) => review.text),
    ["Review for the second app."],
  );
});
