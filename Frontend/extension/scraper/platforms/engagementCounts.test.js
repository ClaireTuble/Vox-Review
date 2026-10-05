import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const platformDirectory = new URL("./", import.meta.url);

async function loadScraper(fileName, bindings, functionName) {
  const source = await readFile(new URL(fileName, platformDirectory), "utf8");
  const context = {
    console: { log() {}, info() {}, warn() {} },
    ...bindings,
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.scrapeForTest = ${functionName};`, context);
  return context.scrapeForTest;
}

function element(text = "", attributes = {}) {
  return {
    innerText: text,
    textContent: text,
    getAttribute: (name) => attributes[name] ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

test("Lazada helpful counts are parsed from each matching review card", async () => {
  const cards = [1, 12].map((count, index) => ({
    querySelector(selector) {
      if (selector.includes("user-name")) return element(`Buyer ${index + 1}`);
      if (selector.includes("title.right")) return element(`2026-06-0${index + 1}`);
      if (selector.includes("main-content-reviews-item")) return element(`Review text ${index + 1}`);
      if (selector === ".item-content-like-content-text") return element(`Helpful(${count})`);
      return null;
    },
    cloneNode: () => element(),
  }));
  const document = {
    title: "Lazada Product",
    querySelector: () => null,
    querySelectorAll(selector) {
      return selector.includes(".mod-reviews .item") ? cards : [];
    },
  };
  const scrape = await loadScraper("lazada.js", {
    document,
    window: { location: { href: "https://www.lazada.com.ph/products/pdp-i1.html", pathname: "/products/pdp-i1.html" } },
  }, "scrapeLazadaReviews");

  const result = scrape();

  assert.deepEqual(Array.from(result.reviews, (review) => [review.text, review.helpfulCount]), [
    ["Review text 1", 1],
    ["Review text 2", 12],
  ]);
});

test("Google Maps likes are parsed from the matching review card button", async () => {
  const cards = [2, 10].map((count, index) => ({
    querySelector(selector) {
      if (selector === ".wiI7pd") return element(`Maps review ${index + 1}`);
      if (selector === "button.gllhef") {
        return element(String(count), { title: `${count} likes`, "aria-label": `${count} likes` });
      }
      return null;
    },
    querySelectorAll: () => [],
  }));
  const document = {
    title: "Google Place",
    querySelector: () => null,
    querySelectorAll(selector) {
      return selector === ".jftiEf" ? cards : [];
    },
  };
  const scrape = await loadScraper("google.js", {
    document,
    window: { location: { href: "https://www.google.com/maps/place/Test", pathname: "/maps/place/Test" } },
  }, "scrapeGoogleReviews");

  const result = scrape();

  assert.deepEqual(Array.from(result.reviews, (review) => [review.text, review.helpfulCount]), [
    ["Maps review 1", 2],
    ["Maps review 2", 10],
  ]);
});

test("Google Play thumbs-up counts use the matching review card data attribute", async () => {
  const cards = [
    { id: "play-1", count: "6026", text: "Play review 1" },
    { id: "play-2", count: null, text: "Play review 2" },
  ].map(({ id, count, text }) => ({
    contains: () => false,
    getAttribute: (name) => (name === "data-review-id" ? id : null),
    dataset: { reviewId: id },
    querySelector(selector) {
      if (selector.includes(".X5PpBb")) return element("Reviewer");
      if (selector.includes(".bp9Aid")) return element("2026-01-01");
      if (selector.includes(".h3YV2d")) return element(text);
      if (selector === "[data-original-thumbs-up-count]" && count !== null) {
        return element("", { "data-original-thumbs-up-count": count });
      }
      return null;
    },
  }));
  const document = {
    title: "Play app",
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector.includes("data-review-id")) return cards;
      return [];
    },
  };
  const scrape = await loadScraper("googlePlay.js", {
    document,
    window: { location: { href: "https://play.google.com/store/apps/details?id=test", pathname: "/store/apps/details" } },
  }, "scrapeGooglePlayReviews");

  const result = scrape();

  assert.deepEqual(Array.from(result.reviews, (review) => [review.id, review.helpfulCount]), [
    ["play-1", 6026],
    ["play-2", null],
  ]);
});

test("Shopee leaves helpfulCount null when its current review object has no count source", async () => {
  const card = {
    children: [],
    getAttribute: () => "comment-1",
    closest: () => card,
    querySelector(selector) {
      if (selector.includes("author-name")) return element("Buyer");
      if (selector.includes("rating__time")) return element("2026-01-01");
      if (selector.includes("shopee-product-rating__text")) return element("Shopee review");
      return null;
    },
  };
  const document = {
    title: "Shopee Product",
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === ".product-ratings__list .YNedDV") return [];
      if (selector === "[data-cmtid], .shopee-product-rating") return [card];
      return [];
    },
  };
  const scrape = await loadScraper("shopee.js", {
    document,
    window: { location: { href: "https://shopee.ph/product/1/2", pathname: "/product/1/2" } },
  }, "scrapeShopeeReviews");

  const result = scrape();

  assert.equal(result.reviews[0].id, "comment-1");
  assert.equal(result.reviews[0].helpfulCount, null);
});