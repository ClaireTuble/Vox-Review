console.log("Steam scraper loaded");

const STEAM_REVIEW_CARD_SELECTOR = '[role="list"] > div > div[role="button"]';
const STEAM_REVIEW_BODY_SELECTOR = ".apphub_CardTextContent";
const STEAM_REVIEW_METADATA_SELECTOR = ".reviewer_specs, .review_specification_container, [class*='reviewer_spec']";

function getSteamAppIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/https?:\/\/store\.steampowered\.com\/app\/(\d+)(?:\/|$)/i);
  return match ? match[1] : null;
}

function isSteamProductPage() {
  const href = window.location.href;
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname;

  if (host !== "store.steampowered.com" && !host.endsWith(".steampowered.com")) {
    return false;
  }

  if (href === "https://store.steampowered.com/" || href === "http://store.steampowered.com/") {
    return false;
  }

  const appId = getSteamAppIdFromUrl(href);
  if (!appId) return false;

  const isProductPath = /^\/app\//i.test(path);
  const hasAppPageMarker = /\/app\//i.test(path) || /\/app\//i.test(href);

  if (!isProductPath && !hasAppPageMarker) {
    return false;
  }

  return true;
}

function getSteamProductMetadata() {
  const titleEl = document.querySelector("meta[property='og:title']") || document.querySelector("title");
  const productTitle = titleEl
    ? (titleEl.getAttribute("content") || titleEl.textContent || "").trim()
    : "Steam Product";

  const imgEl = document.querySelector("meta[property='og:image']");
  const productImage = imgEl ? (imgEl.getAttribute("content") || "") : null;

  const appId = getSteamAppIdFromUrl(window.location.href);
  const ratingEl = document.querySelector(".game_review_summary, .user_reviews_summary_row .summary_section, .summary_section .apphub_AppName");
  let rating = null;
  if (ratingEl) {
    const text = (ratingEl.innerText || ratingEl.textContent || "").replace(/\s+/g, " ").trim();
    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (match) rating = match[1];
  }

  return {
    platform: "steam",
    productTitle: productTitle || "Steam Product",
    productImage: productImage || null,
    rating: rating || null,
    category: "Steam Store",
    ratingFilter: "all",
    productUrl: window.location.href,
    appId: appId || null,
  };
}

async function fetchSteamReviews(appId) {
  if (!appId) {
    return {
      reviews: [],
      rawEntries: 0,
      rejectedEntries: 0,
      rejectedMetadataEntries: 0,
      sampleAccepted: null,
      sampleRejected: null,
    };
  }

  const reviewUrl = `https://store.steampowered.com/appreviews/${appId}?json=1`;

  try {
    const response = await fetch(reviewUrl, {
      method: "GET",
      credentials: "omit",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      console.warn("[Steam] Review fetch failed:", response.status, response.statusText);
      return {
        reviews: [],
        rawEntries: 0,
        rejectedEntries: 0,
        rejectedMetadataEntries: 0,
        sampleAccepted: null,
        sampleRejected: null,
      };
    }

    const data = await response.json();
    const rawReviews = Array.isArray(data?.reviews) ? data.reviews : [];

    const reviews = rawReviews
      .map((review, index) => {
        const text = typeof review?.review === "string" ? review.review.trim() : "";
        if (!text) return null;

        return {
          id: review?.recommendationid || review?.author?.steamid || `steam-review-${index}`,
          reviewer: review?.author?.steamid ? `Steam user ${review.author.steamid}` : "Steam user",
          date: review?.timestamp_created ? new Date(review.timestamp_created * 1000).toISOString() : "",
          rating: review?.voted_up === true ? "positive" : (review?.voted_up === false ? "negative" : null),
          text: text,
          review: text,
          platform: "steam",
        };
      })
      .filter(Boolean);

    const rejectedReviews = rawReviews.filter((review) => (
      typeof review?.review !== "string" || !review.review.trim()
    ));
    return {
      reviews,
      rawEntries: rawReviews.length,
      rejectedEntries: rejectedReviews.length,
      rejectedMetadataEntries: 0,
      sampleAccepted: reviews[0]?.text || null,
      sampleRejected: rejectedReviews[0]?.review || null,
    };
  } catch (error) {
    console.warn("[Steam] Failed to fetch Steam reviews:", error);
    return {
      reviews: [],
      rawEntries: 0,
      rejectedEntries: 0,
      rejectedMetadataEntries: 0,
      sampleAccepted: null,
      sampleRejected: null,
    };
  }
}

function extractSteamReviewsFromDom() {
  const reviewSection = document.querySelector("#app_reviews_hash");
  if (!reviewSection) {
    return {
      reviews: [],
      rawEntries: 0,
      rejectedEntries: 0,
      rejectedMetadataEntries: 0,
      sampleAccepted: null,
      sampleRejected: null,
    };
  }

  const rawReviewCards = Array.from(reviewSection.querySelectorAll(STEAM_REVIEW_CARD_SELECTOR)).filter((card) => {
    const cardText = card.innerText || card.textContent || "";
    return cardText.includes("POSTED:") && cardText.includes("Was this review helpful?");
  });

  const excludedMetadata = new Set();
  const rejectedReviewEntries = [];
  const reviews = rawReviewCards.map((card, index) => {
    Array.from(card.querySelectorAll(STEAM_REVIEW_METADATA_SELECTOR)).forEach((element) => {
      const metadataText = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      if (metadataText) excludedMetadata.add(metadataText);
    });

    const reviewBody = card.querySelector(STEAM_REVIEW_BODY_SELECTOR);
    const rawBodyText = (reviewBody?.innerText || reviewBody?.textContent || "").trim();
    const text = rawBodyText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^Posted:\s*/i.test(line))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) {
      rejectedReviewEntries.push((card.innerText || card.textContent || "").trim());
      return null;
    }

    const authorElement = card.querySelector('a[data-miniprofile], a[href*="steamcommunity.com"]');
    const postedDate = rawBodyText.match(/^Posted:\s*(.+)$/im)?.[1]?.trim() || "";
    const recommendationText = (card.innerText || card.textContent || "").toLowerCase();

    return {
      id: `steam-dom-review-${index}`,
      reviewer: (authorElement?.innerText || authorElement?.textContent || "Steam user").trim(),
      date: postedDate,
      rating: recommendationText.includes("not recommended") ? "negative" : (
        recommendationText.includes("recommended") ? "positive" : null
      ),
      text,
      review: text,
      platform: "steam",
    };
  }).filter(Boolean);

  return {
    reviews,
    rawEntries: rawReviewCards.length,
    rejectedEntries: rejectedReviewEntries.length,
    rejectedMetadataEntries: excludedMetadata.size,
    sampleAccepted: reviews[0]?.text || null,
    sampleRejected: excludedMetadata.values().next().value || rejectedReviewEntries[0] || null,
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
  const source = domExtraction.reviews.length > 0 ? "DOM" : "Steam API";
  const extraction = domExtraction.reviews.length > 0
    ? domExtraction
    : await fetchSteamReviews(appId);
  const metadata = getSteamProductMetadata();

  console.info("[Steam] Review extraction summary:", {
    source,
    rawEntriesExtracted: extraction.rawEntries,
    validReviewEntries: extraction.reviews.length,
    rejectedMetadataEntries: extraction.rejectedMetadataEntries,
    rejectedEntries: extraction.rejectedEntries,
    sampleAcceptedReview: extraction.sampleAccepted,
    sampleRejectedEntry: extraction.sampleRejected,
  });

  return {
    ...metadata,
    isProductPage: true,
    reviews: extraction.reviews,
  };
}

globalThis.scrapeSteamReviews = scrapeSteamReviews;
