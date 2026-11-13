import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const helperSource = await readFile(new URL("../helpfulness.js", import.meta.url), "utf8");

async function loadExtractor(filename, functionName, platform, enabled = true) {
  const source = await readFile(new URL(`./${filename}`, import.meta.url), "utf8");
  const context = { console: { log() {}, info() {}, warn() {} } };
  vm.createContext(context);
  vm.runInContext(helperSource, context);
  context.__voxreviewHelpfulnessCollection = { [platform]: enabled };
  vm.runInContext(`${source}\nglobalThis.extractForTest = ${functionName};`, context);
  return context.extractForTest;
}

function node(text, attributes = {}) {
  return {
    innerText: text,
    textContent: text,
    getAttribute: (name) => attributes[name] ?? null,
  };
}

const cases = [
  {
    platform: "steam",
    filename: "steam.js",
    extractor: "extractSteamHelpfulness",
    selector: ".j8nIw0zXcJo-",
    values: [
      ["37 people found this review helpful", 37],
      ["0 people found this review helpful", 0],
      ["1,234 people found this review helpful", 1234],
      ["helpful", null],
      ["1,,234 people found this review helpful", null],
      ["", null],
    ],
    metric: "helpful_votes",
  },
  {
    platform: "googleplay",
    filename: "googlePlay.js",
    extractor: "extractGooglePlayHelpfulness",
    selector: ".AJTPZc[jsname='J0d7Yd'], .AJTPZc",
    values: [
      ["14 people found this review helpful", 14],
      ["0 people found this review helpful", 0],
      ["2,345 people found this review helpful", 2345],
      ["bad count", null],
      ["1,,234 people found this review helpful", null],
      ["", null],
    ],
    metric: "helpful_votes",
  },
  {
    platform: "shopee",
    filename: "shopee.js",
    extractor: "extractShopeeReviewLikes",
    selector: ".shopee-product-rating__like-count",
    values: [["21", 21], ["0", 0], ["2,345", 2345], ["1,,234", null], ["n/a", null], ["", null]],
    metric: "review_likes",
  },
  {
    platform: "lazada",
    filename: "lazada.js",
    extractor: "extractLazadaHelpfulness",
    selector: ".item-content-like-content-text",
    values: [
      ["Helpful(3)", 3],
      ["Helpful(0)", 0],
      ["Helpful(1,234)", 1234],
      ["Helpful(no)", null],
      ["Helpful(1,,234)", null],
      ["", null],
    ],
    metric: "helpful_votes",
  },
];

for (const parserCase of cases) {
  test(`${parserCase.platform} parses only its individual review-card engagement value`, async () => {
    const extract = await loadExtractor(
      parserCase.filename,
      parserCase.extractor,
      parserCase.platform,
    );
    const visited = [];
    for (const [text, expected] of parserCase.values) {
      const card = {
        querySelector(selector) {
          visited.push(selector);
          if (parserCase.platform === "googleplay" &&
              selector === "[data-original-thumbs-up-count]") return null;
          return selector === parserCase.selector ? node(text) : null;
        },
      };
      if (parserCase.platform === "googleplay") {
        card.querySelector = function querySelector(selector) {
          visited.push(selector);
          if (selector === "[data-original-thumbs-up-count]") return null;
          return selector === parserCase.selector ? node(text) : null;
        };
      }
      const result = extract(card);
      assert.deepEqual(JSON.parse(JSON.stringify(result)), expected === null
        ? { helpfulCount: null, helpfulnessMetric: null, helpfulnessAvailable: false }
        : {
            helpfulCount: expected,
            helpfulnessMetric: parserCase.metric,
            helpfulnessAvailable: true,
          });
    }
    assert.ok(visited.every((selector) => (
      selector === parserCase.selector || selector === "[data-original-thumbs-up-count]"
    )));
  });

  test(`${parserCase.platform} keeps counts aligned to the corresponding card only`, async () => {
    const extract = await loadExtractor(
      parserCase.filename,
      parserCase.extractor,
      parserCase.platform,
    );
    const cards = parserCase.values.slice(0, 2).map(([text]) => ({
      querySelector(selector) {
        if (parserCase.platform === "googleplay" &&
            selector === "[data-original-thumbs-up-count]") return null;
        return selector === parserCase.selector ? node(text) : null;
      },
    }));
    const aligned = cards.map((card, reviewIndex) => ({
      reviewIndex,
      ...extract(card),
      text: `review-${reviewIndex}`,
    }));
    assert.deepEqual(aligned.map(({ reviewIndex, helpfulCount }) => [reviewIndex, helpfulCount]), [
      [0, parserCase.values[0][1]],
      [1, parserCase.values[1][1]],
    ]);
    assert.ok(aligned.every((review) => !("reviewer" in review) && !("id" in review)));
  });

  test(`${parserCase.platform} returns unavailable when the expected node is absent from the card`, async () => {
    const extract = await loadExtractor(
      parserCase.filename,
      parserCase.extractor,
      parserCase.platform,
    );
    const result = extract({ querySelector: () => null });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      helpfulCount: null,
      helpfulnessMetric: null,
      helpfulnessAvailable: false,
    });
  });
}

test("Google Play prefers a valid numeric historical attribute and safely falls back to text", async () => {
  const extract = await loadExtractor(
    "googlePlay.js",
    "extractGooglePlayHelpfulness",
    "googleplay",
  );
  const result = extract({
    querySelector(selector) {
      if (selector === "[data-original-thumbs-up-count]") {
        return node("", { "data-original-thumbs-up-count": "5,000" });
      }
      return node("14 people found this review helpful");
    },
  });
  assert.equal(result.helpfulCount, 5000);
  assert.equal(result.helpfulnessMetric, "helpful_votes");

  const fallback = extract({
    querySelector(selector) {
      if (selector === "[data-original-thumbs-up-count]") return node("", {
        "data-original-thumbs-up-count": "malformed",
      });
      return node("14 people found this review helpful");
    },
  });
  assert.equal(fallback.helpfulCount, 14);
});

test("disabled platform collection does not inspect review-card engagement nodes", async () => {
  const extract = await loadExtractor(
    "shopee.js",
    "extractShopeeReviewLikes",
    "shopee",
    false,
  );
  let queried = false;
  const result = extract({
    querySelector() {
      queried = true;
      return node("21");
    },
  });

  test("Steam, Google Play, Shopee, and Lazada collection gates default off", async () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(helperSource, context);

    assert.deepEqual(JSON.parse(JSON.stringify(context.__voxreviewHelpfulnessCollection)), {
      steam: false,
      googleplay: false,
      shopee: false,
      lazada: false,
    });
  });
  assert.equal(queried, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    helpfulCount: null,
    helpfulnessMetric: null,
    helpfulnessAvailable: false,
  });
});
