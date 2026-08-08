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

    console.log("Received scrape:", {
      platform,
      productTitle,
      reviewsCount: reviews.length,
      url: pageUrl,
    });

    // Clear any unsupported-site flag for this tab since we now have valid data.
    chrome.storage.local.set({ voxreviewSiteStatus: { unsupported: false } });

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

      chrome.storage.local.set({
        voxreviewLastScrape: scrapeData,
      }).then(() => {
        console.log("Stored scrape data to chrome.storage.local:", scrapeData);
        chrome.storage.local.get(["voxreviewLastScrape"], (readBack) => {
          console.log("Read back from chrome.storage.local:", readBack.voxreviewLastScrape);
        });
      }).catch((err) => console.error("Failed to store scrape result:", err));
    });

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