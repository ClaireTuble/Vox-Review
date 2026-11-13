const GOOGLE_OAUTH_DIAG_STAGES = new Set([
  'supabase-auth-config',
  'pending-marker-store',
  'pending-marker-clear',
  'oauth-initiation-start',
  'oauth-initiation-result',
  'login-return',
  'callback-service-start',
  'callback-start',
  'callback-session-check',
  'callback-user-verification',
  'trusted-role-check',
  'callback-success',
  'callback-failure',
  'callback-cleanup',
  'auth-listener',
  'extension-session-sync',
  'regular-session-persistence',
  'regular-client-cleanup',
  'navigation-handler',
  'navigation-result',
  'restored-session-validator',
  'extension-logout-bridge',
  'extension-logout-source',
]);
const GOOGLE_OAUTH_DIAG_STORAGE_KEY = 'voxreview_google_oauth_diagnostics';
const GOOGLE_OAUTH_DIAG_EVENT = 'voxreview_google_oauth_diagnostics_updated';
const GOOGLE_OAUTH_DIAG_MAX_ENTRIES = 100;

const GOOGLE_OAUTH_DIAG_ERROR_CODES = new Set([
  'GOOGLE_OAUTH_CALLBACK_ERROR',
  'GOOGLE_OAUTH_CALLBACK_MALFORMED',
  'GOOGLE_OAUTH_SESSION_ERROR',
  'GOOGLE_OAUTH_SESSION_MISSING',
  'GOOGLE_OAUTH_USER_VERIFICATION_FAILED',
  'GOOGLE_OAUTH_IDENTITY_MISMATCH',
  'GOOGLE_OAUTH_SESSION_PERSIST_FAILED',
  'GOOGLE_OAUTH_SESSION_UNVERIFIED',
  'REGULAR_USER_ROLE_NOT_ALLOWED',
  'access_denied',
  'server_error',
  'temporarily_unavailable',
  'invalid_grant',
  'invalid_request',
  'validation_failed',
  'user_not_found',
  'bad_jwt',
  'session_not_found',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'email_not_confirmed',
]);

const GOOGLE_OAUTH_DIAG_BOOLEAN_FIELDS = new Set([
  'pendingMarkerStored',
  'pendingMarkerExists',
  'urlHasOAuthParameters',
  'callbackDetected',
  'sessionPresent',
  'identityMatches',
  'trustedRoleAllowed',
  'gateBlocked',
  'persistenceSkipped',
  'persistenceAttempted',
  'persistenceSucceeded',
  'callbackSuccess',
  'cleanupSucceeded',
  'navigationExecuted',
  'signInWithOAuthSucceeded',
  'detectSessionInUrl',
  'persistSession',
  'autoRefreshToken',
  'flowTypeConfigured',
  'invalidSession',
  'refreshFailed',
  'sessionMatchesValidated',
  'bridgeEventEntered',
  'eventTargetMatchesWindow',
  'eventOriginAllowed',
  'eventHasTargetIdentity',
  'sessionMatchesTarget',
  'signOutAttempted',
  'bridgeRejected',
  'logoutMarkerPresent',
  'messageAccepted',
]);

const GOOGLE_OAUTH_DIAG_STATUSES = new Set([
  'started',
  'completed',
  'success',
  'failure',
  'skipped',
  'attempted',
  'invalid',
  'other-error',
  'missing-user',
  'identity-mismatch',
  'session-lookup-failed',
  'local-sign-out-failed',
  'event-target-rejected',
  'origin-rejected',
  'missing-target-identity',
  'logout-marker-blocked',
  'stored-session-mismatch',
  'sync-message',
  'scheduled',
  'refresh-failed',
  'logout-marker-check',
]);

const GOOGLE_OAUTH_DIAG_EVENT_TYPES = new Set([
  'INITIAL_SESSION',
  'PASSWORD_RECOVERY',
  'SIGNED_IN',
  'SIGNED_OUT',
  'TOKEN_REFRESHED',
  'USER_UPDATED',
  'MFA_CHALLENGE_VERIFIED',
]);
const GOOGLE_OAUTH_DIAG_TRIGGERS = new Set(['INITIAL_SESSION', 'online']);
const GOOGLE_OAUTH_DIAG_SOURCES = new Set(['logout-marker', 'extension-message']);

export function dispatchWebsiteAuthSync(windowRef, session, userId, clearLogoutMarker = false) {
  if (!windowRef || !userId) return;

  windowRef.dispatchEvent(new CustomEvent('voxreview_auth_sync', {
    detail: {
      action: session ? 'session_updated' : 'signed_out',
      userId,
      clearLogoutMarker,
    },
  }));
}

export function handleRegularUserAuthEvent(event, session, handlers) {
  if (event === 'SIGNED_OUT') {
    handlers.onSignedOut?.();
    return 'signed_out';
  }

  if (event === 'INITIAL_SESSION' && !session) {
    handlers.onInitialSessionMissing?.();
    return 'initial_session_missing';
  }

  if (session?.user && session.access_token) {
    handlers.onSessionAvailable?.(event, session);
    return 'session_available';
  }

  handlers.onIgnored?.(event, session);
  return 'ignored';
}


export function clearMatchingRegularUserSession({ userId, storedUserId, removeSession }) {
  if (userId && storedUserId && storedUserId !== userId) return false;
  removeSession();
  return true;
}

export function sanitizeGoogleOAuthErrorCode(code) {
  return typeof code === 'string' && GOOGLE_OAUTH_DIAG_ERROR_CODES.has(code)
    ? code
    : 'OTHER';
}

function sanitizeGoogleOAuthDiagDetails(details = {}) {
  const diagnostic = {};
  for (const [key, value] of Object.entries(details)) {
    if (GOOGLE_OAUTH_DIAG_BOOLEAN_FIELDS.has(key) && typeof value === 'boolean') {
      diagnostic[key] = value;
    } else if (key === 'eventType' && GOOGLE_OAUTH_DIAG_EVENT_TYPES.has(value)) {
      diagnostic[key] = value;
    } else if (key === 'status' && GOOGLE_OAUTH_DIAG_STATUSES.has(value)) {
      diagnostic.status = value;
    } else if (key === 'trigger' && GOOGLE_OAUTH_DIAG_TRIGGERS.has(value)) {
      diagnostic.trigger = value;
    } else if (key === 'source' && GOOGLE_OAUTH_DIAG_SOURCES.has(value)) {
      diagnostic.source = value;
    } else if (key === 'errorCode') {
      diagnostic.errorCode = sanitizeGoogleOAuthErrorCode(value);
    } else if (
      key === 'destinationPathname' &&
      ['/login', '/after-login'].includes(value)
    ) {
      diagnostic.destinationPathname = value;
    } else if (
      key === 'currentPathname' &&
      ['/', '/login', '/after-login'].includes(value)
    ) {
      diagnostic.currentPathname = value;
    } else if (
      key === 'identitySource' &&
      ['session', 'verified-user'].includes(value)
    ) {
      diagnostic.identitySource = value;
    } else if (
      key === 'flowType' &&
      ['implicit', 'pkce'].includes(value)
    ) {
      diagnostic.flowType = value;
    }
  }
  return diagnostic;
}

function sanitizeStoredGoogleOAuthDiagEntry(entry) {
  if (
    !entry ||
    typeof entry !== 'object' ||
    !GOOGLE_OAUTH_DIAG_STAGES.has(entry.stage) ||
    !Number.isFinite(entry.timestamp) ||
    Math.abs(entry.timestamp) > 8.64e15
  ) {
    return null;
  }
  return {
    timestamp: entry.timestamp,
    stage: entry.stage,
    ...sanitizeGoogleOAuthDiagDetails(entry),
  };
}

export function getGoogleOAuthDiagEntries() {
  try {
    const storedEntries = globalThis.sessionStorage?.getItem(GOOGLE_OAUTH_DIAG_STORAGE_KEY);
    if (!storedEntries) return [];
    const parsedEntries = JSON.parse(storedEntries);
    if (!Array.isArray(parsedEntries)) return [];
    return parsedEntries
      .map(sanitizeStoredGoogleOAuthDiagEntry)
      .filter(Boolean)
      .slice(-GOOGLE_OAUTH_DIAG_MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function clearGoogleOAuthDiagEntries() {
  try {
    globalThis.sessionStorage?.removeItem(GOOGLE_OAUTH_DIAG_STORAGE_KEY);
  } catch {
    return;
  }
  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent(GOOGLE_OAUTH_DIAG_EVENT));
  }
}

export function logGoogleOAuthDiag(stage, details = {}) {
  if (!GOOGLE_OAUTH_DIAG_STAGES.has(stage)) return;

  const diagnostic = {
    timestamp: Date.now(),
    stage,
    ...sanitizeGoogleOAuthDiagDetails(details),
  };
  try {
    const entries = getGoogleOAuthDiagEntries();
    entries.push(diagnostic);
    globalThis.sessionStorage?.setItem(
      GOOGLE_OAUTH_DIAG_STORAGE_KEY,
      JSON.stringify(entries.slice(-GOOGLE_OAUTH_DIAG_MAX_ENTRIES)),
    );
  } catch {
    // Diagnostic persistence is best-effort and must not affect authentication.
  }
  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent(GOOGLE_OAUTH_DIAG_EVENT));
  }

  console.info('[GoogleOAuthDiag]', {
    stage: diagnostic.stage,
    ...sanitizeGoogleOAuthDiagDetails(diagnostic),
  });
}

export const GOOGLE_OAUTH_DIAG_UPDATE_EVENT = GOOGLE_OAUTH_DIAG_EVENT;

export function isMatchingAuthUser(session, userId) {
  return typeof userId === 'string' && Boolean(userId) && session?.user?.id === userId;
}

export function isRegularUserAuthUser(user) {
  const role = user?.app_metadata?.role;
  return role == null || role === 'user';
}

export function isExtensionRuntime(
  windowRef = globalThis.window,
  chromeRef = globalThis.chrome,
) {
  return windowRef?.location?.protocol === 'chrome-extension:'
    || (!windowRef && Boolean(chromeRef?.runtime?.id));
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

export function getSessionAccessToken(session) {
  return session?.access_token || session?.token || null;
}

export function isInvalidAuthSessionError(error) {
  return [400, 401, 403].includes(Number(error?.status));
}

export function isInvalidRefreshTokenError(error) {
  const status = Number(error?.status);
  if ([401, 403].includes(status)) return true;
  if (status !== 400) return false;

  const code = [
    error?.code,
    error?.error_code,
    error?.error,
  ].filter((value) => typeof value === 'string').join(' ').toLowerCase();
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return /invalid_grant|refresh_token_(not_found|already_used)|invalid[_ ]refresh[_ ]token|refresh token (not found|already used|expired|revoked)/i
    .test(`${code} ${message}`);
}

export async function signOutMatchingLocalSession({
  userId,
  getSession,
  signOut,
  onSessionMatch,
}) {
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

  try {
    onSessionMatch?.();
  } catch {
    // Diagnostic callbacks must never prevent matching-session cleanup.
  }
  const { error: signOutError } = await signOut({ scope: 'local' });
  if (signOutError) {
    return { cleared: false, reason: 'local_sign_out_failed' };
  }
  return { cleared: true, reason: null };
}

export function getRegularUserAfterAuthSync(event, currentUser, getCurrentUser) {
  const { action, userId } = event?.detail || {};
  if (typeof userId !== 'string' || !userId) return { handled: false, user: currentUser };

  if (action === 'signed_out') {
    if (currentUser?.id && currentUser.id !== userId) {
      return { handled: false, user: currentUser };
    }
    const user = getCurrentUser();
    if (user?.id && user.id !== userId) return { handled: false, user: currentUser };
    return { handled: true, user };
  }

  if (action === 'session_updated') {
    const user = getCurrentUser();
    if (user?.id !== userId) return { handled: false, user: currentUser };
    return { handled: true, user };
  }

  return { handled: false, user: currentUser };
}
