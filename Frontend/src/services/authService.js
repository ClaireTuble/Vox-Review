// Mock Authentication Service for VoxReview
// Ready to be replaced with Supabase / Backend API integration later.

const USER_AUTH_STORAGE_KEY = 'user_auth_session';
const SUPERADMIN_AUTH_STORAGE_KEY = 'superadmin_auth_session';
const EXTENSION_USER_AUTH_STORAGE_KEY = 'voxreview_auth_session';

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

  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url: targetUrl });
  } else if (typeof window !== 'undefined') {
    window.open(targetUrl, '_blank');
  }
}

export const authService = {
  /**
   * Log in a user or super-admin with mock credentials.
   * The role is explicit at the call site so the admin route never reuses
   * a user-only session slot.
   */
  login: async (email, password, role = 'user', extraProfile = {}) => {
    await new Promise((resolve) => setTimeout(resolve, 400));

    const normalizedEmail = (email || '').trim().toLowerCase();
    const desiredRole = role === 'superadmin' ? 'superadmin' : 'user';

    if (desiredRole === 'user' && normalizedEmail === 'admin@test.com') {
      throw new Error('This account is reserved for the Super Admin portal. Use /admin/login instead.');
    }

    let session = null;

    if (desiredRole === 'superadmin') {
      session = {
        user: {
          id: 'adm_mock_999',
          email: 'admin@test.com',
          username: 'superadmin',
          fullName: 'Platform SuperAdmin',
          name: 'superadmin',
          role: 'superadmin',
        },
        token: 'mock_jwt_token_admin_999',
      };

      localStorage.setItem(SUPERADMIN_AUTH_STORAGE_KEY, JSON.stringify(session));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('voxreview_superadmin_auth_sync', { detail: session }));
      }

      return { success: true, session };
    }

    const derivedUsername = extraProfile.username || normalizedEmail.split('@')[0] || 'user';
    const derivedFullName = extraProfile.fullName || '';

    if (normalizedEmail === 'user@test.com') {
      session = {
        user: {
          id: 'usr_mock_123',
          email: 'user@test.com',
          username: extraProfile.username || 'claire123',
          firstName: extraProfile.firstName || 'Claire',
          middleInitial: extraProfile.middleInitial || 'V',
          lastName: extraProfile.lastName || 'Tuble',
          name: extraProfile.username || 'claire123',
          role: 'user',
        },
        token: 'mock_jwt_token_user_123',
      };
    } else {
      session = {
        user: {
          id: `usr_demo_${Date.now()}`,
          email: email,
          username: derivedUsername,
          firstName: extraProfile.firstName || derivedUsername,
          middleInitial: extraProfile.middleInitial || '',
          lastName: extraProfile.lastName || '',
          name: derivedUsername,
          role: 'user',
        },
        token: 'mock_jwt_token_demo',
      };
    }

    localStorage.setItem(USER_AUTH_STORAGE_KEY, JSON.stringify(session));

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: session }).catch(() => { });
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('voxreview_auth_sync', { detail: session }));
    }

    return { success: true, session };
  },

  /**
   * Log out the given auth identity. Defaults to the regular user session.
   * Admin logout is isolated and must never clear the user extension session.
   */
  logout: (role = 'user') => {
    if (role === 'superadmin') {
      localStorage.removeItem(SUPERADMIN_AUTH_STORAGE_KEY);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('voxreview_superadmin_auth_sync', { detail: null }));
      }
      return;
    }

    localStorage.removeItem(USER_AUTH_STORAGE_KEY);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: null }).catch(() => { });
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
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: session }).catch(() => { });
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
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [EXTENSION_USER_AUTH_STORAGE_KEY]: newSession }).catch(() => { });
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
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.user || null;
    } catch {
      return null;
    }
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
