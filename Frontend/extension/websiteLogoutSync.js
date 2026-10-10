const EXTENSION_USER_AUTH_STORAGE_KEY = "voxreview_auth_session";

export async function removeMatchingWebsiteLogoutSession({
  storage,
  userId,
  queueAuthLogout,
  markAuthUserLoggedOut,
}) {
  if (typeof userId !== "string" || !userId) return false;

  const stored = await storage.get([EXTENSION_USER_AUTH_STORAGE_KEY]);
  const session = stored?.[EXTENSION_USER_AUTH_STORAGE_KEY];
  if (session?.user?.id !== userId) return false;

  const current = await storage.get([EXTENSION_USER_AUTH_STORAGE_KEY]);
  if (current?.[EXTENSION_USER_AUTH_STORAGE_KEY]?.user?.id !== userId) return false;

  await storage.remove([EXTENSION_USER_AUTH_STORAGE_KEY]);
  await Promise.all([
    queueAuthLogout(session),
    markAuthUserLoggedOut(userId),
  ]);
  return true;
}
