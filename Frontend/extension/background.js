importScripts("healthTestConfig.js");

// ── Config ───────────────────────────────────────────────────────────────────
const BACKEND_URLS = ["http://localhost:5000", "http://127.0.0.1:5000"];
const HEALTH_CHECK_TIMEOUT_MS = 45_000;
const activeHealthChecks = new Set();

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
      if (res.ok) return true;
    } catch (err) {
      // Try next URL fallback
    }
  }
  console.warn("VoxReview: Health report failed on all backend URLs (backend may be offline)");
  return false;
}

async function runHealthCheck(platform, requestId) {
  if (activeHealthChecks.has(platform)) {
    return { ok: false, platform, status: "Unavailable", errorMessage: "A health check is already running." };
  }

  const testUrl = HEALTH_TEST_URLS[platform];
  if (!testUrl) {
    return { ok: false, platform, status: "Not Implemented", errorMessage: "No health-test URL is configured." };
  }

  activeHealthChecks.add(platform);
  let tabId = null;
  let timeoutId = null;
  let settled = false;
  let onUpdated;
  let onError;

  const finish = async (result) => {
    if (settled) return result;
    settled = true;
    clearTimeout(timeoutId);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onErrorOccurred.removeListener(onError);
    activeHealthChecks.delete(platform);

    const report = {
      platform,
      status: result.status || "Unavailable",
      lastSuccessfulStage: result.lastSuccessfulStage || null,
      errorStage: result.errorStage || null,
      errorMessage: result.errorMessage || null,
    };
    const reportOk = await reportHealthToBackend(report);

    if (tabId !== null) {
      try { await chrome.tabs.remove(tabId); } catch { /* The tab may already be closed. */ }
    }

    return { ...report, reportOk };
  };

  return new Promise((resolve) => {
    const resolveUnavailable = (errorMessage, errorStage = "Page Load") => {
      finish({ status: "Unavailable", errorStage, errorMessage }).then(resolve);
    };

    onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete" || settled) return;

      chrome.tabs.sendMessage(tabId, { type: "healthCheck", platform, requestId }, (response) => {
        if (chrome.runtime.lastError) {
          resolveUnavailable(chrome.runtime.lastError.message, "Extension Pipeline");
          return;
        }
        finish(response?.platform === platform ? response : {
          status: "Unavailable",
          errorStage: "Extension Pipeline",
          errorMessage: "The platform content script did not return a health result.",
        }).then(resolve);
      });
    };

    onError = (failedTabId, details) => {
      if (failedTabId === tabId) {
        resolveUnavailable(details?.error || "The platform test page could not be loaded.");
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onErrorOccurred.addListener(onError);
    timeoutId = setTimeout(() => {
      resolveUnavailable("Health check timed out.", "Health Check Timeout");
    }, HEALTH_CHECK_TIMEOUT_MS);

    chrome.tabs.create({ url: testUrl, active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        resolveUnavailable(chrome.runtime.lastError?.message || "The test tab could not be opened.");
        return;
      }
      tabId = tab.id;
    });
  });
}

const VALID_PLATFORMS = new Set(["shopee", "lazada", "google", "googleplay", "steam"]);

// ── User Activity report helper (fire-and-forget) ────────────────────────────
// Reports regular user platform usage ("Used") using stored Auth session.
async function reportUserActivityToBackend(platform, productTitle = "", productUrl = "") {
  if (!platform || platform === "unknown") return;
  const platformKey = String(platform).trim().toLowerCase();
  if (!VALID_PLATFORMS.has(platformKey)) return;

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
              platform: platformKey,
              activity_type: "Used",
              product_title: productTitle || "",
              product_url: productUrl || "",
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
  if (typeof chrome !== "undefined" && chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Explicit browser health test ──────────────────────────────────────────
  if (message?.type === "healthCheck") {
    const platform = String(message.platform || "").toLowerCase();
    if (!VALID_PLATFORMS.has(platform)) {
      sendResponse({ ok: false, platform, status: "Unavailable", errorMessage: "Invalid platform." });
      return;
    }
    runHealthCheck(platform, message.requestId || `${platform}-${Date.now()}`)
      .then(sendResponse)
      .catch((error) => sendResponse({
        ok: false,
        platform,
        status: "Error",
        errorStage: "Health Check",
        errorMessage: error.message || "Health check failed.",
      }));
    return true;
  }

  // ── pageDetected / productDetected (Decoupled Activity Reporting) ─────────
  // Fired ONLY when the content script on an active tab confirms a supported platform page
  if (message?.type === "pageDetected" || message?.type === "productDetected") {
    const { platform, isProductPage = true, productTitle = "", productUrl = "" } = message;
    const pageUrl = productUrl || sender.tab?.url || "";
    if (isProductPage && platform && VALID_PLATFORMS.has(String(platform).toLowerCase())) {
      reportUserActivityToBackend(platform, productTitle, pageUrl);
    }
    sendResponse({ ok: true });
    return;
  }

  // ── reviewsScraped ──────────────────────────────────────────────────────────
  if (message?.type === "reviewsScraped") {
    console.log("[BACKGROUND] reviewsScraped received:", {
      platform: message.platform,
      reviewCount: Array.isArray(message.reviews) ? message.reviews.length : 0,
      tabId: sender.tab?.id ?? null,
    });
    const {
      platform,
      productTitle = "",
      productImage = null,
      rating = null,
      category = null,
      reviews = [],
      url = "",
      ratingFilter = "all",
      forceRefresh = false,
    } = message;

    if (!platform || !VALID_PLATFORMS.has(String(platform).toLowerCase())) {
      sendResponse({ ok: false, error: "Invalid platform" });
      return;
    }

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

    // ── Immediate Health Report Dispatch ───────────────────────────────────────
    if (isProductPage) {
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
      const productChanged = forceRefresh || isDifferentProduct || isDifferentUrl || isDifferentFilter || !currentScrape.sessionId;

      let finalReviews = reviews; // always replace on filter/product change
      const sessionId = Date.now();

      if (productChanged) {
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
        console.log("[BACKGROUND] storage updated:", { platform, reviewCount: finalReviews.length, tabId: scrapeData.tabId });
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

    if (!session || !session.user || !session.token) {
      chrome.storage.local.remove(["voxreview_auth_session"]).catch((err) =>
        console.error("Failed to clear auth session:", err)
      );
      sendResponse({ ok: true });
      return;
    }

    chrome.storage.local.set({
      voxreview_auth_session: session,
    }).catch((err) => console.error("Failed to store auth session:", err));

    sendResponse({ ok: true });
  }

  // ── rescanPage ──────────────────────────────────────────────────────────────
  if (message?.type === "rescanPage") {
    const scraperFileByPlatform = {
      shopee: "scraper/platforms/shopee.js",
      lazada: "scraper/platforms/lazada.js",
      google: "scraper/platforms/google.js",
      googleplay: "scraper/platforms/googlePlay.js",
      steam: "scraper/platforms/steam.js",
    };

    const recoverContentScript = async (tabId) => {
      if (!chrome.scripting?.executeScript) {
        throw new Error("Content script is unavailable and scripting recovery is not supported.");
      }

      const platform = String(message.platform || "").toLowerCase();
      const scraperFile = scraperFileByPlatform[platform];
      if (!scraperFile) throw new Error("No scraper is configured for the current platform.");

      let hasScraper = false;
      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => typeof scrapeReviews === "function",
        });
        hasScraper = result?.[0]?.result === true;
      } catch (error) {
        console.warn("VoxReview: Could not inspect content-script state:", error.message);
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        files: hasScraper
          ? ["content.js"]
          : ["scraper/detector.js", scraperFile, "scraper/scraperManager.js", "content.js"],
      });
    };

    const forwardToTab = (tabId) => {
      console.log("[RESCAN] forwarding to tab:", { tabId, url: message.url, platform: message.platform });
      chrome.tabs.sendMessage(tabId, { type: "rescanPage", url: message.url, platform: message.platform }, (response) => {
        if (chrome.runtime?.lastError) {
          const initialError = chrome.runtime.lastError.message;
          console.warn("VoxReview rescan delivery failed:", initialError);
          recoverContentScript(tabId)
            .then(() => new Promise((resolve, reject) => {
              chrome.tabs.sendMessage(tabId, { type: "rescanPage", url: message.url, platform: message.platform }, (retryResponse) => {
                if (chrome.runtime?.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(retryResponse || { ok: true, recovered: true });
              });
            }))
            .then(sendResponse)
            .catch((error) => sendResponse({ ok: false, reason: error.message || initialError }));
        } else {
          console.log("[RESCAN] content script reached:", { tabId });
          sendResponse(response || { ok: true });
        }
      });
    };

    if (message.tabId) {
      forwardToTab(message.tabId);
    } else {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs?.[0];
        if (!tab?.id) {
          chrome.tabs.query({ active: true, currentWindow: true }, (fallbackTabs) => {
            const fallbackTab = fallbackTabs?.[0];
            if (!fallbackTab?.id) {
              sendResponse({ ok: false, reason: "no active tab" });
              return;
            }
            forwardToTab(fallbackTab.id);
          });
          return;
        }
        forwardToTab(tab.id);
      });
    }
    return true; // keep channel open for async sendResponse
  }

  return true;
});