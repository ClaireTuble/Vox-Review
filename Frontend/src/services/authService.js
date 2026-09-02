import { adminSupabase, supabase } from '../lib/supabase.js';

const USER_AUTH_STORAGE_KEY = 'user_auth_session';
const SUPERADMIN_AUTH_STORAGE_KEY = 'superadmin_auth_session';
const EXTENSION_USER_AUTH_STORAGE_KEY = 'voxreview_auth_session';

function persistSuperAdminSession(session) {
  if (!session?.user) {
    localStorage.removeItem(SUPERADMIN_AUTH_STORAGE_KEY);
    return null;
  }

  localStorage.setItem(SUPERADMIN_AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

function normalizeSupabaseUser(user) {
  if (!user) return null;

  const metadata = user.user_metadata || user;
  const firstName = metadata.firstName || '';
  const lastName = metadata.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    id: user.id,
    email: user.email,
    username: metadata.username || metadata.name || user.email?.split('@')[0] || 'user',
    firstName,
    middleInitial: metadata.middleInitial || '',
    lastName,
    name: fullName || metadata.username || metadata.name || user.email?.split('@')[0] || 'user',
    role: 'user',
  };
}

function syncExtensionAuthSession(session) {
  const nextSession = session && session.user && session.token ? session : null;

  if (globalThis.chrome?.storage?.local) {
    if (!nextSession) {
      globalThis.chrome.storage.local.remove([EXTENSION_USER_AUTH_STORAGE_KEY]).catch(() => { });
    } else {
      globalThis.chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: nextSession }).catch(() => { });
    }
  } else if (globalThis.chrome?.runtime?.sendMessage) {
    globalThis.chrome.runtime.sendMessage({
      type: 'userAuthSync',
      session: nextSession,
    }).catch(() => { });
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('voxreview_auth_sync', { detail: nextSession }));
  }

  return nextSession;
}

function clearRegularUserSession() {
  localStorage.removeItem(USER_AUTH_STORAGE_KEY);
  syncExtensionAuthSession(null);
  return null;
}

function persistRegularUserSession(session) {
  if (!session || !session.user) {
    return clearRegularUserSession();
  }

  const normalizedUser = normalizeSupabaseUser(session.user);
  const normalizedSession = {
    user: normalizedUser,
    token: session.access_token || session.token || null,
    refresh_token: session.refresh_token || null,
  };

  localStorage.setItem(USER_AUTH_STORAGE_KEY, JSON.stringify(normalizedSession));

  const syncedSession = syncExtensionAuthSession(normalizedSession);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('voxreview_auth_sync', { detail: syncedSession }));
  }

  return normalizedSession;
}

function isExpiredAccessToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return !payload.exp || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

async function readRegularUserExtensionSession() {
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
            return persistRegularUserSession({
              user: data.user,
              token: extensionSession.token,
              refresh_token: extensionSession.refresh_token,
            });
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
              return persistRegularUserSession({
                user: data.user,
                token: parsed.token,
                refresh_token: parsed.refresh_token,
              });
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
      return persistRegularUserSession(data.session);
    }
  } catch (error) {
    console.warn('VoxReview: Session synchronization failed:', error?.message || error);
  }

  return null;
}

const isExtensionRuntime = typeof window !== 'undefined' && window.location.protocol === 'chrome-extension:';

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

  if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
    persistRegularUserSession(null);
  } else if (session?.user && session.access_token) {
    persistRegularUserSession(session);
  }
});

/**
 * Open the existing Web Application authentication route in a new browser tab.
 */
export function openWebAppAuth(route = '/login') {
  const isExtension = typeof window !== 'undefined' && (
    window.location.protocol === 'chrome-extension:' ||
    window.location.origin.includes('chrome-extension://')
  );

  const cleanRoute = route.startsWith('/') ? route : `/${route}`;
  const baseUrl = isExtension ? 'http://localhost:5173' : window.location.origin;
  const targetUrl = `${baseUrl}/#${cleanRoute}`;

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
          await fetch('http://localhost:5000/api/admin/log-login-failed', {
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
        await fetch('http://localhost:5000/api/admin/log-login-success', {
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

    const session = persistRegularUserSession(data.session);
    return { success: true, session };
  },

  signInWithGoogle: async () => {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/login`
      : undefined;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (error) {
      throw new Error(error.message || 'Google sign-in failed.');
    }

    return { success: true, data };
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
      const session = persistRegularUserSession(data.session);
      return { success: true, session, user: data.user };
    }

    return { success: true, user: data.user, session: null };
  },

  /**
   * Request email verification code for new user signup.
   */
  requestSignupVerification: async (signupData) => {
    try {
      const response = await fetch('http://localhost:5000/api/user/verification/request-signup', {
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
      const response = await fetch('http://localhost:5000/api/user/verification/verify-signup', {
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
    const response = await fetch('http://localhost:5000/api/user/verification/request-forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || 'Unable to process password reset request.');
    return result;
  },

  verifyForgotPassword: async ({ email, code }) => {
    const response = await fetch('http://localhost:5000/api/user/verification/verify-forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || 'Verification failed.');
    return result;
  },

  resetPassword: async ({ resetAuthorization, newPassword, confirmPassword }) => {
    const response = await fetch('http://localhost:5000/api/user/password/reset', {
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
          await fetch('http://localhost:5000/api/admin/log-logout', {
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

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Supabase signOut failed:', err?.message || err);
    }

    clearRegularUserSession();
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

  /**
   * Update the current authenticated regular user's profile details in Supabase Auth & public.users table.
   */
  refreshCurrentUserProfile: async () => {
    try {
      let extensionSession = await readRegularUserExtensionSession();
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

      const response = await fetch('http://localhost:5000/api/user/profile', {
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
      };

      const normalizedUser = normalizeSupabaseUser({
        id: nextUser.id,
        email: nextUser.email,
        user_metadata: {
          firstName: nextUser.firstName || '',
          lastName: nextUser.lastName || '',
          username: nextUser.username || '',
          name: nextUser.name || nextUser.username || '',
        },
      });

      const refreshedSession = {
        ...(extensionSession || {}),
        token: accessToken,
        user: normalizedUser,
      };

      persistRegularUserSession(refreshedSession);
      return normalizedUser;
    } catch (err) {
      console.warn('VoxReview: Live profile refresh failed:', err?.message || err);
      return null;
    }
  },

  updateUserProfile: async (updates = {}) => {
    try {
      let extensionSession = await readRegularUserExtensionSession();
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

      const response = await fetch('http://localhost:5000/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          firstName: updates.firstName ?? '',
          lastName: updates.lastName ?? '',
          username: updates.username ?? '',
        }),
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
            },
          },
        }.user);

        const refreshedSession = {
          ...(extensionSession || {}),
          token: accessToken,
          user: normalizedUser,
        };

        persistRegularUserSession(refreshedSession);
        return { success: true, user: normalizedUser };
      }

      return { success: true, user: null };
    } catch (err) {
      console.error('VoxReview: Profile update error:', err);
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

      const response = await fetch('http://localhost:5000/api/user/verification/request', {
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

      const response = await fetch('http://localhost:5000/api/user/verification/verify', {
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
        const response = await fetch('http://localhost:5000/api/user/password', {
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
        if (parsed?.user) return parsed.user;
      }

      return null;
    } catch {
      return null;
    }
  },

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
