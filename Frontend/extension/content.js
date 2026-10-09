if (globalThis.__voxreviewContentScriptInitialized) {
  console.log("VoxReview content already initialized.");
} else {
  globalThis.__voxreviewContentScriptInitialized = true;
  console.log("VoxReview content loaded");

function hasUnpairedSurrogate(text) {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const nextCodeUnit = text.charCodeAt(index + 1);
      if (nextCodeUnit < 0xDC00 || nextCodeUnit > 0xDFFF) return true;
      index += 1;
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      return true;
    }
  }
  return false;
}

// ── Extension context guard ──────────────────────────────────────────────────
function isExtensionContextValid() {
  return typeof chrome !== "undefined" && chrome.runtime && !!chrome.runtime.id;
}

// ── Safe message sender ──────────────────────────────────────────────────────
async function safeSendMessage(message) {
  if (!isExtensionContextValid()) {
    console.warn("VoxReview: Extension context invalidated, skipping send.");
    return null;
  }
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (chrome.runtime?.lastError) {
      console.warn("VoxReview:", chrome.runtime.lastError.message);
      return null;
    }
    return response;
  } catch (err) {
    console.warn("VoxReview message error:", err.message);
    return null;
  }
}

// ── Auth Session Sync ────────────────────────────────────────────────────────
// Only the regular user session is meant for the extension.
// Super admin storage is written separately and is never forwarded.
// Forward central auth synchronization events from the web application.
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  window.addEventListener("voxreview_auth_sync", (e) => {
    const session = e.detail || null;
    const validSession = session && session.user && session.token ? session : null;
    safeSendMessage({
      type: "userAuthSync",
      session: validSession,
    });
  });

  window.addEventListener("voxreview_health_check", async (event) => {
    const request = event.detail || {};
    const response = await safeSendMessage({
      type: "healthCheck",
      platform: request.platform,
      requestId: request.requestId,
    });
    window.dispatchEvent(new CustomEvent("voxreview_health_check_result", {
      detail: { requestId: request.requestId, ...(response || { ok: false, status: "Unavailable" }) },
    }));
  });
}
// ── Platform ─────────────────────────────────────────────────────────────────
const platform = detectPlatform();
console.log("VoxReview detected platform:", platform);

// ── Unsupported site handling ─────────────────────────────────────────────────
// When the current page is NOT a supported platform:
//   1. Do NOT attempt to scrape anything.
//   2. Do NOT modify the page in any way.
//   3. Notify background.js so the popup can display a clean message.
if (platform === "unknown") {
  console.log("VoxReview: Unsupported platform — sending unsupportedSite signal.");
  safeSendMessage({
    type: "unsupportedSite",
    url: window.location.href,
  });

} else {
  // ── State tracking ─────────────────────────────────────────────────────────
  let lastSentSignature = ""; // tracks the last page/filter/review set sent to the background
  let isScraping = false;
  let rescanQueued = false;
  let queuedRescanForce = false;
  let queuedRescanRequestId = null;
  let debounceTimer = null;

  const reviewMutationSelectors = {
    shopee: {
      content: ".product-ratings__list .YNedDV, [class*='comment-content'], [class*='review-content']",
      cards: "[data-cmtid], .shopee-product-rating, .product-ratings__list .YNedDV",
    },
    lazada: {
      content: ".item-content-main-content-reviews-item, [class*='main-content-reviews-item'], [class*='review-content'], [class*='user-comment']",
      cards: ".mod-reviews .item, .pdp-mod-review .item, [class*='mod-review'] .item, #module_product_review .item, [class*='pdp-review'] .item, [class*='review-item']",
    },
    google: {
      content: ".jftiEf .wiI7pd",
      cards: ".jftiEf",
    },
    googleplay: {
      content: ".h3YV2d, [class*='review-text']",
      cards: "[data-review-id], .c1bOId, .RHo1pe, .EGFGHd",
    },
    steam: {
      content: ".apphub_CardTextContent",
      cards: '[role="list"] > div > div[role="button"]',
    },
  }[platform];

  function nodeMatchesReviewSelector(node, selector) {
    if (node.nodeType !== 1) return false;
    return node.matches(selector) || !!node.querySelector(selector);
  }

  function isReviewMutationRelevant(mutation) {
    const target = mutation.target.nodeType === 1
      ? mutation.target
      : mutation.target.parentElement;
    if (target?.closest(reviewMutationSelectors.content)) return true;
    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return changedNodes.some((node) => (
      nodeMatchesReviewSelector(node, reviewMutationSelectors.content) ||
      nodeMatchesReviewSelector(node, reviewMutationSelectors.cards)
    ));
  }

  // Observer stays alive for the whole page session — NEVER disconnected
  // after a successful scrape. Only disconnected on context invalidation.
  let domObserver = null;

  // ── Core: scrape current DOM state and send if anything changed ─────────────
  async function scrapeAndSend(force = false, rescanRequestId = null) {
    if (!isExtensionContextValid()) {
      console.warn("VoxReview: Context gone, stopping observer.");
      if (domObserver) { domObserver.disconnect(); domObserver = null; }
      return;
    }

    if (isScraping) {
      rescanQueued = true;
      if (force) {
        queuedRescanForce = true;
        queuedRescanRequestId = rescanRequestId;
      }
      return;
    }
    isScraping = true;
    if (force) lastSentSignature = "";
    console.log("[SCRAPE] scrapeAndSend started", { platform, force });

    try {
      console.log("[SCRAPE] scraper selected:", platform);
      console.log("[SCRAPE] scraper started:", platform);
      const raw = (typeof scrapeReviews === "function")
        ? await scrapeReviews(platform)
        : null;

      if (!raw) { return; }

      // Normalise: scraper may return array or {reviews, ...metadata}
      const reviews = Array.isArray(raw) ? raw : (raw.reviews || []);
      const isProductPage = Array.isArray(raw) ? true : (raw.isProductPage ?? true);
      const productTitle = Array.isArray(raw) ? "" : (raw.productTitle || "");
      const productImage = Array.isArray(raw) ? null : (raw.productImage || null);
      const rating = Array.isArray(raw) ? null : (raw.rating || null);
      const category = Array.isArray(raw) ? null : (raw.category || null);
      const ratingFilter = Array.isArray(raw) ? "all" : (raw.ratingFilter || "all");
      const productUrl = Array.isArray(raw) ? window.location.href
        : (raw.productUrl || window.location.href);
      console.log("[SCRAPE] reviews returned:", reviews.length);

      // Build a lightweight signature of the current visible state.
      // Only send a message to background when something actually changed.
      const reviewSignature = reviews.map((review) => {
        if (typeof review === "string") return review;
        if (!review || typeof review !== "object") return String(review);
        const text = review.text || review.reviewText || review.comment || review.review || review.body || review.reviewBody || "";
        return `${review.id || review.reviewId || ""}:${text}`;
      }).join("\u001f");
      const signature = `${productUrl}|${ratingFilter}|${isProductPage}|${reviewSignature}`;

      if (signature === lastSentSignature) {
        return; // DOM fired but nothing meaningful changed — skip
      }

      lastSentSignature = signature;
      if (isProductPage && platform) {
        safeSendMessage({
          type: "pageDetected",
          platform: platform,
          isProductPage: isProductPage,
          productTitle: productTitle,
          productUrl: productUrl,
        });
      }
      if (["shopee", "lazada", "google", "googleplay", "steam"].includes(platform)) {
        console.info("[TOPIC TRACE] scrape output", {
          platform,
          reviewsScraped: reviews.length,
          reviewMetadata: reviews.map((review, reviewIndex) => {
            const textFields = ["text", "reviewText", "comment", "review", "content", "body", "reviewBody"];
            const fieldMetadata = textFields
              .filter((field) => review && typeof review === "object" && field in review)
              .map((field) => ({
                field,
                type: Array.isArray(review[field]) ? "array" : typeof review[field],
                length: typeof review[field] === "string" || Array.isArray(review[field])
                  ? review[field].length
                  : null,
              }));
            const normalizedText = fieldMetadata
              .map(({ field }) => review[field])
              .find((value) => typeof value === "string" && value.trim()) || "";
            return {
              reviewIndex,
              objectKeys: review && typeof review === "object" ? Object.keys(review) : [],
              textFields: fieldMetadata,
              normalizedTextType: typeof normalizedText,
              normalizedTextLength: normalizedText.length,
              containsHtml: /<\/?[a-z][^>]*>/i.test(normalizedText),
              hasReplacementCharacter: normalizedText.includes("\uFFFD"),
              hasUnpairedSurrogate: hasUnpairedSurrogate(normalizedText),
            };
          }),
        });
      }

      if (platform === "lazada") {
        console.log("[Lazada] Product page:", isProductPage, "Reviews found:", reviews.length);
      }

      if (platform === "googleplay") {
        console.log("[Google Play] Product page:", isProductPage, "Reviews found:", reviews.length);
      }

      console.log(
        `VoxReview: Sending scrape — isProductPage:${isProductPage} filter:"${ratingFilter}" ` +
        `reviews:${reviews.length} url:${productUrl.slice(-40)}`
      );

      const response = await safeSendMessage({
        type: "reviewsScraped",
        forceRefresh: force,
        platform: platform,
        isProductPage: isProductPage,
        productTitle: productTitle,
        productImage: productImage,
        rating: rating,
        category: category,
        ratingFilter: ratingFilter,
        url: productUrl,
        reviews: reviews,   // always the FULL current visible set
        rescanRequestId,
      });
      console.log("[SCRAPE] reviewsScraped sent:", response?.ok !== false);

    } catch (err) {
      console.error("VoxReview scrapeAndSend error:", err);

      // Report the error to background.js for health tracking
      await safeSendMessage({
        type: "scrapeError",
        platform: platform,
        errorStage: "Review Extraction",
        errorMessage: err.message || "An unknown error occurred during scraping.",
        url: window.location.href,
        rescanRequestId,
      });
    } finally {
      isScraping = false;
      if (rescanQueued) {
        const nextForce = queuedRescanForce;
        rescanQueued = false;
        queuedRescanForce = false;
        const requestId = queuedRescanRequestId;
        queuedRescanRequestId = null;
        setTimeout(() => scrapeAndSend(nextForce, requestId), 0);
      }
    }
  }

  // ── Debounced trigger (called by MutationObserver) ─────────────────────────
  const DEBOUNCE_MS = 600; // wait for Shopee's DOM to finish updating
  function onDomMutated() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scrapeAndSend, DEBOUNCE_MS);
  }

  // ── Start persistent MutationObserver ─────────────────────────────────────
  // Runs immediately for initial load, then keeps watching.
  // Observer is NEVER stopped after a successful scrape.
  function startPersistentObserver() {
    // Fire initial scrape right away
    scrapeAndSend();

    if (!isExtensionContextValid()) return;

    domObserver = new MutationObserver((mutations) => {
      if (!isExtensionContextValid()) {
        domObserver.disconnect();
        domObserver = null;
        return;
      }
      if (mutations.some(isReviewMutationRelevant)) onDomMutated();
    });

    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    console.log("VoxReview: Persistent observer started.");
  }

  // ── SPA / hash-based URL change detection ─────────────────────────────────
  // Shopee uses pushState navigation — detect product changes without reload.
  let lastHref = window.location.href;

  function checkUrlChange() {
    const currentHref = window.location.href;
    if (currentHref !== lastHref) {
      lastHref = currentHref;
      lastSentSignature = ""; // force re-send on URL change
      console.log("VoxReview: URL changed, re-scraping…");
      scrapeAndSend();
    }
  }

  // Poll for URL changes every 1 s (covers pushState / replaceState)
  setInterval(checkUrlChange, 1000);

  // ── Boot ──────────────────────────────────────────────────────────────────
  startPersistentObserver();

  // ── Manual rescan listener (from popup "Rescan Page" button) ─────────────
  // Resets the dedup signature so the next scrapeAndSend() always sends,
  // even if the DOM hasn't changed since the last scrape.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "healthCheck") {
      const requestedPlatform = String(message.platform || "").toLowerCase();
      if (requestedPlatform !== platform || typeof scrapeReviews !== "function") {
        sendResponse({
          ok: false,
          platform: requestedPlatform,
          status: typeof scrapeReviews === "function" ? "Warning" : "Not Implemented",
          errorStage: "Platform Detection",
          errorMessage: "The requested platform scraper is not available on this page.",
        });
        return;
      }

      Promise.resolve()
        .then(() => scrapeReviews(platform))
        .then((raw) => {
          if (!raw) {
            return {
              ok: false,
              platform,
              status: "Error",
              errorStage: "Scraper Execution",
              errorMessage: "The scraper returned no result.",
            };
          }

          const isProductPage = Array.isArray(raw) ? true : (raw.isProductPage ?? true);
          const reviews = Array.isArray(raw) ? raw : (raw.reviews || []);
          if (!isProductPage) {
            return {
              ok: true,
              platform,
              status: "Warning",
              errorStage: "Page/Product Detection",
              errorMessage: "The platform loaded, but no product or place page was detected.",
            };
          }

          return {
            ok: true,
            platform,
            status: reviews.length > 0 ? "Working" : "Warning",
            lastSuccessfulStage: reviews.length > 0 ? "Data Transfer" : "Review Section Detection",
            errorStage: reviews.length > 0 ? null : "Review Extraction",
            errorMessage: reviews.length > 0 ? null : "Product or place page detected, but no reviews were extracted.",
          };
        })
        .catch((error) => ({
          ok: false,
          platform,
          status: "Error",
          errorStage: "Scraper Execution",
          errorMessage: error.message || "The scraper threw an error.",
        }))
        .then(sendResponse);
      return true;
    }

    if (message?.type === "rescanPage") {
      console.log("VoxReview: Manual rescan requested.");
      console.log("[RESCAN] content script reached:", { platform });
      // Queue behind an in-flight scrape instead of dropping the user's request.
      scrapeAndSend(true, message.requestId || null);
      sendResponse({ ok: true, queued: isScraping });
    }
  });
}
}