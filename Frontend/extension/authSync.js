const officialAppOrigin = __VOXREVIEW_APP_ORIGIN__;
const USER_AUTH_STORAGE_KEY = "user_auth_session";
const EXTENSION_USER_AUTH_STORAGE_KEY = "voxreview_auth_session";
const LOGGED_OUT_AUTH_USERS_STORAGE_KEY = "voxreview_logged_out_auth_users";

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
    const currentUserId = stored?.[EXTENSION_USER_AUTH_STORAGE_KEY]?.user?.id;
    if (currentUserId && currentUserId !== userId) return;
    await chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: session });
    if (event.detail?.clearLogoutMarker === true) {
      await chrome.runtime.sendMessage({ type: "websiteLoginSync", userId });
    }
  } catch (error) {
    console.warn("VoxReview: Could not synchronize website auth state.", {
      code: error?.code || null,
    });
  }
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
