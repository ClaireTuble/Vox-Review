// ── Config ───────────────────────────────────────────────────────────────────
const BACKEND_URLS = ["http://localhost:5000", "http://127.0.0.1:5000"];

// ── Health report helper (fire-and-forget) ───────────────────────────────────
// Posts a health event to the backend. Never blocks scraping; failures are logged
// and silently ignored so the core extension flow is unaffected.
async function reportHealthToBackend(payload) {
  for (const baseUrl of BACKEND_URLS) {
    try {
      const res = await fetch(`${baseUrl}/api/health/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return;
    } catch (err) {
      // Try next URL fallback
    }
  }
  console.warn("VoxReview: Health report failed on all backend URLs (backend may be offline)");
}

// ── User Activity report helper (fire-and-forget) ────────────────────────────
// Reports regular user platform usage ("Used") using stored Auth session.
async function reportUserActivityToBackend(platform) {
  if (!platform || platform === "unknown") return;

  try {
    chrome.storage.local.get(["voxreview_auth_session"], async (res) => {
      const session = res.voxreview_auth_session;
      const token = session?.token;
      if (!token) return;

      for (const baseUrl of BACKEND_URLS) {
        try {
          const resp = await fetch(`${baseUrl}/api/user/activity`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              platform: platform,
              activity_type: "Used",
            }),
          });
          if (resp.ok) return;
        } catch (err) {
          // Try next URL fallback
        }
      }
    });
  } catch (err) {
    console.warn("VoxReview: User activity report notice:", err.message);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("VoxReview installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── reviewsScraped ──────────────────────────────────────────────────────────
  if (message?.type === "reviewsScraped") {
    const {
      platform = "shopee",
      productTitle = "Shopee Product",
      productImage = null,
      rating = null,
      category = null,
      reviews = [],
      url = "",
      ratingFilter = "all",
    } = message;

    const pageUrl = url || sender.tab?.url || "";
    const isProductPage = message.isProductPage ?? true;

    console.log("Received scrape:", {
      platform,
      productTitle,
      reviewsCount: reviews.length,
      url: pageUrl,
    });

    // Clear any unsupported-site flag for this tab since we now have valid data.
    chrome.storage.local.set({ voxreviewSiteStatus: { unsupported: false } });

    // ── Immediate Health & Activity Report Dispatch ────────────────────────────
    if (isProductPage && platform && platform !== "unknown") {
      reportUserActivityToBackend(platform);

      if (reviews.length > 0) {
        // SUCCESS: reviews were actually extracted
        reportHealthToBackend({
          platform,
          status: "Working",
          lastSuccessfulStage: "Data Transfer",
          errorStage: null,
          errorMessage: null,
        });
      } else {
        // WARNING: product page confirmed but no reviews found in DOM
        reportHealthToBackend({
          platform,
          status: "Warning",
          lastSuccessfulStage: "Review Section Detection",
          errorStage: "Review Extraction",
          errorMessage: "Product page detected but no reviews found in DOM.",
        });
      }
    }

    chrome.storage.local.get(["voxreviewLastScrape"], (result) => {
      const currentScrape = result.voxreviewLastScrape || {};

      // Session change: different product, URL, rating filter, or first run
      const isDifferentProduct = currentScrape.productTitle && currentScrape.productTitle !== productTitle;
      const isDifferentUrl = currentScrape.url && pageUrl && currentScrape.url !== pageUrl;
      const isDifferentFilter = currentScrape.ratingFilter !== undefined && currentScrape.ratingFilter !== ratingFilter;
      const productChanged = isDifferentProduct || isDifferentUrl || isDifferentFilter || !currentScrape.sessionId;

      let finalReviews = reviews; // always replace on filter/product change
      let sessionId = currentScrape.sessionId;

      if (productChanged) {
        sessionId = Date.now();
        finalReviews = reviews; // clear old session reviews completely
      } else {
        // Same product & same filter: deduplicate & merge
        const existingReviews = currentScrape.reviews || [];
        const reviewMap = new Map();
        existingReviews.forEach((r) => reviewMap.set(r.id || r.text, r));
        reviews.forEach((r) => reviewMap.set(r.id || r.text, r));
        finalReviews = Array.from(reviewMap.values());
      }

      const scrapeData = {
        sessionId: sessionId,
        platform: platform,
        isProductPage: message.isProductPage ?? true,
        productTitle: productTitle,
        productImage: productImage,
        rating: rating,
        category: category,
        ratingFilter: ratingFilter,
        reviews: finalReviews,
        reviewCount: finalReviews.length,
        url: pageUrl,
        timestamp: Date.now(),
        tabId: sender.tab?.id ?? null,
      };

      chrome.storage.local.set({ voxreviewLastScrape: scrapeData }, () => {
        console.log("Stored scrape data to chrome.storage.local:", scrapeData);
      });
    });

    sendResponse({ ok: true });
  }

  // ── scrapeError ─────────────────────────────────────────────────────────────
  // Content script sends this when scrapeAndSend() catches a runtime exception.
  if (message?.type === "scrapeError") {
    const { platform, errorStage, errorMessage } = message;
    console.error("VoxReview: Scrape error reported:", { platform, errorStage, errorMessage });

    if (platform && platform !== "unknown") {
      reportHealthToBackend({
        platform,
        status: "Error",
        lastSuccessfulStage: null,
        errorStage: errorStage || "Review Extraction",
        errorMessage: errorMessage || "An unknown error occurred during scraping.",
      });

      chrome.storage.local.set({
        voxreviewLastScrape: {
          platform,
          isProductPage: true,
          hasError: true,
          errorStage: errorStage || "Review Extraction",
          errorMessage: errorMessage || "An unknown error occurred during scraping.",
          reviews: [],
          reviewCount: 0,
          timestamp: Date.now(),
        },
      });
    }

    sendResponse({ ok: true });
  }

  // ── unsupportedSite ─────────────────────────────────────────────────────────
  // Content script sends this when it lands on a page that is not one of the
  // supported platforms. We store the flag so the popup can show a clean
  // "unsupported site" message instead of stale or empty review data.
  if (message?.type === "unsupportedSite") {
    const pageUrl = message.url || sender.tab?.url || "";
    console.log("VoxReview: Unsupported site detected:", pageUrl);

    chrome.storage.local.set({
      voxreviewSiteStatus: {
        unsupported: true,
        url: pageUrl,
        timestamp: Date.now(),
      },
    }).catch((err) => console.error("Failed to store site status:", err));

    sendResponse({ ok: true });
  }

  // ── userAuthSync ───────────────────────────────────────────────────────────
  // Synchronizes the web application's authentication session to chrome.storage.local
  // so the extension popup automatically recognizes authenticated vs guest users.
  if (message?.type === "userAuthSync") {
    const session = message.session || null;
    console.log("VoxReview background: Auth session synced:", session);

    chrome.storage.local.set({
      voxreview_auth_session: session,
    }).catch((err) => console.error("Failed to store auth session:", err));

    sendResponse({ ok: true });
  }

  // ── rescanPage ──────────────────────────────────────────────────────────────
  if (message?.type === "rescanPage") {
    // Forward rescan request to the content script on the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (!tab?.id) {
        sendResponse({ ok: false, reason: "no active tab" });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "rescanPage" }, (response) => {
        if (chrome.runtime?.lastError) {
          console.warn("VoxReview rescan error:", chrome.runtime.lastError.message);
          sendResponse({ ok: false, reason: chrome.runtime.lastError.message });
        } else {
          sendResponse(response || { ok: true });
        }
      });
    });
    return true; // keep channel open for async sendResponse
  }

  return true;
});