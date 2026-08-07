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

// ── Platform ─────────────────────────────────────────────────────────────────
const platform = detectPlatform();
console.log("VoxReview detected platform:", platform);

if (platform === "lazada") {
  console.log("[Lazada] Platform detected, starting scrape flow.");
}

if (platform === "unknown") {
  // Nothing to do on non-supported pages
  console.log("VoxReview: Unsupported platform, exiting.");
} else {
  // ── State tracking ─────────────────────────────────────────────────────────
  let lastSentSignature = ""; // tracks last sent (url + filter + reviewCount)
  let isScraping        = false;
  let debounceTimer     = null;

  // Observer stays alive for the whole page session — NEVER disconnected
  // after a successful scrape. Only disconnected on context invalidation.
  let domObserver = null;

  // ── Core: scrape current DOM state and send if anything changed ─────────────
  async function scrapeAndSend() {
    if (!isExtensionContextValid()) {
      console.warn("VoxReview: Context gone, stopping observer.");
      if (domObserver) { domObserver.disconnect(); domObserver = null; }
      return;
    }

    if (isScraping) return;
    isScraping = true;

    try {
      const raw = (typeof scrapeReviews === "function")
        ? scrapeReviews(platform)
        : null;

      if (!raw) { return; }

      // Normalise: scraper may return array or {reviews, ...metadata}
      const reviews      = Array.isArray(raw) ? raw         : (raw.reviews      || []);
      const productTitle = Array.isArray(raw) ? ""          : (raw.productTitle  || "");
      const productImage = Array.isArray(raw) ? null        : (raw.productImage  || null);
      const rating       = Array.isArray(raw) ? null        : (raw.rating        || null);
      const category     = Array.isArray(raw) ? null        : (raw.category      || null);
      const ratingFilter = Array.isArray(raw) ? "all"       : (raw.ratingFilter  || "all");
      const productUrl   = Array.isArray(raw) ? window.location.href
                                               : (raw.productUrl || window.location.href);

      // Build a lightweight signature of the current visible state.
      // Only send a message to background when something actually changed.
      const signature = `${productUrl}|${ratingFilter}|${reviews.length}`;

      if (signature === lastSentSignature) {
        return; // DOM fired but nothing meaningful changed — skip
      }

      lastSentSignature = signature;

      if (platform === "lazada") {
        console.log("[Lazada] Reviews found:", reviews.length);
        console.log("[Lazada] Sending to background", {
          platform,
          productTitle,
          reviewsCount: reviews.length,
          url: productUrl,
        });
      }

      console.log(
        `VoxReview: Sending scrape — filter:"${ratingFilter}" ` +
        `reviews:${reviews.length} url:${productUrl.slice(-40)}`
      );

      await safeSendMessage({
        type:         "reviewsScraped",
        platform:     platform,
        productTitle: productTitle,
        productImage: productImage,
        rating:       rating,
        category:     category,
        ratingFilter: ratingFilter,
        url:          productUrl,
        reviews:      reviews,   // always the FULL current visible set
      });

    } catch (err) {
      console.error("VoxReview scrapeAndSend error:", err);
    } finally {
      isScraping = false;
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
    if (message?.type === "rescanPage") {
      console.log("VoxReview: Manual rescan requested.");
      lastSentSignature = ""; // force re-send regardless of DOM changes
      scrapeAndSend();
      sendResponse({ ok: true });
    }
  });
}