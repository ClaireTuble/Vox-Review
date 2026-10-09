export function normalizeSupabaseUser(user) {
  if (!user) return null;

  const metadata = user.user_metadata || user;
  const firstName = metadata.firstName || '';
  const lastName = metadata.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const avatarUrl =
    user.avatarUrl ||
    user.custom_avatar_url ||
    metadata.custom_avatar_url ||
    user.avatar_url ||
    metadata.google_avatar_url ||
    metadata.avatar_url ||
    metadata.picture ||
    metadata.avatarUrl ||
    null;
  const googleAvatarUrl =
    user.googleAvatarUrl ||
    user.google_avatar_url ||
    metadata.google_avatar_url ||
    metadata.avatar_url ||
    metadata.picture ||
    (Array.isArray(user.identities)
      ? user.identities.find((identity) => identity.provider === 'google')?.identity_data?.avatar_url
      : null) ||
    null;

  return {
    id: user.id,
    email: user.email,
    username: metadata.username || metadata.name || user.email?.split('@')[0] || 'user',
    firstName,
    middleInitial: metadata.middleInitial || '',
    lastName,
    name: fullName || metadata.username || metadata.name || user.email?.split('@')[0] || 'user',
    role: 'user',
    avatarUrl,
    googleAvatarUrl,
    isCustomAvatar: user.isCustomAvatar ?? user.is_custom_avatar ?? Boolean(user.custom_avatar_url || metadata.custom_avatar_url),
  };
}

export function buildProfileUser(profileUser, existingUser) {
  const metadata = existingUser?.user_metadata || {};
  const profileAvatarUrl = profileUser.avatarUrl ?? profileUser.avatar_url;

  return normalizeSupabaseUser({
    ...existingUser,
    ...profileUser,
    avatarUrl: profileAvatarUrl ?? null,
    user_metadata: {
      ...metadata,
      firstName: profileUser.firstName ?? existingUser?.firstName ?? metadata.firstName ?? '',
      lastName: profileUser.lastName ?? existingUser?.lastName ?? metadata.lastName ?? '',
      username: profileUser.username ?? existingUser?.username ?? metadata.username ?? '',
      name: profileUser.fullName || profileUser.username || existingUser?.name || metadata.name || '',
      custom_avatar_url: profileUser.isCustomAvatar ? profileAvatarUrl : null,
      google_avatar_url: profileUser.googleAvatarUrl || metadata.google_avatar_url,
    },
  });
}

export function shouldRefreshProfileForAuthChange(previousSession, nextSession) {
  const nextUserId = nextSession?.user?.id;
  if (!nextUserId) return false;
  return nextUserId !== (previousSession?.user?.id || null);
}
