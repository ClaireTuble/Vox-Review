console.log("Steam scraper loaded");

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
    return [];
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
      return [];
    }

    const data = await response.json();
    const reviews = Array.isArray(data?.reviews) ? data.reviews : [];

    return reviews
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
  } catch (error) {
    console.warn("[Steam] Failed to fetch Steam reviews:", error);
    return [];
  }
}

function extractSteamReviewsFromDom() {
  const reviewSection = document.querySelector("#app_reviews_hash");
  if (!reviewSection) return [];

  const reviewCards = Array.from(reviewSection.querySelectorAll(
    '[role="list"] > div > div[role="button"]'
  )).filter((card) => {
    const cardText = card.innerText || card.textContent || "";
    return cardText.includes("POSTED:") && cardText.includes("Was this review helpful?");
  });

  return reviewCards.map((card, index) => {
    const textCandidates = Array.from(card.querySelectorAll("div"))
      .filter((element) => element.children.length === 0 && !element.closest("a"))
      .map((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim())
      .filter((text) => text.length >= 2)
      .filter((text) => !/^Recommended$|^Not Recommended$|^POSTED:/i.test(text))
      .filter((text) => !/^\d[\d,.]*\s+(?:hrs?|games?|reviews?)/i.test(text))
      .filter((text) => !/^(?:Was this review helpful\?|Yes|No|Funny|Award|Direct from Steam)$/i.test(text))
      .filter((text) => !/^(?:\d[\d,.]*|\d[\d,.]* people found this review)/i.test(text))
      .filter((text) => !/^Reviewer's PC Specs:/i.test(text));
    const text = textCandidates.sort((left, right) => right.length - left.length)[0] || "";
    if (!text) return null;

    const authorElement = card.querySelector('a[data-miniprofile], a[href*="steamcommunity.com"]');
    const dateElement = Array.from(card.querySelectorAll("div")).find((element) => (
      /^POSTED:/i.test((element.innerText || element.textContent || "").trim())
    ));
    const recommendationText = (card.innerText || card.textContent || "").toLowerCase();

    return {
      id: `steam-dom-review-${index}`,
      reviewer: (authorElement?.innerText || authorElement?.textContent || "Steam user").trim(),
      date: (dateElement?.innerText || dateElement?.textContent || "").trim(),
      rating: recommendationText.includes("not recommended") ? "negative" : (
        recommendationText.includes("recommended") ? "positive" : null
      ),
      text,
      review: text,
      platform: "steam",
    };
  }).filter(Boolean);
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

  const domReviews = extractSteamReviewsFromDom();
  const reviews = domReviews.length > 0 ? domReviews : await fetchSteamReviews(appId);
  const metadata = getSteamProductMetadata();

  return {
    ...metadata,
    isProductPage: true,
    reviews: reviews,
  };
}
