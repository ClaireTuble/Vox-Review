function tokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Number(payload.exp) || 0;
  } catch {
    return 0;
  }
}

function getSessionExpiry(session) {
  return Number(session?.expires_at) ||
    tokenExpiry(session?.access_token || session?.token) ||
    0;
}

export function isNewerAuthSession(candidate, current) {
  if (!current) return true;
  if (candidate?.user?.id !== current?.user?.id) return true;

  const candidateExpiry = getSessionExpiry(candidate);
  const currentExpiry = getSessionExpiry(current);
  if (candidateExpiry !== currentExpiry) return candidateExpiry > currentExpiry;
  return (candidate?.access_token || candidate?.token) ===
    (current?.access_token || current?.token);
}

export function createChromeAuthStorage(storage, {
  storageKey = "voxreview_auth_session",
} = {}) {
  if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") {
    throw new TypeError("Chrome local storage is required for extension authentication.");
  }

  return {
    async getItem(key) {
      if (key !== storageKey) return null;
      const result = await storage.get([storageKey]);
      const session = result?.[storageKey];
      if (!session) return null;
      const accessToken = session.access_token || session.token;
      if (!accessToken || !session.refresh_token || !session.user) return null;
      return JSON.stringify({
        ...session,
        access_token: accessToken,
        expires_at: session.expires_at || tokenExpiry(accessToken),
        token_type: session.token_type || "bearer",
      });
    },

    async setItem(key, value) {
      if (key !== storageKey) return;
      let candidate;
      try {
        candidate = JSON.parse(value);
      } catch {
        throw new TypeError("Supabase provided an invalid persisted authentication session.");
      }
      if (!candidate?.access_token || !candidate?.refresh_token || !candidate?.user?.id) {
        throw new TypeError("Supabase provided an incomplete persisted authentication session.");
      }

      const result = await storage.get([storageKey]);
      const current = result?.[storageKey];
      if (!isNewerAuthSession(candidate, current)) return;
      await storage.set({
        [storageKey]: {
          ...candidate,
          token: candidate.access_token,
        },
      });
    },

    async removeItem(key) {
      if (key === storageKey) await storage.remove([storageKey]);
    },
  };
}
