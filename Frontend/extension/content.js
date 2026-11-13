if (globalThis.__voxreviewContentScriptInitialized) {
  console.log("VoxReview content already initialized.");
} else {
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

function getProductImageMetadata(raw) {
  const safeImageUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value.trim(), document.baseURI);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };
  const metadataValue = (selector) => document.querySelector(selector)?.getAttribute("content") || "";
  const mediaType = String(raw?.productMediaType || "").toLowerCase();
  const openGraphType = metadataValue('meta[property="og:type"]').toLowerCase();
  const isExplicitVideo = mediaType === "video" || openGraphType.startsWith("video");
  if (isExplicitVideo) return { productImage: null, productMediaType: "video" };

  const candidateUrls = [
    raw?.productImage,
    metadataValue('meta[property="og:image"]'),
    metadataValue('meta[name="twitter:image"]'),
  ];
  const imageSelectors = [
    '[itemprop="image"]',
    'main img',
    '[role="main"] img',
    '[class*="product"] img',
    '[data-testid*="product"] img',
  ];
  for (const selector of imageSelectors) {
    for (const image of document.querySelectorAll(selector)) {
      const owner = image.closest?.('[class*="review"], [class*="avatar"], [class*="profile"], [class*="user"]');
      const identity = [
        image.getAttribute("alt"),
        image.getAttribute("class"),
        image.getAttribute("aria-label"),
        image.getAttribute("src"),
        owner?.getAttribute("class"),
      ].join(" ").toLowerCase();
      if (/(?:avatar|profile|reviewer|user[-_ ]?photo)/.test(identity)) continue;
      candidateUrls.push(
        image.currentSrc,
        image.getAttribute("src"),
        image.getAttribute("content"),
        image.getAttribute("data-src"),
        image.getAttribute("data-original"),
      );
    }
  }
  const productImage = candidateUrls.map(safeImageUrl).find(Boolean) || null;
  if (productImage) return { productImage, productMediaType: "image" };

  const hasVideo = document.querySelector("main video, [role='main'] video, meta[property='og:video']");
  return { productImage: null, productMediaType: hasVideo ? "video" : null };
}

function getCanonicalPageUrl(platform, pageUrl) {
  const parsedUrl = new URL(pageUrl, window.location.href);
  parsedUrl.hash = "";
  const retainedParams = new URLSearchParams();
  const normalizedPlatform = String(platform || "").toLowerCase();
  if (normalizedPlatform === "googleplay") {
    const appId = parsedUrl.searchParams.get("id");
    if (appId) retainedParams.set("id", appId);
  } else if (normalizedPlatform === "shopee" && !/\/(?:product\/\d+\/\d+|i\.\d+\.\d+)/i.test(parsedUrl.pathname)) {
    for (const key of ["itemid", "shopid"]) {
      const value = parsedUrl.searchParams.get(key);
      if (value) retainedParams.set(key, value);
    }
  } else if (normalizedPlatform === "lazada" && !/i\d+(?:-s\d+)?\.html/i.test(parsedUrl.pathname)) {
    const itemId = parsedUrl.searchParams.get("itemid");
    if (itemId) retainedParams.set("itemid", itemId);
  }
  parsedUrl.search = retainedParams.toString();
  return parsedUrl.href;
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
const USER_AUTH_STORAGE_KEY = "user_auth_session";
const EXTENSION_USER_AUTH_STORAGE_KEY = "voxreview_auth_session";
const LOGGED_OUT_AUTH_USERS_STORAGE_KEY = "voxreview_logged_out_auth_users";
const DEVELOPMENT_APP_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function dispatchGoogleOAuthSourceDiag(source, status, details = {}) {
  window.dispatchEvent(new CustomEvent("voxreview_google_oauth_source_diag", {
    detail: { source, status, ...details },
  }));
}

if (DEVELOPMENT_APP_ORIGINS.has(window.location.origin)) {
  window.addEventListener("voxreview_auth_sync", async (event) => {
    if (event.target !== window) return;
    const { action, userId } = event.detail || {};
    if (typeof userId !== "string" || !userId) return;

    try {
      if (action === "signed_out") {
        const stored = await chrome.storage.local.get([EXTENSION_USER_AUTH_STORAGE_KEY]);
        if (stored?.[EXTENSION_USER_AUTH_STORAGE_KEY]?.user?.id === userId) {
          await safeSendMessage({ type: "websiteLogoutSync", userId });
        }
        return;
      }

      if (action !== "session_updated") return;
      const rawSession = window.localStorage.getItem(USER_AUTH_STORAGE_KEY);
      const session = rawSession ? JSON.parse(rawSession) : null;
      if (
        session?.user?.id === userId &&
        session.user.role === "user" &&
        typeof session.token === "string" &&
        typeof session.refresh_token === "string"
      ) {
        const logoutState = await chrome.storage.local.get([LOGGED_OUT_AUTH_USERS_STORAGE_KEY]);
        const loggedOutUserIds = Array.isArray(logoutState?.[LOGGED_OUT_AUTH_USERS_STORAGE_KEY])
          ? logoutState[LOGGED_OUT_AUTH_USERS_STORAGE_KEY]
          : [];
        const logoutMarkerPresent = loggedOutUserIds.includes(userId);
        dispatchGoogleOAuthSourceDiag(
          "logout-marker",
          logoutMarkerPresent && !event.detail?.clearLogoutMarker
            ? "logout-marker-blocked"
            : "logout-marker-check",
          {
            logoutMarkerPresent,
            messageAccepted: logoutMarkerPresent && !event.detail?.clearLogoutMarker,
          },
        );
        if (logoutMarkerPresent && !event.detail?.clearLogoutMarker) {
          window.dispatchEvent(new CustomEvent("voxreview_extension_logout", {
            detail: { userId },
          }));
          return;
        }

        const stored = await chrome.storage.local.get([EXTENSION_USER_AUTH_STORAGE_KEY]);
        const currentUserId = stored?.[EXTENSION_USER_AUTH_STORAGE_KEY]?.user?.id;
        if (!currentUserId || currentUserId === userId) {
          const persisted = await safeSendMessage({
            type: "persistAuthSession",
            session,
            allowUserReplacement: event.detail?.clearLogoutMarker === true,
          });
          if (persisted?.ok && persisted.persisted && event.detail?.clearLogoutMarker === true) {
            await safeSendMessage({ type: "websiteLoginSync", userId });
          }
        }
      }
    } catch (error) {
      console.warn("VoxReview: Could not synchronize local website auth state.", {
        code: error?.code || null,
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (
      sender.id === chrome.runtime.id &&
      message?.type === "extensionLogoutSync" &&
      typeof message.userId === "string" &&
      message.userId
    ) {
      dispatchGoogleOAuthSourceDiag("extension-message", "sync-message", {
        messageAccepted: true,
      });
      window.dispatchEvent(new CustomEvent("voxreview_extension_logout", {
        detail: { userId: message.userId },
      }));
    }
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
      cards: ".apphub_Card",
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
    let errorStage = "Review Extraction";

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
      const reviewDiagnostics = Array.isArray(raw) ? null : (raw.reviewDiagnostics || null);
      const productImageMetadata = getProductImageMetadata(raw);
      const productUrl = getCanonicalPageUrl(
        platform,
        Array.isArray(raw) ? window.location.href : (raw.productUrl || window.location.href),
      );
      console.log("[SCRAPE] reviews returned:", reviews.length);
      console.info("[RESCAN] extraction counts:", {
        currentUrl: `${window.location.origin}${window.location.pathname}`,
        matchedPlatform: platform,
        layout: reviewDiagnostics?.layout ?? null,
        reviewCardsFound: reviewDiagnostics?.reviewCardsFound ?? null,
        nonEmptyReviewTexts: reviewDiagnostics?.nonEmptyReviewTexts ?? reviews.length,
        reviewsReturnedToPopup: reviews.length,
      });

      errorStage = "Privacy Sanitization";
      const sanitizeReviews = globalThis.__voxreviewPrivacyRedaction?.sanitizeReviewsForAnalysis;
      if (typeof sanitizeReviews !== "function") {
        throw new Error("Privacy filtering is unavailable; review data was withheld.");
      }
      let sanitizedReviews;
      try {
        sanitizedReviews = sanitizeReviews(reviews, platform).map((review) => (
          typeof review === "string"
            ? { text: review, platform }
            : { ...review, platform }
        ));
        if (!Array.isArray(sanitizedReviews)) {
          throw new Error("Privacy filtering returned an invalid result.");
        }
      } catch {
        throw new Error("Privacy filtering failed; review data was withheld.");
      }

      errorStage = "Review Payload Preparation";
      // Build a lightweight signature of the current visible state.
      // Only send a message to background when something actually changed.
      const reviewSignature = JSON.stringify(sanitizedReviews);
      const signature = `${productUrl}|${isProductPage}|${JSON.stringify(productImageMetadata)}|${reviewSignature}`;

      if (signature === lastSentSignature) {
        return; // DOM fired but nothing meaningful changed — skip
      }

      if (isProductPage && platform) {
        safeSendMessage({
          type: "pageDetected",
          platform: platform,
          isProductPage: isProductPage,
          productTitle: productTitle,
          productUrl: productUrl,
        });
      }
      if (["shopee", "lazada", "googleplay", "steam"].includes(platform)) {
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
        `VoxReview: Sending scrape — isProductPage:${isProductPage} ` +
        `reviews:${reviews.length} url:${productUrl.slice(-40)}`
      );

      errorStage = "Background Message Delivery";
      const response = await safeSendMessage({
        type: "reviewsScraped",
        forceRefresh: force,
        platform: platform,
        isProductPage: isProductPage,
        productTitle: productTitle,
        ...productImageMetadata,
        url: productUrl,
        reviews: sanitizedReviews,
        reviewDiagnostics,
        hasError: !Array.isArray(raw) && Boolean(raw.hasError),
        errorMessage: !Array.isArray(raw) ? raw.errorMessage || null : null,
        rescanRequestId,
      });
      if (!response || response.ok === false) {
        throw new Error("Scrape results could not be delivered to the extension service worker.");
      }
      lastSentSignature = signature;
      console.log("[SCRAPE] reviewsScraped handled:", {
        messageAccepted: response.ok !== false,
        extractionSucceeded: response?.extractionSucceeded ?? null,
        reviewCount: response?.reviewCount ?? reviews.length,
        reason: response?.reason || null,
      });

    } catch (err) {
      const reportedStage = err?.scrapeStage || errorStage;
      const errorName = typeof err?.name === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(err.name)
        ? err.name
        : "Error";
      const errorMessage = `Scrape failed during ${reportedStage} (${errorName}).`;
      console.error(
        "VoxReview scrapeAndSend error:",
        "platform:", platform,
        "errorStage:", reportedStage,
        "errorMessage:", errorMessage,
      );

      // Report the error to background.js for health tracking
      await safeSendMessage({
        type: "scrapeError",
        platform: platform,
        errorStage: reportedStage,
        errorMessage,
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
      return;
    }

  });
  globalThis.__voxreviewContentScriptInitialized = true;
}
}