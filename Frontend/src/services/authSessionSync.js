export function isMatchingAuthUser(session, userId) {
  return typeof userId === 'string' && Boolean(userId) && session?.user?.id === userId;
}

export function isExpiredAccessToken(token, now = Date.now()) {
  try {
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) return true;
    const base64Payload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, '=');
    const payload = JSON.parse(atob(paddedPayload));
    return !payload.exp || payload.exp * 1000 <= now;
  } catch {
    return true;
  }
}

export function isInvalidAuthSessionError(error) {
  return [400, 401, 403].includes(Number(error?.status));
}

export async function signOutMatchingLocalSession({ userId, getSession, signOut }) {
  if (typeof userId !== 'string' || !userId) {
    return { cleared: false, reason: 'missing_identity' };
  }

  const { data, error: getSessionError } = await getSession();
  if (getSessionError) {
    return { cleared: false, reason: 'session_lookup_failed' };
  }
  if (!isMatchingAuthUser(data?.session, userId)) {
    return { cleared: false, reason: 'identity_mismatch' };
  }

  const { error: signOutError } = await signOut({ scope: 'local' });
  if (signOutError) {
    return { cleared: false, reason: 'local_sign_out_failed' };
  }
  return { cleared: true, reason: null };
}
