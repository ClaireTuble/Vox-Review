export async function getCurrentSuperAdminAccessToken(auth, onLookupError = () => {}) {
  try {
    const { data, error } = await auth.getSession();
    if (error) {
      onLookupError(error);
      return null;
    }

    const session = data?.session;
    if (
      typeof session?.access_token !== "string" ||
      !session.access_token ||
      session.user?.app_metadata?.role !== "superadmin"
    ) return null;

    return session.access_token;
  } catch (error) {
    onLookupError(error);
    return null;
  }
}
