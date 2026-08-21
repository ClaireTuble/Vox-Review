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

  return {
    id: user.id,
    email: user.email,
    username: user.user_metadata?.username || user.user_metadata?.name || user.email?.split('@')[0] || 'user',
    firstName: user.user_metadata?.firstName || '',
    middleInitial: user.user_metadata?.middleInitial || '',
    lastName: user.user_metadata?.lastName || '',
    name: user.user_metadata?.username || user.user_metadata?.name || user.email?.split('@')[0] || 'user',
    role: 'user',
  };
}

function persistRegularUserSession(session) {
  if (!session || !session.user) {
    localStorage.removeItem(USER_AUTH_STORAGE_KEY);
    if (globalThis.chrome?.storage?.local) {
      globalThis.chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: null }).catch(() => { });
    }
    return null;
  }

  const normalizedUser = normalizeSupabaseUser(session.user);
  const normalizedSession = {
    user: normalizedUser,
    token: session.access_token || session.token || null,
  };

  localStorage.setItem(USER_AUTH_STORAGE_KEY, JSON.stringify(normalizedSession));

  if (globalThis.chrome?.storage?.local) {
    globalThis.chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: normalizedSession }).catch(() => { });
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('voxreview_auth_sync', { detail: normalizedSession }));
  }

  return normalizedSession;
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
   * Log out the given auth identity. Defaults to the regular user session.
   * Admin logout is isolated and must never clear the user extension session.
   */
  logout: async (role = 'user') => {
    if (role === 'superadmin') {
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

    localStorage.removeItem(USER_AUTH_STORAGE_KEY);
      if (globalThis.chrome?.storage?.local) {
        globalThis.chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: null }).catch(() => { });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('voxreview_auth_sync', { detail: null }));
    }
  },

  /**
   * Set session object directly (used during session sync)
   */
  setSession: (session) => {
    if (session && session.user && session.user.role === 'user') {
      localStorage.setItem(USER_AUTH_STORAGE_KEY, JSON.stringify(session));
      if (globalThis.chrome?.storage?.local) {
        globalThis.chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: session }).catch(() => { });
      }
    } else {
      authService.logout('user');
    }
  },

  /**
   * Update the current authenticated regular user's profile details.
   */
  updateUserProfile: (updates = {}) => {
    try {
      const raw = localStorage.getItem(USER_AUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const updatedUser = {
        ...parsed.user,
        ...updates,
        name: updates.username || parsed.user.username || parsed.user.name,
      };
      const newSession = {
        ...parsed,
        user: updatedUser,
      };
      localStorage.setItem(USER_AUTH_STORAGE_KEY, JSON.stringify(newSession));
      if (globalThis.chrome?.storage?.local) {
        globalThis.chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: newSession }).catch(() => { });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('voxreview_auth_sync', { detail: newSession }));
      }
      return updatedUser;
    } catch (err) {
      console.error('VoxReview: Profile update error', err);
      return null;
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
