const officialAppOrigin = __VOXREVIEW_APP_ORIGIN__;
const USER_AUTH_STORAGE_KEY = "user_auth_session";
const EXTENSION_USER_AUTH_STORAGE_KEY = "voxreview_auth_session";
const LOGGED_OUT_AUTH_USERS_STORAGE_KEY = "voxreview_logged_out_auth_users";
const REFRESH_REQUEST_EVENT = "voxreview_auth_refresh_request";
const REFRESH_RESULT_EVENT = "voxreview_auth_refresh_result";
function markRefreshBridgeReady() {
  const root = window.document?.documentElement;
  if (!root) return false;
  root.dataset.voxreviewExtensionAuthBridge = "ready";
  return true;
}

if (!markRefreshBridgeReady() && window.document && window.MutationObserver) {
  const observer = new window.MutationObserver(() => {
    if (markRefreshBridgeReady()) observer.disconnect();
  });
  observer.observe(window.document, { childList: true });
}

function sessionExpiry(session) {
  if (Number.isFinite(Number(session?.expires_at))) return Number(session.expires_at);
  try {
    const encoded = (session?.token || session?.access_token || "").split(".")[1];
    if (!encoded) return 0;
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return Number(JSON.parse(atob(padded)).exp) || 0;
  } catch {
    return 0;
  }
}

function isStaleSession(candidate, current) {
  if (candidate?.user?.id !== current?.user?.id) return false;
  const candidateExpiry = sessionExpiry(candidate);
  const currentExpiry = sessionExpiry(current);
  return candidateExpiry < currentExpiry ||
    (candidateExpiry === currentExpiry &&
      (candidate.token || candidate.access_token) !== (current.token || current.access_token));
}

window.addEventListener("voxreview_auth_sync", async (event) => {
  if (window.location.origin !== officialAppOrigin || event.target !== window) return;

  const { action, userId } = event.detail || {};
  if (typeof userId !== "string" || !userId) return;

  try {
    if (action === "signed_out") {
      await chrome.runtime.sendMessage({ type: "websiteLogoutSync", userId });
      return;
    }

    if (action !== "session_updated") return;
    const rawSession = window.localStorage.getItem(USER_AUTH_STORAGE_KEY);
    const session = rawSession ? JSON.parse(rawSession) : null;
    if (
      session?.user?.id !== userId ||
      session.user.role !== "user" ||
      typeof session.token !== "string" ||
      typeof session.refresh_token !== "string"
    ) {
      return;
    }
    const logoutState = await chrome.storage.local.get([LOGGED_OUT_AUTH_USERS_STORAGE_KEY]);
    const loggedOutUserIds = Array.isArray(logoutState?.[LOGGED_OUT_AUTH_USERS_STORAGE_KEY])
      ? logoutState[LOGGED_OUT_AUTH_USERS_STORAGE_KEY]
      : [];
    if (loggedOutUserIds.includes(userId) && !event.detail?.clearLogoutMarker) {
      window.dispatchEvent(new CustomEvent("voxreview_extension_logout", {
        detail: { userId },
      }));
      return;
    }

    const stored = await chrome.storage.local.get([EXTENSION_USER_AUTH_STORAGE_KEY]);
    const currentSession = stored?.[EXTENSION_USER_AUTH_STORAGE_KEY];
    const currentUserId = currentSession?.user?.id;
    if (
      currentUserId &&
      currentUserId !== userId &&
      event.detail?.clearLogoutMarker !== true
    ) return;
    if (
      event.detail?.clearLogoutMarker !== true &&
      isStaleSession(session, currentSession)
    ) return;
    const persisted = await chrome.runtime.sendMessage({
      type: "persistAuthSession",
      session,
      allowUserReplacement: event.detail?.clearLogoutMarker === true,
    });
    if (!persisted?.ok || !persisted.persisted) return;
    if (event.detail?.clearLogoutMarker === true) {
      await chrome.runtime.sendMessage({ type: "websiteLoginSync", userId });
    }
  } catch (error) {
    console.warn("VoxReview: Could not synchronize website auth state.", {
      code: error?.code || null,
    });
  }
});

window.addEventListener(REFRESH_REQUEST_EVENT, async (event) => {
  const { requestId, userId, refreshToken } = event.detail || {};
  if (
    window.location.origin !== officialAppOrigin ||
    event.target !== window ||
    typeof requestId !== "string" ||
    typeof userId !== "string" ||
    !userId ||
    typeof refreshToken !== "string" ||
    !refreshToken
  ) return;

  let result;
  try {
    result = await chrome.runtime.sendMessage({
      type: "refreshAuthSession",
      userId,
      refreshToken,
    });
  } catch {
    result = {
      status: 503,
      body: { error: "temporarily_unavailable", message: "Session refresh is temporarily unavailable." },
    };
  }
  window.dispatchEvent(new CustomEvent(REFRESH_RESULT_EVENT, {
    detail: { requestId, result },
  }));
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    sender.id !== chrome.runtime.id ||
    message?.type !== "extensionLogoutSync" ||
    window.location.origin !== officialAppOrigin ||
    typeof message.userId !== "string" ||
    !message.userId
  ) {
    return;
  }

  window.dispatchEvent(new CustomEvent("voxreview_extension_logout", {
    detail: { userId: message.userId },
  }));
});
