function tokenExpiry(token) {
  try {
    const encoded = token.split(".")[1];
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return Number(JSON.parse(atob(padded)).exp) || 0;
  } catch {
    return 0;
  }
}

export function createAuthRefreshCoordinator({
  getSession,
  setSession,
  removeSession,
  fetchImpl = fetch,
  supabaseUrl,
  anonKey,
}) {
  let queue = Promise.resolve();

  function enqueue(operation) {
    const task = queue.then(operation);
    queue = task.catch(() => {});
    return task;
  }

  async function refresh({ userId, refreshToken }) {
    if (typeof userId !== "string" || !userId || typeof refreshToken !== "string" || !refreshToken) {
      return { status: 400, body: { error: "invalid_request", message: "Invalid session refresh request." } };
    }

    const session = await getSession();
    if (!session || session.user?.id !== userId) {
      return { status: 401, body: { error: "session_not_found", message: "The stored session is no longer available." } };
    }

    const currentRefreshToken = session.refresh_token;
    if (!currentRefreshToken) {
      return { status: 401, body: { error: "refresh_token_not_found", message: "The stored refresh token is unavailable." } };
    }

    if (currentRefreshToken !== refreshToken) {
      return {
        status: 200,
        body: {
          ...session,
          access_token: session.access_token || session.token,
          expires_in: Math.max(0, tokenExpiry(session.access_token || session.token) - Math.floor(Date.now() / 1000)),
          token_type: session.token_type || "bearer",
        },
      };
    }

    let response;
    try {
      response = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: currentRefreshToken }),
      });
    } catch {
      return { status: 503, body: { error: "temporarily_unavailable", message: "Session refresh is temporarily unavailable." } };
    }

    let body;
    try {
      body = await response.json();
    } catch {
      return { status: 503, body: { error: "temporarily_unavailable", message: "Session refresh is temporarily unavailable." } };
    }

    if (!response.ok) return { status: response.status, body };
    if (!body?.access_token || !body?.refresh_token) {
      return { status: 503, body: { error: "temporarily_unavailable", message: "Session refresh returned an incomplete session." } };
    }

    const updatedSession = {
      ...session,
      ...body,
      token: body.access_token,
      user: body.user || session.user,
    };
    try {
      await setSession(updatedSession);
    } catch {
      return {
        status: 503,
        body: { error: "temporarily_unavailable", message: "The refreshed session could not be saved." },
      };
    }
    return { status: response.status, body: { ...body, user: body.user || session.user } };
  }

  return {
    refresh(request) {
      return enqueue(() => refresh(request));
    },
    persistSession(candidate, { allowUserReplacement = false } = {}) {
      return enqueue(async () => {
        if (
          !candidate?.user?.id ||
          !(candidate.access_token || candidate.token) ||
          !candidate.refresh_token
        ) return false;

        const current = await getSession();
        if (
          current?.user?.id &&
          current.user.id !== candidate.user.id &&
          !allowUserReplacement
        ) return false;
        if (
          current?.user?.id === candidate.user.id &&
          !isNewerSession(candidate, current)
        ) return false;

        await setSession({
          ...candidate,
          access_token: candidate.access_token || candidate.token,
          token: candidate.access_token || candidate.token,
        });
        return true;
      });
    },
    clearSession({ userId, expectedSession } = {}) {
      return enqueue(async () => {
        const current = await getSession();
        if (!current) return true;
        if (userId && current.user?.id !== userId) return false;
        if (
          expectedSession &&
          (current.token !== expectedSession.token ||
            current.refresh_token !== expectedSession.refresh_token)
        ) return false;
        await removeSession();
        return true;
      });
    },
  };
}

function isNewerSession(candidate, current) {
  const candidateExpiry = Number(candidate.expires_at) ||
    tokenExpiry(candidate.access_token || candidate.token);
  const currentExpiry = Number(current.expires_at) ||
    tokenExpiry(current.access_token || current.token);
  if (candidateExpiry !== currentExpiry) return candidateExpiry > currentExpiry;
  return (candidate.access_token || candidate.token) ===
    (current.access_token || current.token);
}
