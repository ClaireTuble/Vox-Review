import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const scraperSource = await readFile(new URL("./steam.js", import.meta.url), "utf8");
const detectorSource = await readFile(new URL("../detector.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../../manifest.json", import.meta.url), "utf8"));

function createScraperContext({
  cards = [],
  url = "https://store.steampowered.com/app/814380/",
} = {}) {
  const parsedUrl = new URL(url);
  const reviewSection = {
    querySelectorAll(selector) {
      if (selector === ".apphub_Card") return cards.filter((card) => !card.isModern);
      if (selector === '[role="list"] > div > [role="button"]') return cards.filter((card) => card.isModern);
      assert.fail(`Unexpected review selector: ${selector}`);
    },
  };
  const document = {
    querySelector(selector) {
      if (selector === "#app_reviews_hash") return reviewSection;
      if (selector === ".apphub_AppName") return { innerText: "Test Steam game", textContent: "Test Steam game" };
      if (selector === "meta[property='og:title']") return { getAttribute: () => "Test Steam game" };
      if (selector === "meta[property='og:image']") return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".apphub_Card") return cards.filter((card) => !card.isModern);
      if (selector === '[role="list"] > div > [role="button"]') return cards.filter((card) => card.isModern);
      assert.fail(`Unexpected document selector: ${selector}`);
    },
  };
  const context = {
    document,
    window: { location: parsedUrl },
    URL,
    URLSearchParams,
    console: { log() {}, info() {}, warn() {} },
  };
  vm.createContext(context);
  vm.runInContext(
    `${scraperSource}
      globalThis.extractForTest = extractSteamReviewsFromDom;
      globalThis.scrapeForTest = scrapeSteamReviews;
      globalThis.isProductPageForTest = isSteamProductPage;
      globalThis.getAppIdForTest = getSteamAppIdFromUrl;`,
    context,
  );
  return context;
}

function runDomExtraction(cards, url) {
  return createScraperContext({ cards, url }).extractForTest();
}

function createReviewCard(bodyText, metadataText = "", author = "Helpful reviewer") {
  const body = bodyText ? { innerText: bodyText, textContent: bodyText } : null;
  const metadata = metadataText ? [{ innerText: metadataText, textContent: metadataText }] : [];
  const authorLink = { innerText: author, textContent: author };
  return {
    innerText: `POSTED: today\n${author}\n${bodyText || metadataText}\nWas this review helpful?`,
    querySelector(selector) {
      if (selector === ".apphub_CardTextContent") return body;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".reviewer_specs, .review_specification_container, [class*='reviewer_spec']") return metadata;
      if (selector === 'a[data-miniprofile], a[href*="steamcommunity.com"]') return [authorLink];
      if (selector === "div") return [];
      return [];
    },
  };
}

function createModernReviewCard(bodyText, author = "Modern Steam reviewer") {
  const postedLabel = {
    children: [],
    innerText: "POSTED: TODAY",
    textContent: "POSTED: TODAY",
  };
  const header = {
    children: [postedLabel],
    innerText: postedLabel.innerText,
    textContent: postedLabel.textContent,
  };
  const body = {
    children: [],
    innerText: bodyText,
    textContent: bodyText,
  };
  const reviewContent = {
    children: [header, body],
    innerText: `${header.innerText}\n${bodyText}`,
    textContent: `${header.textContent}\n${bodyText}`,
  };
  header.parentElement = reviewContent;
  header.nextElementSibling = body;
  body.parentElement = reviewContent;
  postedLabel.parentElement = header;
  const authorLink = { innerText: author, textContent: author };
  return {
    isModern: true,
    innerText: `${author}\n${reviewContent.innerText}\nWas this review helpful?\nYes\nNo`,
    querySelector(selector) {
      if (selector === ".apphub_CardTextContent") return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "div") return [postedLabel];
      if (selector === ".reviewer_specs, .review_specification_container, [class*='reviewer_spec']") return [];
      if (selector === 'a[data-miniprofile], a[href*="steamcommunity.com"]') return [authorLink];
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
    window: { location: new URL(productUrl) },
    URL,
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
  assert.equal(result.productUrl, "https://store.steampowered.com/app/814380/");
  assert.equal("productImage" in result, false);
  assert.equal("rating" in result, false);
  assert.equal("category" in result, false);
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
  assert.equal(result.reviews.some((review) => /Ryzen|GeForce|VRAM|RAM:/i.test(review.text)), false);
  assert.equal("reviewer" in result.reviews[0], false);
  assert.equal("id" in result.reviews[0], false);
});

test("reports only review cards currently loaded in the Steam page DOM", () => {
  const result = runDomExtraction([
    createReviewCard("The current combat feels responsive."),
    createReviewCard("The soundtrack is excellent."),
  ]);

  assert.equal(result.rawEntries, 2);
  assert.equal(result.reviewSectionFound, true);
  assert.equal(result.reviewCardsFound, 2);
  assert.equal(result.reviews.length, 2);
  assert.equal('totalReviews' in result, false);
  assert.deepEqual(Array.from(result.reviews, ({ text }) => text), [
    "The current combat feels responsive.",
    "The soundtrack is excellent.",
  ]);
});

test("Steam review objects omit reviewer and persistent IDs while preserving recommendation signals", () => {
  const result = runDomExtraction([
    createReviewCard("The launch is stable.", "", "Recommended"),
    createReviewCard("Not recommended because the controls are unresponsive.", "", "Another private name"),
  ]);

  assert.deepEqual(Array.from(result.reviews, (review) => review.recommendation), [
    "positive",
    "negative",
  ]);
  for (const review of result.reviews) {
    assert.deepEqual(
      Object.keys(review).sort(),
      [
        "helpfulCount",
        "helpfulnessAvailable",
        "helpfulnessMetric",
        "platform",
        "recommendation",
        "text",
      ],
    );
    assert.equal("id" in review, false);
    assert.equal("reviewer" in review, false);
  }
  assert.doesNotMatch(JSON.stringify(result.reviews), /Private Steam name|Another private name/);
});

test("extracts review bodies from Steam Store's current role-based review cards", () => {
  const result = runDomExtraction([
    createModernReviewCard("The gameplay is fun, and the latest update fixed the server issues."),
  ]);

  assert.equal(result.layout, "modern");
  assert.equal(result.reviewCardsFound, 1);
  assert.equal(result.rawEntries, 1);
  assert.equal(result.reviews.length, 1);
  assert.equal(
    result.reviews[0].text,
    "The gameplay is fun, and the latest update fixed the server issues.",
  );
  assert.equal("reviewer" in result.reviews[0], false);
});

test("detects the Steam Community reviews route and extracts only review-card text", () => {
  const url = "https://steamcommunity.com/app/690830/reviews/?browsefilter=toprated";
  const context = createScraperContext({
    url,
    cards: [
      createReviewCard(
        "Posted: May 10\nFoundation is a thoughtful city builder with a relaxing pace.",
        "",
        "PlayerOne",
      ),
      createReviewCard(
        "Posted: May 11\nThe systems are deep and the soundtrack is lovely.",
        "",
        "PlayerTwo",
      ),
    ],
  });

  assert.equal(context.isProductPageForTest(), true);
  assert.equal(context.getAppIdForTest(url), "690830");
  return context.scrapeForTest().then((result) => {
    assert.equal(result.platform, "steam");
    assert.equal("appId" in result, false);
    assert.deepEqual(Array.from(result.reviews, ({ text }) => text), [
      "Foundation is a thoughtful city builder with a relaxing pace.",
      "The systems are deep and the soundtrack is lovely.",
    ]);
    assert.equal(result.reviews.some(({ text }) => /PlayerOne|Was this review helpful/i.test(text)), false);
  });
});

test("recognizes the existing Steam Store route and ignores unrelated Community routes", () => {
  const store = createScraperContext({
    url: "https://store.steampowered.com/app/2138720/REMATCH/",
  });
  const communityOtherRoute = createScraperContext({
    url: "https://steamcommunity.com/app/690830/discussions/",
  });
  const communityWrongShape = createScraperContext({
    url: "https://steamcommunity.com/profiles/123/reviews/",
  });

  assert.equal(store.isProductPageForTest(), true);
  assert.equal(store.getAppIdForTest(store.window.location.href), "2138720");
  assert.equal(communityOtherRoute.isProductPageForTest(), false);
  assert.equal(communityOtherRoute.getAppIdForTest(communityOtherRoute.window.location.href), null);
  assert.equal(communityWrongShape.isProductPageForTest(), false);
});

test("content detection and manifest scope include Store plus only Community review routes", () => {
  const detectPage = (url) => {
    const context = { window: { location: new URL(url) } };
    vm.createContext(context);
    vm.runInContext(`${detectorSource}\nglobalThis.detectForTest = detectPlatform;`, context);
    return context.detectForTest();
  };
  const steamStoreContentScript = manifest.content_scripts.find((script) => (
    script.js.includes("scraper/platforms/steam.js")
    && script.matches.includes("https://store.steampowered.com/*")
  ));
  const steamCommunityContentScript = manifest.content_scripts.find((script) => (
    script.js.includes("scraper/platforms/steam.js")
    && script.matches.includes("https://steamcommunity.com/app/*/reviews*")
  ));

  assert.equal(detectPage("https://store.steampowered.com/app/2138720/REMATCH/"), "steam");
  assert.equal(detectPage("https://steamcommunity.com/app/690830/reviews/?browsefilter=toprated"), "steam");
  assert.equal(detectPage("https://steamcommunity.com/app/690830/discussions/"), "unknown");
  assert.ok(steamStoreContentScript);
  assert.ok(steamStoreContentScript.matches.includes("https://*.steampowered.com/*"));
  assert.ok(steamCommunityContentScript);
  assert.ok(manifest.host_permissions.includes("https://store.steampowered.com/*"));
});

test("counts malformed Community review cards as rejected and excludes author/helpful text", () => {
  const result = runDomExtraction([
    createReviewCard("", "", "Review author"),
    createReviewCard("A clearly written review body.", "", "Unrelated profile text"),
  ], "https://steamcommunity.com/app/690830/reviews/");

  assert.equal(result.rawEntries, 2);
  assert.equal(result.rejectedEntries, 1);
  assert.deepEqual(Array.from(result.reviews, ({ text }) => text), ["A clearly written review body."]);
});

test("Rescan picks up Steam Store and Community DOM growth without fetching review pages", async () => {
  for (const url of [
    "https://store.steampowered.com/app/814380/",
    "https://steamcommunity.com/app/690830/reviews/",
  ]) {
    const cards = [createReviewCard("Review already visible in the page.")];
    const context = createScraperContext({ url, cards });

    const initial = await context.scrapeForTest();
    cards.push(
      createReviewCard("Review already visible in the page."),
      createReviewCard("New review loaded using Steam's own page controls."),
    );
    const rescanned = await context.scrapeForTest();

    assert.equal(initial.reviews.length, 1, url);
    assert.deepEqual(
      Array.from(rescanned.reviews, ({ text }) => text),
      [
        "Review already visible in the page.",
        "New review loaded using Steam's own page controls.",
      ],
      url,
    );
  }
});

test("explains that Steam must load page reviews before Rescan when no review cards are present", async () => {
  const context = createScraperContext({ url: "https://steamcommunity.com/app/690830/reviews/" });
  const result = await context.scrapeForTest();

  assert.equal(result.hasError, true);
  assert.match(result.errorMessage, /Steam's review controls or scroll the page, then select Rescan/);
  assert.deepEqual({
    reviewSectionFound: result.reviewDiagnostics.reviewSectionFound,
    reviewCardsFound: result.reviewDiagnostics.reviewCardsFound,
    candidateReviewCards: result.reviewDiagnostics.candidateReviewCards,
    nonEmptyReviewTexts: result.reviewDiagnostics.nonEmptyReviewTexts,
    returnedReviews: result.reviewDiagnostics.returnedReviews,
  }, {
    reviewSectionFound: true,
    reviewCardsFound: 0,
    candidateReviewCards: 0,
    nonEmptyReviewTexts: 0,
    returnedReviews: 0,
  });
  assert.deepEqual(Array.from(result.reviews), []);
});