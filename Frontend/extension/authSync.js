const officialAppOrigin = __VOXREVIEW_APP_ORIGIN__;

window.addEventListener("voxreview_auth_sync", (event) => {
  if (window.location.origin !== officialAppOrigin || event.target !== window) return;

  const session = event.detail;
  const regularUserSession = session?.user?.role === "user"
    && session?.user
    && session?.token
    ? session
    : null;

  chrome.runtime.sendMessage({
    type: "userAuthSync",
    session: regularUserSession,
  }).catch((error) => {
    console.warn("VoxReview: Could not forward web auth state to the extension.", error);
  });
});

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (
      sender.id !== chrome.runtime.id ||
      message?.type !== "extensionLogoutSync" ||
      window.location.origin !== officialAppOrigin
    ) {
      return;
    }

    window.dispatchEvent(new CustomEvent("voxreview_extension_logout"));
  });
