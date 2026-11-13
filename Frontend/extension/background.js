import { HEALTH_TEST_URLS } from "./healthTestConfig.js";
import { createAnalysisJobCoordinator } from "../src/services/activeAnalysisState.js";
import { createActivityReporter } from "../src/services/activityReporter.js";
import { sanitizeReviewsForAnalysis } from "../src/services/privacyRedaction.js";
import { ensureLegacyReviewPrivacyMigration } from "../src/services/legacyReviewPrivacyMigration.js";
import { requestSvmBatch } from "../src/Users/utils/svmRequest.js";
import { detectRepeatedReviewText } from "../src/Users/utils/suspiciousReviewDetection.js";
import { supabaseAnonKey, supabaseUrl } from "../src/lib/supabase.js";
import { isNewerAuthSession } from "../src/lib/extensionAuthStorage.js";
import { createAuthRefreshCoordinator } from "./authRefreshCoordinator.js";
import { revokePendingAuthSessions } from "./authSessionRevocation.js";
import { removeMatchingWebsiteLogoutSession } from "./websiteLogoutSync.js";
import {
  createTopicAnalysisRequestCoordinator,
  createTopicRequestTimeout,
  requestTopicAnalysis,
} from "../src/Users/utils/topicAnalysisRequest.js";
import { filterSubstantiveReviews } from "../src/Users/utils/reviewTopics.js";
import { resolveScrapeReviews } from "./scrapeStorage.js";
import { API_BASE_URL } from "../src/services/apiConfig.js";

const topicRequests = createTopicAnalysisRequestCoordinator({
  request: async (reviews, platform, {
    signal,
    requestContext,
    clientRequestId,
    pageKey,
    force,
    operation,
  }) => {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(signal.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    else signal?.addEventListener("abort", forwardAbort, { once: true });
    const timeout = createTopicRequestTimeout(controller, reviews.length);
    try {
      return await requestTopicAnalysis(reviews, platform, {
        signal: controller.signal,
        requestContext,
        clientRequestId,
        pageKey,
        force,
        operation,
      });
    } finally {
      timeout.clear();
      signal?.removeEventListener("abort", forwardAbort);
    }
  },
});
const analysisJobs = createAnalysisJobCoordinator({
  requestSvm: (reviews, platform, signal) => requestSvmBatch(reviews, { platform, signal }),
  suspiciousReviewDetector: detectRepeatedReviewText,
  requestTopics: (reviews, platform, signal, context = {}) => topicRequests.request(
    reviews,
    platform,
    { ...context, signal },
  ),
  topicsEnabled: import.meta.env?.VITE_ENABLE_TOPIC_ANALYSIS !== "false",
  onCompleted: (analysis) => activityReporter.reportAnalysisCompletion(analysis),
});
void analysisJobs.resume();

// ── Config ───────────────────────────────────────────────────────────────────
const BACKEND_URLS = [API_BASE_URL];
const PLATFORM_AVAILABILITY_TIMEOUT_MS = 15_000;
const HEALTH_CHECK_TIMEOUT_MS = 45_000;
const activeHealthChecks = new Set();
const EXTENSION_USER_AUTH_STORAGE_KEY = "voxreview_auth_session";
const PENDING_AUTH_LOGOUTS_STORAGE_KEY = "voxreview_pending_auth_logouts";
const LOGGED_OUT_AUTH_USERS_STORAGE_KEY = "voxreview_logged_out_auth_users";
const AUTH_LOGOUT_RETRY_ALARM = "voxreview-auth-logout-retry";
let pendingAuthLogoutTask = null;
const authRefreshCoordinator = createAuthRefreshCoordinator({
  getSession: async () => {
    const stored = await chrome.storage.local.get([EXTENSION_USER_AUTH_STORAGE_KEY]);
    return stored?.[EXTENSION_USER_AUTH_STORAGE_KEY] || null;
  },
  setSession: async (candidate) => {
    const stored = await chrome.storage.local.get([EXTENSION_USER_AUTH_STORAGE_KEY]);
    const current = stored?.[EXTENSION_USER_AUTH_STORAGE_KEY] || null;
    if (!isNewerAuthSession(candidate, current)) return;
    await chrome.storage.local.set({
      [EXTENSION_USER_AUTH_STORAGE_KEY]: candidate,
    });
  },
  removeSession: async () => {
    await chrome.storage.local.remove([EXTENSION_USER_AUTH_STORAGE_KEY]);
  },
  supabaseUrl,
  anonKey: supabaseAnonKey,
});

function isSupportedAppOrigin(origin) {
  return origin === __VOXREVIEW_APP_ORIGIN__
    || origin === "http://localhost:5173"
    || origin === "http://127.0.0.1:5173";
}

function getSenderOrigin(sender) {
  try {
    return sender.tab?.url ? new URL(sender.tab.url).origin : null;
  } catch {
    return null;
  }
}

function isExtensionPageSender(sender) {
  return sender.id === chrome.runtime.id &&
    !sender.tab &&
    typeof sender.url === "string" &&
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

function isTrustedAuthSessionSender(sender) {
  return sender.id === chrome.runtime.id &&
    (isExtensionPageSender(sender) || isSupportedAppOrigin(getSenderOrigin(sender)));
}

function sanitizeProductImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function markAuthUserLoggedOut(userId) {
  const stored = await chrome.storage.local.get([LOGGED_OUT_AUTH_USERS_STORAGE_KEY]);
  const userIds = Array.isArray(stored?.[LOGGED_OUT_AUTH_USERS_STORAGE_KEY])
    ? stored[LOGGED_OUT_AUTH_USERS_STORAGE_KEY]
    : [];
  await chrome.storage.local.set({
    [LOGGED_OUT_AUTH_USERS_STORAGE_KEY]: [...new Set([...userIds, userId])],
  });
}

async function clearAuthUserLoggedOut(userId) {
  const stored = await chrome.storage.local.get([LOGGED_OUT_AUTH_USERS_STORAGE_KEY]);
  const userIds = Array.isArray(stored?.[LOGGED_OUT_AUTH_USERS_STORAGE_KEY])
    ? stored[LOGGED_OUT_AUTH_USERS_STORAGE_KEY]
    : [];
  await chrome.storage.local.set({
    [LOGGED_OUT_AUTH_USERS_STORAGE_KEY]: userIds.filter((storedUserId) => storedUserId !== userId),
  });
}

async function queueAuthLogout(session) {
  if (!session?.user?.id || !session.token) return;
  const stored = await chrome.storage.local.get([PENDING_AUTH_LOGOUTS_STORAGE_KEY]);
  const pending = Array.isArray(stored?.[PENDING_AUTH_LOGOUTS_STORAGE_KEY])
    ? stored[PENDING_AUTH_LOGOUTS_STORAGE_KEY]
    : [];
  const next = pending.filter((entry) => entry.userId !== session.user.id);
  next.push({
    userId: session.user.id,
    token: session.token,
    refresh_token: session.refresh_token || null,
  });
  await chrome.storage.local.set({ [PENDING_AUTH_LOGOUTS_STORAGE_KEY]: next });
}

function processPendingAuthLogouts() {
  if (pendingAuthLogoutTask) return pendingAuthLogoutTask;
  pendingAuthLogoutTask = (async () => {
    const stored = await chrome.storage.local.get([PENDING_AUTH_LOGOUTS_STORAGE_KEY]);
    const pending = Array.isArray(stored?.[PENDING_AUTH_LOGOUTS_STORAGE_KEY])
      ? stored[PENDING_AUTH_LOGOUTS_STORAGE_KEY]
      : [];
    if (!pending.length) return;

    const result = await revokePendingAuthSessions({
      sessions: pending,
      supabaseUrl,
      anonKey: supabaseAnonKey,
    });
    const settledUserIds = new Set(result.revokedUserIds);
    const current = await chrome.storage.local.get([PENDING_AUTH_LOGOUTS_STORAGE_KEY]);
    const latest = Array.isArray(current?.[PENDING_AUTH_LOGOUTS_STORAGE_KEY])
      ? current[PENDING_AUTH_LOGOUTS_STORAGE_KEY]
      : [];
    const latestByUserId = new Map(latest.map((entry) => [entry.userId, entry]));
    for (const entry of result.remaining) {
      latestByUserId.set(entry.userId, entry);
    }
    for (const userId of settledUserIds) {
      latestByUserId.delete(userId);
    }
    await chrome.storage.local.set({
      [PENDING_AUTH_LOGOUTS_STORAGE_KEY]: [...latestByUserId.values()],
    });
  })().catch((error) => {
    console.warn("VoxReview: Could not process pending provider sign-outs; retaining them for retry.", {
      code: error?.code || null,
    });
  }).finally(() => {
    pendingAuthLogoutTask = null;
  });
  return pendingAuthLogoutTask;
}

chrome.alarms?.create(AUTH_LOGOUT_RETRY_ALARM, { periodInMinutes: 1 });
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTH_LOGOUT_RETRY_ALARM) {
    void processPendingAuthLogouts();
  }
});
void processPendingAuthLogouts();

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

const VALID_PLATFORMS = new Set(["shopee", "lazada", "googleplay", "steam"]);

// ── Platform Active Check ─────────────────────────────────────────────────────
// Queries the backend health status API to determine whether a platform is
// enabled (is_active). Returns false if the platform is disabled by the Super
// Admin, allowing callers to gate scraping/analysis accordingly.
async function checkPlatformActive(platformKey) {
  const key = String(platformKey || "").trim().toLowerCase();
  if (!VALID_PLATFORMS.has(key)) throw new Error("This platform is currently unavailable.");
  for (const baseUrl of BACKEND_URLS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PLATFORM_AVAILABILITY_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/api/health/status`, { signal: controller.signal });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.success && Array.isArray(data.platforms)) {
        const entry = data.platforms.find((p) => p.platform === key);
        if (!entry || typeof entry.is_active !== "boolean") continue;
        return entry.is_active;
      }
    } catch { /* try next URL */ }
    finally { clearTimeout(timeoutId); }
  }
  throw new Error("Platform availability could not be verified. Please try again.");
}

// ── User Activity report helper (fire-and-forget) ────────────────────────────
// Reports regular user platform usage ("Used") using stored Auth session.
async function reportUserActivityToBackend(platform, productTitle = "", productUrl = "", activityType = "Used", analysisRunId = null) {
  if (!platform || platform === "unknown") return;
  const platformKey = String(platform).trim().toLowerCase();
  if (!VALID_PLATFORMS.has(platformKey)) return false;

  return new Promise((resolve) => {
    chrome.storage.local.get(["voxreview_auth_session"], async (res) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      const session = res.voxreview_auth_session;
      const token = session?.token;
      if (!token) {
        resolve(false);
        return;
      }

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
              activity_type: activityType,
              product_title: productTitle || "",
              product_url: productUrl || "",
              ...(analysisRunId ? { analysis_run_id: analysisRunId } : {}),
            }),
          });
          if (resp.ok) {
            resolve(true);
            return;
          }
        } catch (err) {
          // Try next URL fallback
        }
      }
      resolve(false);
    });
  }).catch((err) => {
    console.warn("VoxReview: User activity report notice:", err.message);
    return false;
  });
}

const activityReporter = createActivityReporter({
  postActivity: (payload) => reportUserActivityToBackend(
    payload.platform,
    payload.product_title,
    payload.product_url,
    payload.activity_type,
    payload.analysis_run_id,
  ),
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("VoxReview installed");
  if (typeof chrome !== "undefined" && chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "persistAuthSession") {
    if (
      !isTrustedAuthSessionSender(sender) ||
      !message.session?.user?.id ||
      !(message.session.access_token || message.session.token) ||
      !message.session.refresh_token
    ) {
      sendResponse({ ok: false });
      return;
    }

    authRefreshCoordinator.persistSession(message.session, {
      allowUserReplacement: message.allowUserReplacement === true,
    }).then((persisted) => {
      sendResponse({ ok: true, persisted });
    }).catch((error) => {
      console.warn("VoxReview: Could not persist the latest authentication session.", {
        code: error?.code || null,
      });
      sendResponse({ ok: false });
    });
    return true;
  }

  if (message?.type === "clearAuthSession") {
    if (
      !isExtensionPageSender(sender) ||
      typeof message.userId !== "string" ||
      !message.userId
    ) {
      sendResponse({ ok: false });
      return;
    }

    authRefreshCoordinator.clearSession({
      userId: message.userId,
    }).then((cleared) => {
      sendResponse({ ok: cleared });
    }).catch((error) => {
      console.warn("VoxReview: Could not clear the matching authentication session.", {
        code: error?.code || null,
      });
      sendResponse({ ok: false });
    });
    return true;
  }

  if (message?.type === "refreshAuthSession") {
    const senderOrigin = getSenderOrigin(sender);
    const extensionPage = isExtensionPageSender(sender);
    if (
      sender.id !== chrome.runtime.id ||
      (!extensionPage && !isSupportedAppOrigin(senderOrigin)) ||
      typeof message.userId !== "string" ||
      !message.userId ||
      typeof message.refreshToken !== "string" ||
      !message.refreshToken
    ) {
      sendResponse({
        status: 403,
        body: { error: "refresh_request_rejected", message: "Session refresh request was rejected." },
      });
      return;
    }

    authRefreshCoordinator.refresh({
      userId: message.userId,
      refreshToken: message.refreshToken,
    }).then(sendResponse).catch((error) => {
      console.warn("VoxReview: Coordinated session refresh failed.", {
        code: error?.code || null,
      });
      sendResponse({
        status: 503,
        body: { error: "temporarily_unavailable", message: "Session refresh is temporarily unavailable." },
      });
    });
    return true;
  }

  if (message?.type === "ensureLegacyReviewPrivacyMigration") {
    ensureLegacyReviewPrivacyMigration().then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false, error: "Stored review data could not be safely privacy-migrated." }),
    );
    return true;
  }

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

  if (message?.type === "startAnalysis") {
    const analysisPlatform = String(message.analysis?.platform || "").trim().toLowerCase();
    const reviews = filterSubstantiveReviews(message.analysis?.reviews);
    if (reviews.length === 0) {
      sendResponse({ ok: false, error: "No usable review text was available for analysis." });
      return;
    }
    checkPlatformActive(analysisPlatform).then((active) => {
      if (!active) {
        sendResponse({
          ok: false,
          error: "This platform is currently unavailable.",
        });
        return;
      }
      analysisJobs.start({ ...message.analysis, reviews }).then(sendResponse).catch((error) => sendResponse({
        ok: false,
        error: error?.message || "Analysis could not be started.",
      }));
    }).catch((error) => sendResponse({
      ok: false,
      error: error?.message || "Analysis could not be started.",
    }));
    return true;
  }

  if (message?.type === "cancelAnalysis") {
    const pageKey = typeof message.pageKey === "string" ? message.pageKey : "";
    if (!pageKey) {
      sendResponse({ ok: false, error: "A page key is required to cancel analysis." });
      return;
    }
    analysisJobs.cancel(pageKey).then(
      (cancelled) => sendResponse({ ok: true, cancelled }),
      (error) => sendResponse({ ok: false, error: error?.message || "Analysis could not be cancelled." }),
    );
    return true;
  }

  if (message?.type === "requestTopicAnalysis") {
    const { platform, pageKey, requestContext, force, operation } = message.request || {};
    const reviews = filterSubstantiveReviews(message.request?.reviews);
    if (reviews.length === 0) {
      sendResponse({ ok: false, error: "No usable review text was available for topic analysis." });
      return;
    }
    topicRequests.request(reviews, platform, {
      pageKey,
      requestContext: requestContext || "popup-request",
      force: Boolean(force),
      operation: operation || "classify",
    }).then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({
        ok: false,
        error: error?.message || "Topic analysis failed.",
        httpStatus: error?.httpStatus ?? null,
        code: error?.code || null,
      }),
    );
    return true;
  }

  // ── pageDetected / productDetected (Decoupled Activity Reporting) ─────────
  // Fired ONLY when the content script on an active tab confirms a supported platform page
  if (message?.type === "pageDetected" || message?.type === "productDetected") {
    const { platform, isProductPage = true, productTitle = "", productUrl = "" } = message;
    const pageUrl = productUrl || sender.tab?.url || "";
    if (isProductPage && platform && VALID_PLATFORMS.has(String(platform).toLowerCase())) {
      void activityReporter.reportPageDetection({ platform, productTitle, productUrl: pageUrl });
    }
    sendResponse({ ok: true });
    return;
  }

  // ── reviewsScraped ──────────────────────────────────────────────────────────
  if (message?.type === "reviewsScraped") {
    console.log("[BACKGROUND] reviewsScraped received:", {
      platform: message.platform,
      reviewCount: Array.isArray(message.reviews) ? message.reviews.length : 0,
      reviewDiagnostics: message.reviewDiagnostics || null,
      tabId: sender.tab?.id ?? null,
    });
    const {
      platform,
      productTitle = "",
      reviews: scrapedReviews = [],
      url = "",
      forceRefresh = false,
      hasError = false,
      errorMessage = null,
      reviewDiagnostics = null,
    } = message;
    const productImage = sanitizeProductImageUrl(message.productImage);
    const productMediaType = ["image", "video"].includes(message.productMediaType)
      ? message.productMediaType
      : null;
    const reviews = sanitizeReviewsForAnalysis(
      filterSubstantiveReviews(scrapedReviews),
      platform,
    );

    if (!platform || !VALID_PLATFORMS.has(String(platform).toLowerCase())) {
      sendResponse({ ok: false, error: "Invalid platform" });
      return;
    }

    const scrapePageUrl = url || sender.tab?.url || "";
    const isProductPage = message.isProductPage ?? true;

    console.log("Received scrape:", {
      platform,
      productTitle,
      reviewsCount: reviews.length,
      url: scrapePageUrl,
    });

    // Clear any unsupported-site flag for this tab since we now have valid data.
    chrome.storage.local.set({ voxreviewSiteStatus: { unsupported: false } });

    // ── Immediate Health Report Dispatch ───────────────────────────────────────
    if (isProductPage) {
      if (hasError) {
        reportHealthToBackend({
          platform,
          status: "Error",
          lastSuccessfulStage: "Page Detection",
          errorStage: "Review Extraction",
          errorMessage: errorMessage || "Steam review extraction failed.",
        });
      } else if (reviews.length > 0) {
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

    void ensureLegacyReviewPrivacyMigration().then(() => new Promise((resolve, reject) => {
      chrome.storage.local.get(["voxreviewLastScrape"], (result) => {
        if (chrome.runtime.lastError) reject(new Error("Stored review data could not be safely privacy-migrated."));
        else resolve(result || {});
      });
    })).then((result) => {
      const currentScrape = result.voxreviewLastScrape || {};
      const finalReviews = sanitizeReviewsForAnalysis(resolveScrapeReviews({
        currentScrape,
        incomingReviews: reviews,
        productTitle,
        pageUrl: scrapePageUrl,
        ratingFilter: "all",
        forceRefresh,
      }), platform);
      const scrapeData = {
        sessionId: Date.now(),
        platform,
        isProductPage: message.isProductPage ?? true,
        productTitle,
        productImage,
        productMediaType,
        reviews: finalReviews,
        reviewCount: finalReviews.length,
        uniqueReviewCount: finalReviews.length,
        extractedReviewCount: scrapedReviews.length,
        reviewDiagnostics,
        hasError,
        errorMessage,
        url: scrapePageUrl,
        rescanRequestId: message.rescanRequestId || null,
        timestamp: Date.now(),
        tabId: sender.tab?.id ?? null,
      };

      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ voxreviewLastScrape: scrapeData }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error("Scrape data could not be safely stored."));
            return;
          }
          resolve();
        });
      });
    }).then(() => {
      console.log("[BACKGROUND] scrape data stored:", {
        platform,
        reviewCount: reviews.length,
        extractionSucceeded: !hasError && reviews.length > 0,
        reason: hasError ? errorMessage : reviews.length === 0 ? "No reviews were extracted." : null,
        tabId: sender.tab?.id ?? null,
      });
      sendResponse({
        ok: true,
        extractionSucceeded: !hasError && reviews.length > 0,
        reviewCount: reviews.length,
        reason: hasError ? errorMessage : reviews.length === 0 ? "No reviews were extracted." : null,
      });
    }).catch(() => {
      sendResponse({ ok: false, error: "Stored review data could not be safely privacy-migrated." });
    });

    return true;
  }

  // ── scrapeError ─────────────────────────────────────────────────────────────
  // Content script sends this when scrapeAndSend() catches a runtime exception.
  if (message?.type === "scrapeError") {
    const { platform, errorStage, errorMessage } = message;
    const safePlatform = typeof platform === "string" && /^[a-z0-9_-]{1,32}$/i.test(platform)
      ? platform
      : "unknown";
    const safeErrorStage = typeof errorStage === "string" && /^[A-Za-z ]{1,48}$/.test(errorStage)
      ? errorStage
      : "Review Extraction";
    const safeErrorMessage = typeof errorMessage === "string" &&
      /^Scrape failed during [A-Za-z ]{1,48} \([A-Za-z][A-Za-z0-9]*\)\.$/.test(errorMessage)
      ? errorMessage
      : "An error occurred during scraping.";
    console.error(
      "VoxReview: Scrape error reported",
      "platform:", safePlatform,
      "errorStage:", safeErrorStage,
      "errorMessage:", safeErrorMessage,
    );

    if (safePlatform !== "unknown") {
      reportHealthToBackend({
        platform: safePlatform,
        status: "Error",
        lastSuccessfulStage: null,
        errorStage: safeErrorStage,
        errorMessage: safeErrorMessage,
      });

      void ensureLegacyReviewPrivacyMigration().then(() => new Promise((resolve, reject) => {
        chrome.storage.local.set({
          voxreviewLastScrape: {
          platform: safePlatform,
          isProductPage: true,
          hasError: true,
          errorStage: safeErrorStage,
          errorMessage: safeErrorMessage,
          reviews: [],
          reviewCount: 0,
          url: sender.tab?.url || "",
          tabId: sender.tab?.id ?? null,
          rescanRequestId: message.rescanRequestId || null,
          timestamp: Date.now(),
          },
        }, () => {
          if (chrome.runtime.lastError) reject(new Error("Scrape error state could not be safely stored."));
          else resolve();
        });
      })).then(() => sendResponse({ ok: true })).catch(() => {
        sendResponse({ ok: false, error: "Stored review data could not be safely privacy-migrated." });
      });
      return true;
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

  if (message?.type === "websiteLogoutSync") {
    const senderOrigin = getSenderOrigin(sender);
    const userId = message.userId;
    if (
      sender.id !== chrome.runtime.id ||
      !isSupportedAppOrigin(senderOrigin) ||
      typeof userId !== "string" ||
      !userId
    ) {
      sendResponse({ ok: false });
      return;
    }

    removeMatchingWebsiteLogoutSession({
      storage: chrome.storage.local,
      userId,
      markAuthUserLoggedOut,
      clearSession: authRefreshCoordinator.clearSession,
    })
      .then((matchedSession) => {
        sendResponse({ ok: matchedSession });
      })
      .catch((error) => {
        console.warn("Could not queue website sign-out for provider revocation:", {
          code: error?.code || null,
        });
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message?.type === "websiteLoginSync") {
    const senderOrigin = getSenderOrigin(sender);
    const userId = message.userId;
    if (
      sender.id !== chrome.runtime.id ||
      !isSupportedAppOrigin(senderOrigin) ||
      typeof userId !== "string" ||
      !userId
    ) {
      sendResponse({ ok: false });
      return;
    }

    chrome.storage.local.get([EXTENSION_USER_AUTH_STORAGE_KEY])
      .then(async (result) => {
        if (result?.[EXTENSION_USER_AUTH_STORAGE_KEY]?.user?.id !== userId) return false;
        await clearAuthUserLoggedOut(userId);
        return true;
      })
      .then((matchedSession) => sendResponse({ ok: Boolean(matchedSession) }))
      .catch((error) => {
        console.warn("VoxReview: Could not clear the matching sign-out marker.", {
          code: error?.code || null,
        });
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message?.type === "extensionLogoutSync") {
    const userId = message.userId;
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      typeof userId !== "string" ||
      !userId
    ) {
      sendResponse({ ok: false });
      return;
    }

    markAuthUserLoggedOut(userId)
      .then(() => {
        return Promise.all([
          chrome.tabs.query({ url: `${__VOXREVIEW_APP_ORIGIN__}/*` }),
          chrome.tabs.query({ url: "http://localhost:5173/*" }),
          chrome.tabs.query({ url: "http://127.0.0.1:5173/*" }),
        ]);
      })
      .then((tabGroups) => [...new Map(
        tabGroups.flat().filter((tab) => Number.isInteger(tab.id)).map((tab) => [tab.id, tab]),
      ).values()])
      .then((tabs) => Promise.allSettled(
        tabs
          .map((tab) => chrome.tabs.sendMessage(tab.id, {
            type: "extensionLogoutSync",
            userId,
          })),
      ))
      .then((results) => sendResponse({
        ok: true,
        notifiedTabs: results.filter((result) => result.status === "fulfilled").length,
      }))
      .catch((error) => {
        console.warn("Could not synchronize extension logout to the website:", error);
        sendResponse({ ok: false });
      });
    return true;
  }

  // ── rescanPage ──────────────────────────────────────────────────────────────
  if (message?.type === "rescanPage") {
    const scraperFileByPlatform = {
      shopee: "scraper/platforms/shopee.js",
      lazada: "scraper/platforms/lazada.js",
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

      const inspectContentScript = async () => {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          args: [platform],
          func: (requestedPlatform) => {
            const platformScrapers = {
              shopee: typeof scrapeShopeeReviews === "function",
              lazada: typeof scrapeLazadaReviews === "function",
              googleplay: typeof scrapeGooglePlayReviews === "function",
              steam: typeof scrapeSteamReviews === "function",
            };
            return {
              initialized: globalThis.__voxreviewContentScriptInitialized === true,
              detectorReady: typeof detectPlatform === "function",
              helpfulnessReady: typeof globalThis.__voxreviewHelpfulness === "object",
              platformScraperReady: platformScrapers[requestedPlatform] === true,
              scraperManagerReady: typeof scrapeReviews === "function",
              privacyRedactionReady: typeof globalThis.__voxreviewPrivacyRedaction === "object",
            };
          },
        });
        const state = results?.[0]?.result;
        if (!state || typeof state !== "object") {
          throw new Error("The content-script state could not be inspected.");
        }
        return state;
      };

      const state = await inspectContentScript();
      const files = [];
      if (!state.detectorReady) files.push("scraper/detector.js");
      if (!state.helpfulnessReady) files.push("scraper/helpfulness.js");
      if (!state.platformScraperReady) files.push(scraperFile);
      if (!state.scraperManagerReady) files.push("scraper/scraperManager.js");
      if (!state.privacyRedactionReady) files.push("privacyRedaction.js");
      if (!state.initialized) files.push("content.js");

      if (files.length === 0) {
        throw new Error(
          "The content script is initialized but did not acknowledge RESCAN. Reload the page and retry.",
        );
      }

      await chrome.scripting.executeScript({ target: { tabId }, files });

      const recoveredState = await inspectContentScript();
      if (
        recoveredState.initialized !== true ||
        recoveredState.platformScraperReady !== true ||
        recoveredState.scraperManagerReady !== true
      ) {
        throw new Error("The platform content script could not be initialized in the active tab.");
      }
    };

    const sendRescan = (tabId) => new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          type: "rescanPage",
          url: message.url,
          platform: message.platform,
          requestId: message.requestId,
        },
        (response) => {
          const deliveryError = chrome.runtime?.lastError?.message;
          if (deliveryError) {
            reject(new Error(deliveryError));
          } else if (response?.ok !== true) {
            reject(new Error(response?.reason || "The content script did not acknowledge RESCAN."));
          } else {
            resolve(response);
          }
        },
      );
    });

    const forwardToTab = async (tabId) => {
      console.log("[RESCAN] forwarding to tab:", { tabId, url: message.url, platform: message.platform });
      try {
        let response;
        try {
          response = await sendRescan(tabId);
        } catch (initialError) {
          console.warn("VoxReview RESCAN delivery failed:", initialError.message);
          await recoverContentScript(tabId);
          response = await sendRescan(tabId);
        }
        console.log("[RESCAN] content script acknowledged:", { tabId });
        sendResponse(response);
      } catch (error) {
        const reason = error?.message || "The content script could not receive RESCAN.";
        console.warn("VoxReview RESCAN could not be delivered:", { tabId, reason });
        sendResponse({ ok: false, reason });
      }
    };

    if (Number.isInteger(message.tabId)) {
      void forwardToTab(message.tabId);
    } else {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs?.[0];
        if (!Number.isInteger(tab?.id)) {
          chrome.tabs.query({ active: true, currentWindow: true }, (fallbackTabs) => {
            const fallbackTab = fallbackTabs?.[0];
            if (!Number.isInteger(fallbackTab?.id)) {
              sendResponse({ ok: false, reason: "No active browser tab was found for RESCAN." });
              return;
            }
            void forwardToTab(fallbackTab.id);
          });
          return;
        }
        void forwardToTab(tab.id);
      });
    }
    return true; // keep channel open for async sendResponse
  }

  return true;
});