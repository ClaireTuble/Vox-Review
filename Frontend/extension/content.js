if (globalThis.__voxreviewContentScriptInitialized) {
  console.log("VoxReview content already initialized.");
} else {
  globalThis.__voxreviewContentScriptInitialized = true;
  console.log("VoxReview content loaded");

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
  let lastSentSignature = ""; // tracks last sent (url + filter + reviewCount)
  let isScraping = false;
  let rescanQueued = false;
  let debounceTimer = null;

  // Observer stays alive for the whole page session — NEVER disconnected
  // after a successful scrape. Only disconnected on context invalidation.
  let domObserver = null;

  // ── Core: scrape current DOM state and send if anything changed ─────────────
  async function scrapeAndSend(force = false) {
    if (!isExtensionContextValid()) {
      console.warn("VoxReview: Context gone, stopping observer.");
      if (domObserver) { domObserver.disconnect(); domObserver = null; }
      return;
    }

    if (isScraping) {
      if (force) rescanQueued = true;
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

      // Decoupled Activity Dispatch: notify background as soon as product/place page is detected
      if (isProductPage && platform) {
        safeSendMessage({
          type: "pageDetected",
          platform: platform,
          isProductPage: isProductPage,
          productTitle: productTitle,
          productUrl: productUrl,
        });
      }

      // Build a lightweight signature of the current visible state.
      // Only send a message to background when something actually changed.
      const signature = `${productUrl}|${ratingFilter}|${isProductPage}|${reviews.length}`;

      if (signature === lastSentSignature) {
        return; // DOM fired but nothing meaningful changed — skip
      }

      lastSentSignature = signature;

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
      });
    } finally {
      isScraping = false;
      if (rescanQueued) {
        rescanQueued = false;
        setTimeout(() => scrapeAndSend(true), 0);
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

    domObserver = new MutationObserver(() => {
      if (!isExtensionContextValid()) {
        domObserver.disconnect();
        domObserver = null;
        return;
      }
      onDomMutated();
    });

    domObserver.observe(document.body, { childList: true, subtree: true });
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
      scrapeAndSend(true);
      sendResponse({ ok: true, queued: isScraping });
    }
  });
}
}