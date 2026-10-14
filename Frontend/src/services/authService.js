import { adminSupabase, supabase } from '../lib/supabase.js';
import { APP_BASE_URL } from './appConfig.js';
import { API_BASE_URL } from './apiConfig.js';
import {
  buildProfileUser,
  normalizeSupabaseUser,
} from './userProfileSync.js';
import {
  isExpiredAccessToken,
  isInvalidAuthSessionError,
  isMatchingAuthUser,
  signOutMatchingLocalSession,
} from './authSessionSync.js';
import {
  completeGoogleOAuthSession,
  createGoogleOAuthSessionGate,
} from './googleOAuthFlow.js';

const USER_AUTH_STORAGE_KEY = 'user_auth_session';
const SUPERADMIN_AUTH_STORAGE_KEY = 'superadmin_auth_session';
const EXTENSION_USER_AUTH_STORAGE_KEY = 'voxreview_auth_session';
const PENDING_AUTH_LOGOUTS_STORAGE_KEY = 'voxreview_pending_auth_logouts';
const PENDING_GOOGLE_SIGN_IN_STORAGE_KEY = 'voxreview_google_sign_in_pending';
let lastRegularUserId = null;
let googleCallbackTask = null;

function hasPendingGoogleSignIn() {
  try {
    return sessionStorage.getItem(PENDING_GOOGLE_SIGN_IN_STORAGE_KEY) === 'true';
  } catch (error) {
    console.warn('VoxReview: Could not read pending Google sign-in state.', error?.message || error);
    return false;
  }
}

function clearPendingGoogleSignIn() {
  try {
    sessionStorage.removeItem(PENDING_GOOGLE_SIGN_IN_STORAGE_KEY);
  } catch (error) {
    console.warn('VoxReview: Could not clear pending Google sign-in state.', error?.message || error);
  }
}

const googleOAuthSessionGate = createGoogleOAuthSessionGate(hasPendingGoogleSignIn());

function getStoredRegularUserId() {
  try {
    const storedSession = JSON.parse(localStorage.getItem(USER_AUTH_STORAGE_KEY) || 'null');
    return storedSession?.user?.id || null;
  } catch {
    return null;
  }
}

async function queueExtensionAuthRevocation(session) {
  if (!session?.user?.id || !session.token || !globalThis.chrome?.storage?.local) return;
  const stored = await globalThis.chrome.storage.local.get([PENDING_AUTH_LOGOUTS_STORAGE_KEY]);
  const pending = Array.isArray(stored?.[PENDING_AUTH_LOGOUTS_STORAGE_KEY])
    ? stored[PENDING_AUTH_LOGOUTS_STORAGE_KEY]
    : [];
  const next = pending.filter((entry) => entry.userId !== session.user.id);
  next.push({
    userId: session.user.id,
    token: session.token,
    refresh_token: session.refresh_token || null,
  });
  await globalThis.chrome.storage.local.set({ [PENDING_AUTH_LOGOUTS_STORAGE_KEY]: next });
}

async function removeExtensionAuthRevocation(userId) {
  if (!userId || !globalThis.chrome?.storage?.local) return;
  const stored = await globalThis.chrome.storage.local.get([PENDING_AUTH_LOGOUTS_STORAGE_KEY]);
  const pending = Array.isArray(stored?.[PENDING_AUTH_LOGOUTS_STORAGE_KEY])
    ? stored[PENDING_AUTH_LOGOUTS_STORAGE_KEY]
    : [];
  await globalThis.chrome.storage.local.set({
    [PENDING_AUTH_LOGOUTS_STORAGE_KEY]: pending.filter((entry) => entry.userId !== userId),
  });
}

async function clearStoredExtensionSession(userId) {
  if (!userId || !globalThis.chrome?.storage?.local) return;
  const stored = await globalThis.chrome.storage.local.get([EXTENSION_USER_AUTH_STORAGE_KEY]);
  if (stored?.[EXTENSION_USER_AUTH_STORAGE_KEY]?.user?.id === userId) {
    await globalThis.chrome.storage.local.remove([EXTENSION_USER_AUTH_STORAGE_KEY]);
  }
}

function persistSuperAdminSession(session) {
  if (!session?.user) {
    localStorage.removeItem(SUPERADMIN_AUTH_STORAGE_KEY);
    return null;
  }

  localStorage.setItem(SUPERADMIN_AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

function syncExtensionAuthSession(
  session,
  userId = session?.user?.id || lastRegularUserId,
  clearLogoutMarker = false,
) {
  const nextSession = session && session.user && session.token ? session : null;

  if (isExtensionRuntime && globalThis.chrome?.storage?.local) {
    if (!nextSession) {
      void clearStoredExtensionSession(userId).catch((error) => {
        console.warn('VoxReview: Could not clear the matching extension session.', {
          code: error?.code || null,
        });
      });
    } else {
      globalThis.chrome.storage.local
        .set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: nextSession })
        .catch((error) => {
          console.warn('VoxReview: Could not persist the extension session.', {
            code: error?.code || null,
          });
        });
    }
  }

  if (!isExtensionRuntime && typeof window !== 'undefined' && userId) {
    window.dispatchEvent(new CustomEvent('voxreview_auth_sync', {
      detail: {
        action: nextSession ? 'session_updated' : 'signed_out',
        userId,
        clearLogoutMarker,
      },
    }));
  }

  return nextSession;
}

function clearRegularUserSession(userId = lastRegularUserId || getStoredRegularUserId()) {
  const storedUserId = getStoredRegularUserId();
  if (userId && storedUserId && storedUserId !== userId) return null;
  localStorage.removeItem(USER_AUTH_STORAGE_KEY);
  syncExtensionAuthSession(null, userId);
  lastRegularUserId = null;
  return null;
}

function persistRegularUserSession(
  session,
  { clearLogoutMarker = false, verifiedOAuthSession = false } = {},
) {
  if (!session || !session.user) {
    return clearRegularUserSession();
  }
  if (!googleOAuthSessionGate.canPersistRegularUserSession(verifiedOAuthSession)) return null;

  const normalizedUser = normalizeSupabaseUser(session.user);
  const normalizedSession = {
    user: normalizedUser,
    token: session.access_token || session.token || null,
    refresh_token: session.refresh_token || null,
  };

  localStorage.setItem(USER_AUTH_STORAGE_KEY, JSON.stringify(normalizedSession));
  lastRegularUserId = normalizedUser.id || null;
  syncExtensionAuthSession(normalizedSession, normalizedUser.id, clearLogoutMarker);

  return normalizedSession;
}

async function clearFailedGoogleOAuthSession(userId) {
  if (!userId) return;
  const result = await signOutMatchingLocalSession({
    userId,
    getSession: () => supabase.auth.getSession(),
    signOut: (options) => supabase.auth.signOut(options),
  });
  if (!result.cleared && result.reason !== 'identity_mismatch') {
    console.warn('VoxReview: Could not clear the failed Google sign-in session.', {
      reason: result.reason,
    });
  }
}

async function readRegularUserExtensionSession({ persistSession = true } = {}) {
  try {
    if (globalThis.chrome?.storage?.local) {
      const extensionSession = await new Promise((resolve) => {
        globalThis.chrome.storage.local.get([EXTENSION_USER_AUTH_STORAGE_KEY], (result) => {
          resolve(result?.[EXTENSION_USER_AUTH_STORAGE_KEY] || null);
        });
      });

      if (extensionSession?.user?.id) {
        // Step 1: Validate active access token
        if (extensionSession.token && !isExpiredAccessToken(extensionSession.token)) {
          const { data, error } = await supabase.auth.getUser(extensionSession.token);
          if (!error && data?.user) {
            return extensionSession;
          }
        }

        // Step 2: Fallback to token refresh if token expired or rotated post-password-change
        if (extensionSession.refresh_token) {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
            refresh_token: extensionSession.refresh_token,
          });

          if (!refreshError && refreshData?.session?.user && refreshData.session.access_token) {
            return persistRegularUserSession(refreshData.session);
          }
        }
      }

      // Step 3: Fallback check on localStorage
      const rawLocal = localStorage.getItem(USER_AUTH_STORAGE_KEY);
      if (rawLocal) {
        try {
          const parsed = JSON.parse(rawLocal);
          if (parsed?.token && !isExpiredAccessToken(parsed.token)) {
            const { data, error } = await supabase.auth.getUser(parsed.token);
            if (!error && data?.user) {
              const validatedSession = {
                user: data.user,
                token: parsed.token,
                refresh_token: parsed.refresh_token,
              };
              return persistSession
                ? persistRegularUserSession(validatedSession)
                : {
                    ...validatedSession,
                    user: normalizeSupabaseUser(validatedSession.user),
                  };
            }
          }
          if (parsed?.refresh_token) {
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
              refresh_token: parsed.refresh_token,
            });

            if (!refreshError && refreshData?.session?.user && refreshData.session.access_token) {
              return persistRegularUserSession(refreshData.session);
            }
          }
        } catch {
          // Ignore JSON parse error
        }
      }

      return null;
    }

    const { data, error } = await supabase.auth.getSession();
    if (!error && data?.session?.user && data.session.access_token) {
      return persistSession
        ? persistRegularUserSession(data.session)
        : {
            ...data.session,
            user: normalizeSupabaseUser(data.session.user),
          };
    }
  } catch (error) {
    console.warn('VoxReview: Session synchronization failed:', error?.message || error);
  }

  return null;
}

async function validateExtensionSession(extensionSession) {
  const userId = extensionSession?.user?.id;
  if (!userId || (!extensionSession.token && !extensionSession.refresh_token)) {
    return { status: 'invalid' };
  }

  try {
    if (extensionSession.token) {
      const { data, error } = await supabase.auth.getUser(extensionSession.token);
      if (!error && data?.user?.id === userId) {
        return { status: 'valid', user: normalizeSupabaseUser(data.user) };
      }
      if (error && !isInvalidAuthSessionError(error)) {
        return { status: 'unavailable' };
      }
    }

    if (!extensionSession.refresh_token) {
      clearRegularUserSession(userId);
      await clearStoredExtensionSession(userId);
      return { status: 'invalid' };
    }

    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
      refresh_token: extensionSession.refresh_token,
    });
    if (
      !refreshError &&
      refreshData?.session?.user?.id === userId &&
      refreshData.session.access_token
    ) {
      const cachedSession = persistRegularUserSession(refreshData.session);
      await globalThis.chrome?.storage?.local?.set({
        [EXTENSION_USER_AUTH_STORAGE_KEY]: cachedSession,
      });
      return { status: 'valid', user: cachedSession.user };
    }

    if (
      isInvalidAuthSessionError(refreshError) ||
      (!refreshError && refreshData?.session?.user?.id !== userId)
    ) {
      clearRegularUserSession(userId);
      await clearStoredExtensionSession(userId);
      return { status: 'invalid' };
    }
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

const isExtensionRuntime = typeof window !== 'undefined' && window.location.protocol === 'chrome-extension:';

if (!isExtensionRuntime && typeof window !== 'undefined') {
  window.addEventListener('voxreview_extension_logout', async (event) => {
    const targetUserId = event.detail?.userId;
    if (
      event.target !== window ||
      window.location.origin !== new URL(APP_BASE_URL).origin ||
      !targetUserId
    ) return;

    try {
      const result = await signOutMatchingLocalSession({
        userId: targetUserId,
        getSession: () => supabase.auth.getSession(),
        signOut: (options) => supabase.auth.signOut(options),
      });
      if (!result.cleared && result.reason !== 'identity_mismatch') {
        console.warn('VoxReview: Website sign-out sync could not clear the matching local session.', {
          reason: result.reason,
        });
      }
    } catch (error) {
      console.warn('VoxReview: Website sign-out sync failed:', error?.message || error);
    }
  });
}

export function normalizeAuthErrorMessage(error, flow = 'login') {
  const rawMessage = typeof error === 'string' ? error : error?.message || '';
  const message = String(rawMessage).trim();
  const lower = message.toLowerCase();

  if (!message) {
    switch (flow) {
      case 'signup':
        return 'Something went wrong. Please try again.';
      case 'forgot':
        return 'Unable to complete this request. Please try again.';
      case 'change-password':
        return 'Unable to update password. Please try again.';
      case 'login':
      default:
        return 'We couldn\'t find an account with those credentials.';
    }
  }

  const invalidEmailPattern = /(invalid email|email is invalid|not a valid email|valid email address|enter a valid email)/i;
  if (invalidEmailPattern.test(message)) {
    return 'Please enter a valid email address.';
  }

  if (flow === 'login') {
    if (/(password).*(incorrect|invalid|wrong|does not match|not valid)/i.test(message)
      || /(user not found|no user|account.*not found|email.*not found|credentials|invalid credentials)/i.test(message)) {
      return 'Incorrect email or password. Please check your credentials and try again.';
    }
    if (/(email.*not.*confirm|confirm.*email|verification code)/i.test(message)) {
      return 'Please enter the verification code sent to your email.';
    }
  }

  if (flow === 'signup') {
    if (/(password).*(weak|too short|at least|require|security|length|invalid)/i.test(message)) {
      return 'Password must meet the required security requirements.';
    }
    if (/(passwords? do not match|confirm.*password)/i.test(message)) {
      return 'Passwords do not match.';
    }
    if (/(username).*(taken|already exists|already in use|not available)/i.test(message)) {
      return 'This username is already taken.';
    }
    if (/(email.*not.*confirm|confirm.*email|verification code)/i.test(message)) {
      return 'Please enter the verification code sent to your email.';
    }
  }

  if (flow === 'forgot') {
    if (/(verification code.*expired|expired.*verification code)/i.test(message)) {
      return 'This verification code has expired. Please request a new code.';
    }
    if (/(too many failed attempts|max.*attempt|attempts exceeded|invalidated)/i.test(message)) {
      return 'Too many failed attempts. Please request a new code.';
    }
    if (/(incorrect verification code|invalid verification code|code.*remaining)/i.test(message)) {
      return 'Incorrect verification code.';
    }
    if (/(verified|verification successful|email verified)/i.test(message)) {
      return 'Email verified. You can now create a new password.';
    }
  }

  if (flow === 'change-password') {
    if (/(current password|old password).*(incorrect|invalid|wrong)/i.test(message)) {
      return 'Current password is incorrect.';
    }
    if (/(new password|password).*(weak|too short|at least|require|security|length|invalid)/i.test(message)) {
      return 'New password does not meet the required security requirements.';
    }
    if (/(new passwords? do not match|confirm.*password.*match|passwords? do not match)/i.test(message)) {
      return 'New passwords do not match.';
    }
    if (/(password changed|updated successfully)/i.test(message)) {
      return 'Password changed successfully.';
    }
  }

  if (flow === 'general') {
    return 'Something went wrong. Please try again.';
  }

  return message;
}

supabase.auth.onAuthStateChange((event, session) => {
  if (isExtensionRuntime) return;

  if (event === 'SIGNED_OUT') {
    clearRegularUserSession(lastRegularUserId || getStoredRegularUserId());
  } else if (!googleOAuthSessionGate.canPersistRegularUserSession()) {
    return;
  } else if (event === 'INITIAL_SESSION' && !session) {
    localStorage.removeItem(USER_AUTH_STORAGE_KEY);
    lastRegularUserId = null;
  } else if (session?.user && session.access_token) {
    persistRegularUserSession(session, { clearLogoutMarker: event === 'SIGNED_IN' });
    if (event === 'INITIAL_SESSION') {
      setTimeout(() => {
        void validateRestoredRegularUserSession(session.user.id);
      }, 0);
    }
  }
});

if (!isExtensionRuntime && typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const userId = lastRegularUserId || getStoredRegularUserId();
    if (userId) void validateRestoredRegularUserSession(userId);
  });
}

async function validateRestoredRegularUserSession(userId) {
  try {
    const { data: currentData, error: currentError } = await supabase.auth.getSession();
    const currentSession = currentData?.session;
    if (currentError || currentSession?.user?.id !== userId) return;

    const { data: userData, error: userError } = await supabase.auth.getUser(currentSession.access_token);
    if (!userError && userData?.user?.id === userId) return;

    if (isInvalidAuthSessionError(userError)) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshData?.session?.user?.id === userId && !refreshError) return;
      if (isInvalidAuthSessionError(refreshError)) {
        await supabase.auth.signOut({ scope: 'local' });
      }
    }
  } catch {
    // Preserve the cached session during transient network failures; retry when connectivity returns.
  }
}

/**
 * Open the existing Web Application authentication route in a new browser tab.
 */
export function openWebAppAuth(route = '/login') {
  const isExtension = typeof window !== 'undefined' && (
    window.location.protocol === 'chrome-extension:' ||
    window.location.origin.includes('chrome-extension://')
  );

  const cleanRoute = route.startsWith('/') ? route : `/${route}`;
  const baseUrl = isExtension ? APP_BASE_URL : window.location.origin;
  const targetUrl = `${baseUrl}${cleanRoute}`;

  if (globalThis.chrome?.tabs?.create) {
    globalThis.chrome.tabs.create({ url: targetUrl });
  } else if (typeof window !== 'undefined') {
    window.open(targetUrl, '_blank');
  }
}

export const authService = {
  /**
  * Login for regular users and the isolated Super Admin portal.
   */
  login: async (email, password, role = 'user') => {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const desiredRole = role === 'superadmin' ? 'superadmin' : 'user';

    if (desiredRole === 'user' && normalizedEmail === 'admin@test.com') {
      throw new Error('This account is reserved for the Super Admin portal. Use /admin/login instead.');
    }

    if (desiredRole === 'superadmin') {
      const { data, error } = await adminSupabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        // Log failed login attempt
        try {
          await fetch(`${API_BASE_URL}/api/admin/log-login-failed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail }),
          }).catch(() => {});
        } catch {
          // Silently fail; don't break auth flow if audit logging fails
        }
        throw new Error(error.message || 'Authentication failed.');
      }

      if (data.user?.app_metadata?.role !== 'superadmin') {
        await adminSupabase.auth.signOut();
        throw new Error('Access denied. This login is for administrators only.');
      }

      const session = persistSuperAdminSession(data.session);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('voxreview_superadmin_auth_sync', { detail: session }));
      }

      // Log successful login attempt after session is established
      try {
        await fetch(`${API_BASE_URL}/api/admin/log-login-success`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.session?.access_token || ''}`,
          },
        }).catch(() => {});
      } catch {
        // Silently fail; don't break auth flow if audit logging fails
      }

      return { success: true, session, role: 'superadmin' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      throw new Error(error.message || 'Authentication failed.');
    }

    const session = persistRegularUserSession(data.session, { clearLogoutMarker: true });
    return { success: true, session };
  },

  signInWithGoogle: async () => {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/login`
      : undefined;
    googleOAuthSessionGate.block();
    try {
      sessionStorage.setItem(PENDING_GOOGLE_SIGN_IN_STORAGE_KEY, 'true');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) throw new Error(error.message || 'Google sign-in failed.');
      return { success: true, data };
    } catch (error) {
      clearPendingGoogleSignIn();
      googleOAuthSessionGate.release();
      throw error;
    }
  },

  hasPendingGoogleSignIn,

  isGoogleOAuthSessionBlocked: () => googleOAuthSessionGate.isBlocked(),

  completeGoogleSignIn: (callbackUrl) => {
    if (googleCallbackTask) return googleCallbackTask;
    googleCallbackTask = googleOAuthSessionGate.run(() => completeGoogleOAuthSession({
      supabaseClient: supabase,
      callbackUrl,
      hasPendingSignIn: hasPendingGoogleSignIn(),
      persistSession: (session) => persistRegularUserSession(session, {
        clearLogoutMarker: true,
        verifiedOAuthSession: true,
      }),
      clearSession: clearFailedGoogleOAuthSession,
    })).then((result) => {
      clearPendingGoogleSignIn();
      return result;
    }).catch((error) => {
      clearPendingGoogleSignIn();
      googleOAuthSessionGate.release();
      throw error;
    }).finally(() => {
      googleCallbackTask = null;
    });
    return googleCallbackTask;
  },

  signUp: async (email, password, extraProfile = {}) => {
    const normalizedEmail = (email || '').trim().toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          username: extraProfile.username || normalizedEmail.split('@')[0],
          firstName: extraProfile.firstName || '',
          lastName: extraProfile.lastName || '',
          name: extraProfile.username || normalizedEmail.split('@')[0],
        },
      },
    });

    if (error) {
      throw new Error(error.message || 'Sign up failed.');
    }

    if (data.session) {
      const session = persistRegularUserSession(data.session, { clearLogoutMarker: true });
      return { success: true, session, user: data.user };
    }

    return { success: true, user: data.user, session: null };
  },

  /**
   * Request email verification code for new user signup.
   */
  requestSignupVerification: async (signupData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/verification/request-signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signupData),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to send verification code.');
      }

      return result;
    } catch (err) {
      console.error('VoxReview: Request signup verification error:', err);
      throw err;
    }
  },

  /**
   * Verify signup code and finalize account creation.
   */
  verifySignupCode: async ({ email, code }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/verification/verify-signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Verification failed.');
      }

      if (result?.session) {
        persistRegularUserSession(result.session);
      }

      return result;
    } catch (err) {
      console.error('VoxReview: Verify signup code error:', err);
      throw err;
    }
  },

  requestForgotPassword: async (email) => {
    const response = await fetch(`${API_BASE_URL}/api/user/verification/request-forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || 'Unable to process password reset request.');
    return result;
  },

  verifyForgotPassword: async ({ email, code }) => {
    const response = await fetch(`${API_BASE_URL}/api/user/verification/verify-forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || 'Verification failed.');
    return result;
  },

  resetPassword: async ({ resetAuthorization, newPassword, confirmPassword }) => {
    const response = await fetch(`${API_BASE_URL}/api/user/password/reset`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetAuthorization, newPassword, confirmPassword }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || 'Password reset failed.');
    return result;
  },

  /**
   * Log out the given auth identity. Defaults to the regular user session.
   * Admin logout is isolated and must never clear the user extension session.
   */
  logout: async (role = 'user') => {
    if (role === 'superadmin') {
      // Get the current token before clearing session
      const rawSession = localStorage.getItem(SUPERADMIN_AUTH_STORAGE_KEY);
      const sessionData = rawSession ? JSON.parse(rawSession) : null;
      const token = sessionData?.access_token || null;

      // Log the logout event (if token is available)
      if (token) {
        try {
          await fetch(`${API_BASE_URL}/api/admin/log-logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          }).catch(() => {});
        } catch {
          // Silently fail; don't break logout flow if audit logging fails
        }
      }

      await adminSupabase.auth.signOut();
      localStorage.removeItem(SUPERADMIN_AUTH_STORAGE_KEY);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('voxreview_superadmin_auth_sync', { detail: null }));
      }
      return;
    }

    let logoutUserId = lastRegularUserId || getStoredRegularUserId();
    if (isExtensionRuntime && globalThis.chrome?.storage?.local) {
      try {
        const stored = await globalThis.chrome.storage.local.get([EXTENSION_USER_AUTH_STORAGE_KEY]);
        const extensionSession = stored?.[EXTENSION_USER_AUTH_STORAGE_KEY];
        logoutUserId = extensionSession?.user?.id || logoutUserId;

        if (extensionSession?.token) {
          await queueExtensionAuthRevocation(extensionSession);
        }

        if (extensionSession?.token && extensionSession?.refresh_token) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: extensionSession.token,
            refresh_token: extensionSession.refresh_token,
          });

          if (!setSessionError) {
            const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
            if (signOutError) {
              console.warn('VoxReview: Provider sign-out could not be confirmed.', {
                status: signOutError.status || null,
                code: signOutError.code || null,
              });
            } else {
              await removeExtensionAuthRevocation(logoutUserId);
            }
          } else if (isInvalidAuthSessionError(setSessionError)) {
            await removeExtensionAuthRevocation(logoutUserId);
          } else {
            console.warn('VoxReview: Could not restore the extension session for provider sign-out.', {
              status: setSessionError.status || null,
              code: setSessionError.code || null,
            });
          }
        }

      } catch (error) {
        console.warn('VoxReview: Extension provider sign-out failed.', {
          status: error?.status || null,
          code: error?.code || null,
        });
      }

      if (logoutUserId && globalThis.chrome?.runtime?.sendMessage) {
        try {
          await globalThis.chrome.runtime.sendMessage({
            type: 'extensionLogoutSync',
            userId: logoutUserId,
          });
        } catch (error) {
          console.warn('VoxReview: Could not notify website tabs of sign-out.', {
            code: error?.code || null,
          });
        }
      }
    } else {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.warn('VoxReview: Could not verify the matching session for provider sign-out.', {
            status: sessionError.status || null,
            code: sessionError.code || null,
          });
        } else if (isMatchingAuthUser(data?.session, logoutUserId)) {
          const { error } = await supabase.auth.signOut({ scope: 'global' });
          if (error) {
            console.warn('VoxReview: Provider sign-out could not be confirmed.', {
              status: error.status || null,
              code: error.code || null,
            });
          }
        }
      } catch (error) {
        console.warn('VoxReview: Provider sign-out failed.', {
          status: error?.status || null,
          code: error?.code || null,
        });
      }
    }

    if (logoutUserId) {
      try {
        const result = await signOutMatchingLocalSession({
          userId: logoutUserId,
          getSession: () => supabase.auth.getSession(),
          signOut: (options) => supabase.auth.signOut(options),
        });
        if (!result.cleared && result.reason !== 'identity_mismatch') {
          console.warn('VoxReview: Matching local auth session could not be cleared.', {
            reason: result.reason,
          });
        }
      } catch (error) {
        console.warn('VoxReview: Matching local auth session sign-out failed.', {
          code: error?.code || null,
        });
      }
    }

    clearRegularUserSession(logoutUserId);
    if (isExtensionRuntime) await clearStoredExtensionSession(logoutUserId);
  },

  /**
   * Set session object directly (used during session sync)
   */
  setSession: (session) => {
    if (session && session.user && session.user.role === 'user') {
      return persistRegularUserSession(session);
    } else {
      return persistRegularUserSession(null);
    }
  },

  cacheSessionLocally: (session) => {
    if (!session?.user || !session.token) {
      localStorage.removeItem(USER_AUTH_STORAGE_KEY);
      return null;
    }

    const cachedSession = {
      user: normalizeSupabaseUser(session.user),
      token: session.token,
      refresh_token: session.refresh_token || null,
    };
    localStorage.setItem(USER_AUTH_STORAGE_KEY, JSON.stringify(cachedSession));
    return cachedSession;
  },

  clearSessionLocally: async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('VoxReview: Local session sign-out failed:', err?.message || err);
    }
    localStorage.removeItem(USER_AUTH_STORAGE_KEY);
  },

  /**
   * Update the current authenticated regular user's profile details in Supabase Auth & public.users table.
   */
  refreshCurrentUserProfile: async () => {
    try {
      let extensionSession = await readRegularUserExtensionSession({ persistSession: false });
      let accessToken = extensionSession?.token;

      if (!accessToken) {
        const raw = localStorage.getItem(USER_AUTH_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        accessToken = parsed?.token || null;
        if (parsed?.user) {
          extensionSession = parsed;
        }
      }

      if (!accessToken) {
        return null;
      }

      const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.user) {
        return null;
      }

      const nextUser = {
        ...(extensionSession?.user || {}),
        ...result.user,
        id: result.user.id || extensionSession?.user?.id || null,
        email: result.user.email || extensionSession?.user?.email || '',
        username: result.user.username || extensionSession?.user?.username || '',
        firstName: result.user.firstName ?? extensionSession?.user?.firstName ?? '',
        lastName: result.user.lastName ?? extensionSession?.user?.lastName ?? '',
        fullName: result.user.fullName || extensionSession?.user?.fullName || '',
        name: result.user.fullName || result.user.username || extensionSession?.user?.name || '',
        avatarUrl: result.user.avatarUrl !== undefined
          ? result.user.avatarUrl
          : result.user.avatar_url !== undefined
            ? result.user.avatar_url
            : extensionSession?.user?.avatarUrl ?? null,
      };

      return buildProfileUser(
        nextUser,
        extensionSession?.user,
      );
    } catch (err) {
      console.warn('VoxReview: Live profile refresh failed:', err?.message || err);
      return null;
    }
  },

  updateUserProfile: async (updates = {}) => {
    try {
      let extensionSession = await readRegularUserExtensionSession({ persistSession: false });
      let accessToken = extensionSession?.token;

      if (!accessToken) {
        try {
          const raw = localStorage.getItem(USER_AUTH_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          accessToken = parsed?.token || null;
          if (parsed?.user) {
            extensionSession = parsed;
          }
        } catch {
          accessToken = null;
        }
      }

      if (!accessToken) {
        throw new Error('No active user session found. Please log in again.');
      }

      const profileBody = {
        firstName: updates.firstName ?? '',
        lastName: updates.lastName ?? '',
        username: updates.username ?? '',
      };
      if (updates.avatarUrl !== undefined) {
        profileBody.avatarUrl = updates.avatarUrl;
      }

      const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(profileBody),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Profile update failed.');
      }

      const serverUser = result?.user || null;
      const nextUser = serverUser
        ? {
            ...(extensionSession?.user || {}),
            ...serverUser,
            id: serverUser.id || extensionSession?.user?.id || null,
            email: serverUser.email || extensionSession?.user?.email || '',
            username: serverUser.username || updates.username || extensionSession?.user?.username || '',
            firstName: serverUser.firstName ?? updates.firstName ?? extensionSession?.user?.firstName ?? '',
            lastName: serverUser.lastName ?? updates.lastName ?? extensionSession?.user?.lastName ?? '',
            fullName: serverUser.fullName || [serverUser.firstName ?? updates.firstName ?? extensionSession?.user?.firstName ?? '', serverUser.lastName ?? updates.lastName ?? extensionSession?.user?.lastName ?? ''].filter(Boolean).join(' ').trim() || serverUser.username || extensionSession?.user?.name || '',
            name: serverUser.fullName || serverUser.username || extensionSession?.user?.name || '',
            avatarUrl: serverUser.avatarUrl !== undefined ? serverUser.avatarUrl : (extensionSession?.user?.avatarUrl || null),
          }
        : (extensionSession?.user || null);

      if (nextUser) {
        const normalizedUser = normalizeSupabaseUser({
          ...extensionSession,
          user: {
            ...(extensionSession?.user || {}),
            ...nextUser,
            user_metadata: {
              ...(extensionSession?.user?.user_metadata || {}),
              ...(nextUser.user_metadata || {}),
              firstName: nextUser.firstName || '',
              lastName: nextUser.lastName || '',
              username: nextUser.username || '',
              name: nextUser.username || nextUser.name || '',
              custom_avatar_url: nextUser.isCustomAvatar === false ? null : nextUser.avatarUrl || null,
            },
          },
        }.user);

        return { success: true, user: normalizedUser };
      }

      return { success: true, user: null };
    } catch (err) {
      console.error('VoxReview: Profile update error:', err);
      throw err;
    }
  },

  /**
   * Upload a custom user profile picture to Supabase Storage via backend.
   *
   * @param {File} file
   * @returns {Promise<{success: boolean, avatarUrl: string, user: Object}>}
   */
  uploadAvatar: async (file) => {
    try {
      if (!file) {
        throw new Error('Please select an image file to upload.');
      }

      const extensionSession = await readRegularUserExtensionSession({ persistSession: false });
      let accessToken = extensionSession?.token;

      if (!accessToken) {
        try {
          const raw = localStorage.getItem(USER_AUTH_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          accessToken = parsed?.token || null;
        } catch {
          accessToken = null;
        }
      }

      if (!accessToken) {
        throw new Error('No active user session found. Please log in again.');
      }

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch(`${API_BASE_URL}/api/user/profile/avatar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          dataUrl,
          mimeType: file.type,
          fileName: file.name,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result?.error || 'Failed to upload profile picture.');
      }

      const newAvatarUrl = result.avatarUrl;
      const currentUser = extensionSession?.user || authService.getCurrentUser() || {};
      const updatedUser = {
        ...currentUser,
        avatarUrl: newAvatarUrl,
      };

      return { success: true, avatarUrl: newAvatarUrl, user: updatedUser };
    } catch (err) {
      console.error('VoxReview: Avatar upload error:', err);
      throw err;
    }
  },

  /**
   * Remove custom user profile picture, falling back to Google avatar or initial letter.
   *
   * @returns {Promise<{success: boolean, avatarUrl: string|null, user: Object}>}
   */
  removeAvatar: async () => {
    try {
      const extensionSession = await readRegularUserExtensionSession({ persistSession: false });
      let accessToken = extensionSession?.token;

      if (!accessToken) {
        try {
          const raw = localStorage.getItem(USER_AUTH_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          accessToken = parsed?.token || null;
        } catch {
          accessToken = null;
        }
      }

      if (!accessToken) {
        throw new Error('No active user session found. Please log in again.');
      }

      const response = await fetch(`${API_BASE_URL}/api/user/profile/avatar`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result?.error || 'Failed to remove custom profile picture.');
      }

      const fallbackAvatarUrl = result.avatarUrl || null;
      const currentUser = extensionSession?.user || authService.getCurrentUser() || {};
      const updatedUser = {
        ...currentUser,
        avatarUrl: fallbackAvatarUrl,
      };

      return { success: true, avatarUrl: fallbackAvatarUrl, user: updatedUser };
    } catch (err) {
      console.error('VoxReview: Remove avatar error:', err);
      throw err;
    }
  },

  /**
   * Request a 6-digit email verification code.
   */
  requestVerificationCode: async (purpose = 'change_password', currentPassword = null) => {
    try {
      const extensionSession = await readRegularUserExtensionSession();
      let accessToken = extensionSession?.token;

      if (!accessToken) {
        try {
          const raw = localStorage.getItem(USER_AUTH_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          accessToken = parsed?.token || null;
        } catch {
          accessToken = null;
        }
      }

      if (!accessToken) {
        throw new Error('No active user session found. Please log in again.');
      }

      const response = await fetch(`${API_BASE_URL}/api/user/verification/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ purpose, currentPassword }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to send verification code.');
      }

      return result;
    } catch (err) {
      console.error('VoxReview: Request verification code error:', err);
      throw err;
    }
  },

  /**
   * Verify an entered 6-digit verification code.
   */
  verifyCode: async (code, purpose = 'change_password') => {
    try {
      const extensionSession = await readRegularUserExtensionSession();
      let accessToken = extensionSession?.token;

      if (!accessToken) {
        try {
          const raw = localStorage.getItem(USER_AUTH_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          accessToken = parsed?.token || null;
        } catch {
          accessToken = null;
        }
      }

      if (!accessToken) {
        throw new Error('No active user session found. Please log in again.');
      }

      const response = await fetch(`${API_BASE_URL}/api/user/verification/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ purpose, code }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Verification failed.');
      }

      return result;
    } catch (err) {
      console.error('VoxReview: Verify code error:', err);
      throw err;
    }
  },

  /**
   * Change password for current authenticated user using Supabase Auth.
   */
  changePassword: async (newPassword, currentPassword = null) => {
    try {
      const extensionSession = await readRegularUserExtensionSession();
      const accessToken = extensionSession?.token;

      if (accessToken) {
        const response = await fetch(`${API_BASE_URL}/api/user/password`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            currentPassword: currentPassword || '',
            newPassword: newPassword || '',
          }),
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result?.error || 'Password update failed.');
        }

        return { success: true };
      }

      throw new Error('No active user session found. Please log in again.');
    } catch (err) {
      console.error('VoxReview: Change password error:', err);
      throw err;
    }
  },

  /**
   * Get current authenticated regular user object or null if guest.
   */
  getCurrentUser: () => {
    try {
      const raw = localStorage.getItem(USER_AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.user && parsed?.token && !isExpiredAccessToken(parsed.token)) {
          return parsed.user;
        }
      }

      return null;
    } catch {
      return null;
    }
  },

  validateExtensionSession,

  restoreSession: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('VoxReview: getSession error', error.message);
        return null;
      }

      if (!session || !session.user) {
        return null;
      }

      return persistRegularUserSession(session);
    } catch (err) {
      console.warn('VoxReview: restoreSession failed', err?.message || err);
      return null;
    }
  },

  verifySuperAdminSession: async () => {
    try {
      const { data: sessionData, error: sessionError } = await adminSupabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        return null;
      }

      const { data: userData, error: userError } = await adminSupabase.auth.getUser();
      if (userError || userData.user?.app_metadata?.role !== 'superadmin') {
        await adminSupabase.auth.signOut();
        localStorage.removeItem(SUPERADMIN_AUTH_STORAGE_KEY);
        return null;
      }

      const session = persistSuperAdminSession({
        ...sessionData.session,
        user: userData.user,
      });
      return session?.user || null;
    } catch {
      localStorage.removeItem(SUPERADMIN_AUTH_STORAGE_KEY);
      return null;
    }
  },

  getSuperAdminAccessToken: async () => {
    const { data, error } = await adminSupabase.auth.getSession();
    if (error || data.session?.user?.app_metadata?.role !== 'superadmin') {
      return null;
    }
    return data.session.access_token;
  },

  /**
   * Get current authenticated super admin object or null.
   */
  getCurrentSuperAdminUser: () => {
    try {
      const raw = localStorage.getItem(SUPERADMIN_AUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.user || null;
    } catch {
      return null;
    }
  },

  /**
   * Get role of current user: 'user' | 'superadmin' | 'guest'
   */
  checkRole: () => {
    const adminUser = authService.getCurrentSuperAdminUser();
    if (adminUser?.role === 'superadmin') {
      return 'superadmin';
    }

    const user = authService.getCurrentUser();
    return user?.role || 'guest';
  },

  /**
   * Check if a regular user is logged in.
   */
  isAuthenticated: () => {
    return !!authService.getCurrentUser();
  },

  /**
   * Check if a super admin is logged in to the admin-only dashboard.
   */
  isSuperAdminAuthenticated: () => {
    return !!authService.getCurrentSuperAdminUser();
  },
};

export default authService;
