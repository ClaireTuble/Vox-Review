console.log("Google Play scraper loaded");

let lastAppId = "";
const seenReviewKeys = new Set();
let allScrapedReviews = [];

function getGooglePlayAppId() {
  const url = new URL(window.location.href);
  if (
    url.hostname !== "play.google.com" ||
    !/^\/store\/apps\/details\/?$/.test(url.pathname)
  ) {
    return "";
  }
  return url.searchParams.get("id")?.trim() || "";
}

function isGooglePlayProductPage() {
  return Boolean(getGooglePlayAppId());
}

function getGooglePlayProductMetadata() {
  let productTitle = "";

  const headerH1 = document.querySelector(".hnnXjf h1, [itemprop='name'] h1, h1[class]");
  if (headerH1) {
    const directText = Array.from(headerH1.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    productTitle = directText || headerH1.innerText?.trim() || "";
  }

  if (!productTitle) {
    const allH1 = document.querySelectorAll("h1");
    for (const h1 of allH1) {
      const t = (h1.innerText || h1.textContent || "").trim();
      if (t && t.length < 120 && !/categories|recommended|similar/i.test(t)) {
        productTitle = t;
        break;
      }
    }
  }

  if (!productTitle && document.title) {
    productTitle = document.title.replace(/[-–|].*$/g, "").trim();
  }

  return {
    platform: "googleplay",
    productTitle: productTitle || "Google Play App",
    productUrl: window.location.href,
  };
}

function extractGooglePlayHelpfulness(card) {
  if (!globalThis.__voxreviewHelpfulness?.isCollectionEnabled("googleplay")) {
    return { helpfulCount: null, helpfulnessMetric: null, helpfulnessAvailable: false };
  }
  const attributeElement = card.querySelector("[data-original-thumbs-up-count]");
  const attributeValue = attributeElement?.getAttribute("data-original-thumbs-up-count");
  const textElement = card.querySelector(".AJTPZc[jsname='J0d7Yd'], .AJTPZc");
  const text = (textElement?.innerText || textElement?.textContent || "").trim();
  const textMatch = text.match(/^([\d,]+)\s+people\s+found\s+this\s+review\s+helpful$/i);
  const parser = globalThis.__voxreviewHelpfulness?.parseNonNegativeSafeInteger;
  const count = typeof parser === "function"
    ? (parser(attributeValue) ?? (textMatch ? parser(textMatch[1]) : null))
    : null;
  return globalThis.__voxreviewHelpfulness?.buildHelpfulnessFields(
    "googleplay",
    "helpful_votes",
    count,
  ) || { helpfulCount: null, helpfulnessMetric: null, helpfulnessAvailable: false };
}

function runAtScrapeStage(stage, operation) {
  try {
    return operation();
  } catch (error) {
    const stagedError = new Error(`Google Play ${stage.toLowerCase()} failed.`);
    stagedError.name = error?.name || "Error";
    stagedError.scrapeStage = stage;
    throw stagedError;
  }
}

function scrapeGooglePlayReviews() {
  const isProduct = runAtScrapeStage("Card Detection", isGooglePlayProductPage);
  if (!isProduct) {
    console.log("[Google Play] Not an app detail page.");
    return {
      isProductPage: false,
      productTitle: "",
      reviews: [],
    };
  }

  const appId = runAtScrapeStage("Card Detection", getGooglePlayAppId);
  if (appId !== lastAppId) {
    lastAppId = appId;
    seenReviewKeys.clear();
    allScrapedReviews = [];
  }

  const rawCards = runAtScrapeStage("Card Detection", () => Array.from(
    document.querySelectorAll(
      "header.c1bOId[data-review-id], [data-review-id], .c1bOId, .RHo1pe, .EGFGHd, div[role='dialog'] [data-review-id], div[role='dialog'] .c1bOId, div[role='dialog'] .RHo1pe, div[role='dialog'] .EGFGHd"
    )
  ));

  const cards = runAtScrapeStage("Card Detection", () => rawCards.filter((card, idx, arr) => {
    return !arr.some((other, otherIdx) => otherIdx !== idx && other.contains(card));
  }));

  console.log("[Google Play] Review cards detected:", cards.length);

  runAtScrapeStage("Review Extraction", () => cards.forEach((card) => {
    const dateEl = card.querySelector(".bp9Aid, [class*='date']");
    const date = dateEl
      ? (dateEl.innerText || dateEl.textContent || "").replace(/\s+/g, " ").trim()
      : "";

    const textEl = card.querySelector(".h3YV2d, [class*='review-text']");
    const text = textEl
      ? (textEl.innerText || textEl.textContent || "").replace(/\s+/g, " ").trim()
      : "";

    if (!text || text.length < 2) return;

    // Filter out developer replies
    const devReplyEl = card.querySelector(".p29vdb, [class*='developer-reply']");
    let cleanText = text;
    if (devReplyEl) {
      const replyText = (devReplyEl.innerText || "").trim();
      if (replyText && cleanText.includes(replyText)) {
        cleanText = cleanText.replace(replyText, "").trim();
      }
    }

    if (!cleanText || cleanText.length < 2) return;

    const uniqueKey = `${date.toLowerCase()}|${cleanText.toLowerCase()}`;

    if (!seenReviewKeys.has(uniqueKey)) {
      seenReviewKeys.add(uniqueKey);
      allScrapedReviews.push({
        ...(date ? { date } : {}),
        ...extractGooglePlayHelpfulness(card),
        text: cleanText,
        platform: "googleplay",
      });
    } else {
      const existing = allScrapedReviews.find((review) => (
        `${(review.date || "").toLowerCase()}|${review.text.toLowerCase()}` === uniqueKey
      ));
      const refreshedHelpfulness = extractGooglePlayHelpfulness(card);
      if (existing && refreshedHelpfulness.helpfulnessAvailable) {
        Object.assign(existing, refreshedHelpfulness);
      }
    }
  }));

  const metadata = runAtScrapeStage("Product Metadata", getGooglePlayProductMetadata);

  return {
    ...metadata,
    isProductPage: true,
    reviews: allScrapedReviews,
  };
}
