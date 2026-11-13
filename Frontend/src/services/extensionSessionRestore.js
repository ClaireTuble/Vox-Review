export async function restorePersistedExtensionSession({
  storage,
  storageKey,
  validateSession,
  persistSession,
  clearSession,
}) {
  try {
    const stored = await storage.get([storageKey]);
    const candidate = stored?.[storageKey] || null;
    if (!candidate?.user?.id) return null;

    const validation = await validateSession(candidate);
    if (validation?.status === "unavailable") {
      return {
        status: "unavailable",
        reason: validation.reason || "session_validation_failed",
      };
    }
    if (validation?.status !== "valid") {
      await clearSession(candidate);
      return null;
    }

    return await persistSession({
      ...validation.session,
      user: validation.user,
    });
  } catch {
    return { status: "unavailable", reason: "session_validation_failed" };
  }
}
