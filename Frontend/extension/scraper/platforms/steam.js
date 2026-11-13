console.log("Steam scraper loaded");

const STEAM_REVIEW_CARD_SELECTOR = ".apphub_Card";
const STEAM_REVIEW_BODY_SELECTOR = ".apphub_CardTextContent";
const STEAM_MODERN_REVIEW_CARD_SELECTOR = '[role="list"] > div > [role="button"]';
const STEAM_REVIEW_METADATA_SELECTOR = ".reviewer_specs, .review_specification_container, [class*='reviewer_spec']";
let steamReviewCollectionState = null;

function getSteamAppIdFromUrl(url) {
  if (!url) return null;
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();
    const validHost = host === "store.steampowered.com" || host === "steamcommunity.com";
    const validCommunityRoute = host !== "steamcommunity.com" ||
      /^\/app\/\d+\/reviews\/?$/i.test(parsedUrl.pathname);
    return validHost && validCommunityRoute
      ? parsedUrl.pathname.match(/^\/app\/(\d+)(?:\/|$)/i)?.[1] || null
      : null;
  } catch {
    return null;
  }
}

function isSteamProductPage() {
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname;
  if (host === "store.steampowered.com") {
    return /^\/app\/\d+(?:\/|$)/i.test(path) &&
      getSteamAppIdFromUrl(window.location.href) !== null;
  }
  return host === "steamcommunity.com" &&
    /^\/app\/\d+\/reviews\/?$/i.test(path) &&
    getSteamAppIdFromUrl(window.location.href) !== null;
}

function getSteamProductMetadata() {
  const productTitleElement = document.querySelector(".apphub_AppName");
  const productTitleFromPage = (productTitleElement?.innerText || productTitleElement?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  const titleEl = document.querySelector("meta[property='og:title']") || document.querySelector("title");
  const fallbackTitle = titleEl
    ? (titleEl.getAttribute("content") || titleEl.textContent || "").trim()
    : "";
  const productTitle = productTitleFromPage || fallbackTitle || "Steam Product";

  return {
    platform: "steam",
    productTitle: productTitle || "Steam Product",
    productUrl: window.location.href,
  };
}

function getSteamReviewIdentity(review) {
  return String(review?.text || review?.review || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function createSteamReviewCollectionState(appId, reviews = []) {
  const state = steamReviewCollectionState?.appId === appId
    ? steamReviewCollectionState
    : {
        appId,
        reviewTexts: new Set(),
        loadedReviews: [],
      };
  addSteamReviewsToState(state, reviews);
  steamReviewCollectionState = state;
  return state;
}

function addSteamReviewsToState(state, reviews) {
  const added = [];
  reviews.forEach((review) => {
    const text = getSteamReviewIdentity(review);
    if (!text) return;
    if (state.reviewTexts.has(text)) {
      const existing = state.loadedReviews.find((entry) => getSteamReviewIdentity(entry) === text);
      if (review.helpfulnessAvailable === true && Number.isSafeInteger(review.helpfulCount)) {
        Object.assign(existing, review);
      }
      return;
    }
    state.reviewTexts.add(text);
    state.loadedReviews.push(review);
    added.push(review);
  });
  return added;
}

function getModernSteamReviewBody(card) {
  const postedLabel = Array.from(card.querySelectorAll("div")).find((element) => (
    element.children.length === 0 &&
    /^Posted:\s*/i.test((element.innerText || element.textContent || "").trim())
  ));
  const metadataHeader = postedLabel?.parentElement;
  const reviewSection = metadataHeader?.parentElement;
  const reviewBody = metadataHeader?.nextElementSibling;
  return reviewBody?.parentElement === reviewSection ? reviewBody : null;
}

function extractSteamHelpfulness(card) {
  if (!globalThis.__voxreviewHelpfulness?.isCollectionEnabled("steam")) {
    return { helpfulCount: null, helpfulnessMetric: null, helpfulnessAvailable: false };
  }
  const element = card.querySelector(".j8nIw0zXcJo-");
  const text = (element?.innerText || element?.textContent || "").trim();
  const match = text.match(/^([\d,]+)\s+people\s+found\s+this\s+review\s+helpful$/i);
  const count = match
    ? globalThis.__voxreviewHelpfulness?.parseNonNegativeSafeInteger(match[1]) ?? null
    : null;
  return globalThis.__voxreviewHelpfulness?.buildHelpfulnessFields(
    "steam",
    "helpful_votes",
    count,
  ) || { helpfulCount: null, helpfulnessMetric: null, helpfulnessAvailable: false };
}

function extractSteamReviewsFromDom() {
  const isCommunityReviewsPage = window.location.hostname.toLowerCase() === "steamcommunity.com";
  const reviewSection = isCommunityReviewsPage ? document : document.querySelector("#app_reviews_hash");
  if (!reviewSection) {
    return {
      reviews: [],
      layout: "unavailable",
      reviewSectionFound: false,
      reviewCardsFound: 0,
      rawEntries: 0,
      rejectedEntries: 0,
      rejectedMetadataEntries: 0,
    };
  }

  const legacyReviewCards = Array.from(
    reviewSection.querySelectorAll(STEAM_REVIEW_CARD_SELECTOR),
  ).filter((card) => (
    card.querySelector(STEAM_REVIEW_BODY_SELECTOR) ||
    /\bPosted:\s*\S/i.test(card.innerText || card.textContent || "")
  ));
  const modernReviewCards = legacyReviewCards.length > 0
    ? []
    : Array.from(reviewSection.querySelectorAll(STEAM_MODERN_REVIEW_CARD_SELECTOR))
      .filter((card) => getModernSteamReviewBody(card));
  const reviewCardElements = legacyReviewCards.length > 0 ? legacyReviewCards : modernReviewCards;
  const rawReviewCards = reviewCardElements;

  const excludedMetadata = new Set();
  let rejectedEntries = 0;
  let rejectedMetadataEntries = 0;
  const reviews = rawReviewCards.map((card) => {
    Array.from(card.querySelectorAll(STEAM_REVIEW_METADATA_SELECTOR)).forEach((element) => {
      const metadataText = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      if (metadataText) {
        excludedMetadata.add(metadataText);
        rejectedMetadataEntries += 1;
      }
    });

    const reviewBody = legacyReviewCards.length > 0
      ? card.querySelector(STEAM_REVIEW_BODY_SELECTOR)
      : getModernSteamReviewBody(card);
    const rawBodyText = (reviewBody?.innerText || reviewBody?.textContent || "").trim();
    const text = rawBodyText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^Posted:\s*/i.test(line))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) {
      rejectedEntries += 1;
      return null;
    }

    const postedDate = rawBodyText.match(/^Posted:\s*(.+)$/im)?.[1]?.trim() || "";
    const recommendationText = (card.innerText || card.textContent || "").toLowerCase();

    return {
      ...(postedDate ? { date: postedDate } : {}),
      ...(/not recommended/i.test(recommendationText)
        ? { recommendation: "negative" }
        : (/recommended/i.test(recommendationText) ? { recommendation: "positive" } : {})),
      ...extractSteamHelpfulness(card),
      text,
      platform: "steam",
    };
  }).filter(Boolean);

  return {
    reviews,
    layout: legacyReviewCards.length > 0 ? "legacy" : "modern",
    reviewSectionFound: true,
    reviewCardsFound: reviewCardElements.length,
    rawEntries: rawReviewCards.length,
    rejectedEntries,
    rejectedMetadataEntries,
  };
}

async function scrapeSteamReviews() {
  const isProduct = isSteamProductPage();
  if (!isProduct) {
    console.log("[Steam] Not a Steam Store product page.");
    return {
      isProductPage: false,
      productTitle: "",
      reviews: [],
    };
  }

  const appId = getSteamAppIdFromUrl(window.location.href);
  if (!appId) {
    console.log("[Steam] Could not determine app ID from URL.");
    return {
      isProductPage: false,
      productTitle: "",
      reviews: [],
    };
  }

  const domExtraction = extractSteamReviewsFromDom();
  const extraction = domExtraction;
  const loadedReviews = createSteamReviewCollectionState(appId, extraction.reviews).loadedReviews;
  const metadata = getSteamProductMetadata();

  console.info("[Steam] Review extraction summary:", {
    source: "currently loaded page DOM",
    currentUrl: `${window.location.origin}${window.location.pathname}`,
    matchedPlatform: metadata.platform,
    layout: extraction.layout,
    reviewSectionFound: extraction.reviewSectionFound,
    reviewCardsFound: extraction.reviewCardsFound,
    rawEntriesExtracted: extraction.rawEntries,
    validReviewEntries: extraction.reviews.length,
    nonEmptyReviewTexts: extraction.reviews.length,
    rejectedMetadataEntries: extraction.rejectedMetadataEntries,
    rejectedEntries: extraction.rejectedEntries,
  });

  return {
    ...metadata,
    isProductPage: true,
    reviews: loadedReviews.slice(),
    reviewDiagnostics: {
      layout: extraction.layout,
      reviewSectionFound: extraction.reviewSectionFound,
      reviewCardsFound: extraction.reviewCardsFound,
      candidateReviewCards: extraction.rawEntries,
      nonEmptyReviewTexts: extraction.reviews.length,
      returnedReviews: loadedReviews.length,
    },
    hasError: extraction.reviews.length === 0,
    errorMessage: extraction.reviews.length === 0
      ? "Steam has not loaded any review cards yet. Use Steam's review controls or scroll the page, then select Rescan."
      : null,
  };
}

globalThis.scrapeSteamReviews = scrapeSteamReviews;
