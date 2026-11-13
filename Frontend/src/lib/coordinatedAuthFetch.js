const REFRESH_REQUEST_EVENT = "voxreview_auth_refresh_request";
const REFRESH_RESULT_EVENT = "voxreview_auth_refresh_result";
const REFRESH_BRIDGE_TIMEOUT_MS = 1500;

function isRefreshRequest(input, init) {
  const url = typeof input === "string" || input instanceof URL
    ? String(input)
    : input?.url;
  if (!url || !url.includes("/auth/v1/token?grant_type=refresh_token")) return null;
  const body = init?.body;
  if (typeof body !== "string") return null;
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.refresh_token === "string" ? parsed.refresh_token : null;
  } catch {
    return null;
  }
}

function toResponse(result) {
  return new Response(JSON.stringify(result.body || {}), {
    status: result.status || 503,
    headers: { "Content-Type": "application/json" },
  });
}

export function createCoordinatedAuthFetch({
  fetchImpl = globalThis.fetch.bind(globalThis),
  runtime = globalThis.chrome?.runtime,
  storage = globalThis.chrome?.storage?.local,
  windowRef = globalThis.window,
  localStorageRef = globalThis.localStorage,
  CustomEventCtor = globalThis.CustomEvent,
  extensionRuntime = windowRef?.location?.protocol === "chrome-extension:",
  timeoutMs = REFRESH_BRIDGE_TIMEOUT_MS,
}) {
  return async (input, init) => {
    const refreshToken = isRefreshRequest(input, init);
    if (!refreshToken) return fetchImpl(input, init);
    if (
      extensionRuntime &&
      (!runtime?.sendMessage || !storage)
    ) {
      return toResponse({
        status: 503,
        body: { error: "temporarily_unavailable", message: "Session refresh is temporarily unavailable." },
      });
    }

    let userId = null;
    if (extensionRuntime && storage) {
      const stored = await storage.get(["voxreview_auth_session"]);
      userId = stored?.voxreview_auth_session?.user?.id || null;
    } else {
      try {
        userId = JSON.parse(localStorageRef?.getItem("user_auth_session") || "null")?.user?.id || null;
      } catch {
        userId = null;
      }
    }

    if (!userId) {
      return extensionRuntime
        ? toResponse({
            status: 503,
            body: { error: "session_not_found", message: "The stored session is no longer available." },
          })
        : fetchImpl(input, init);
    }
    const message = {
      type: "refreshAuthSession",
      userId,
      refreshToken,
    };

    if (extensionRuntime) {
      try {
        const result = await runtime.sendMessage(message);
        return toResponse(result);
      } catch {
        return toResponse({
          status: 503,
          body: { error: "temporarily_unavailable", message: "Session refresh is temporarily unavailable." },
        });
      }
    }

    if (!windowRef?.addEventListener || !windowRef?.dispatchEvent) return fetchImpl(input, init);
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const response = await new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        windowRef.removeEventListener(REFRESH_RESULT_EVENT, onResult);
        resolve(result);
      };
      const onResult = (event) => {
        if (event.target !== windowRef || event.detail?.requestId !== requestId) return;
        finish(event.detail.result);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      windowRef.addEventListener(REFRESH_RESULT_EVENT, onResult);
      windowRef.dispatchEvent(new CustomEventCtor(REFRESH_REQUEST_EVENT, {
        detail: { requestId, userId, refreshToken },
      }));
    });

    if (response) return toResponse(response);
    if (
      windowRef.document?.documentElement?.dataset?.voxreviewExtensionAuthBridge === "ready"
    ) {
      return toResponse({
        status: 503,
        body: { error: "temporarily_unavailable", message: "Session refresh is temporarily unavailable." },
      });
    }
    return fetchImpl(input, init);
  };
}
