function getTokenExpiry(token) {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return 0;
    const base64Payload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, "=");
    const payload = JSON.parse(atob(paddedPayload));
    return Number(payload.exp) * 1000 || 0;
  } catch {
    return 0;
  }
}

async function refreshAuthSession({ session, fetchImpl, supabaseUrl, anonKey }) {
  if (!session.refresh_token) return { state: "invalid" };

  let response;
  try {
    response = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
  } catch {
    return { state: "retry" };
  }

  if (response.ok) {
    let refreshed;
    try {
      refreshed = await response.json();
    } catch {
      return { state: "retry" };
    }
    if (refreshed?.access_token && refreshed?.refresh_token) {
      return {
        state: "refreshed",
        session: {
          ...session,
          token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
        },
      };
    }
    return { state: "retry" };
  }

  return [400, 401, 403].includes(response.status)
    ? { state: "invalid" }
    : { state: "retry" };
}

async function requestGlobalSignOut({ session, fetchImpl, supabaseUrl, anonKey }) {
  try {
    return await fetchImpl(`${supabaseUrl}/auth/v1/logout?scope=global`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.token}`,
      },
    });
  } catch {
    return null;
  }
}

export async function revokePendingAuthSessions({
  sessions,
  fetchImpl = fetch,
  supabaseUrl,
  anonKey,
  now = Date.now(),
}) {
  const remaining = [];
  const revokedUserIds = [];

  for (const queuedSession of sessions) {
    if (
      typeof queuedSession?.userId !== "string" ||
      !queuedSession.userId ||
      typeof queuedSession.token !== "string" ||
      !queuedSession.token
    ) {
      continue;
    }

    let session = queuedSession;
    let refreshed = false;
    if (getTokenExpiry(session.token) <= now) {
      const refreshResult = await refreshAuthSession({
        session,
        fetchImpl,
        supabaseUrl,
        anonKey,
      });
      if (refreshResult.state === "invalid") {
        revokedUserIds.push(session.userId);
        continue;
      }
      if (refreshResult.state === "retry") {
        remaining.push(session);
        continue;
      }
      session = refreshResult.session;
      refreshed = true;
    }

    let response = await requestGlobalSignOut({
      session,
      fetchImpl,
      supabaseUrl,
      anonKey,
    });
    if (response?.ok) {
      revokedUserIds.push(session.userId);
      continue;
    }

    if (!response || ![400, 401, 403].includes(response.status)) {
      remaining.push(session);
      continue;
    }

    if (!refreshed) {
      const refreshResult = await refreshAuthSession({
        session,
        fetchImpl,
        supabaseUrl,
        anonKey,
      });
      if (refreshResult.state === "retry") {
        remaining.push(session);
        continue;
      }
      if (refreshResult.state === "refreshed") {
        session = refreshResult.session;
        response = await requestGlobalSignOut({
          session,
          fetchImpl,
          supabaseUrl,
          anonKey,
        });
        if (response?.ok) {
          revokedUserIds.push(session.userId);
          continue;
        }
        if (!response || ![400, 401, 403].includes(response.status)) {
          remaining.push(session);
          continue;
        }
      }
    }

    revokedUserIds.push(session.userId);
  }

  return { remaining, revokedUserIds };
}
