// Mock Authentication Service for VoxReview
// Ready to be replaced with Supabase / Backend API integration later.

const AUTH_STORAGE_KEY = 'voxreview_auth_session';

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
   * Log in user with mock credentials
   * Test Accounts:
   *  - user@test.com (role: 'user')
   *  - admin@test.com (role: 'superadmin')
   */
  login: async (email, password) => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 400));

    const normalizedEmail = (email || '').trim().toLowerCase();
    let session = null;

    if (normalizedEmail === 'user@test.com') {
      session = {
        user: {
          id: 'usr_mock_123',
          email: 'user@test.com',
          name: 'Extension Analyst',
          role: 'user',
        },
        token: 'mock_jwt_token_user_123',
      };
    } else if (normalizedEmail === 'admin@test.com') {
      session = {
        user: {
          id: 'adm_mock_999',
          email: 'admin@test.com',
          name: 'Platform SuperAdmin',
          role: 'superadmin',
        },
        token: 'mock_jwt_token_admin_999',
      };
    } else {
      session = {
        user: {
          id: `usr_demo_${Date.now()}`,
          email: email,
          name: email.split('@')[0] || 'User',
          role: 'user',
        },
        token: 'mock_jwt_token_demo',
      };
    }

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));

    // Synchronize auth session to chrome.storage.local for extension sync
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ voxreview_auth_session: session }).catch(() => {});
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('voxreview_auth_sync', { detail: session }));
    }

    return { success: true, session };
  },

  /**
   * Log out current user
   */
  logout: () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ voxreview_auth_session: null }).catch(() => {});
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('voxreview_auth_sync', { detail: null }));
    }
  },

  /**
   * Set session object directly (used during session sync)
   */
  setSession: (session) => {
    if (session && session.user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ voxreview_auth_session: session }).catch(() => {});
      }
    } else {
      authService.logout();
    }
  },

  /**
   * Get current authenticated user object or null if guest
   */
  getCurrentUser: () => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
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
    const user = authService.getCurrentUser();
    return user?.role || 'guest';
  },

  /**
   * Check if user is logged in
   */
  isAuthenticated: () => {
    return !!authService.getCurrentUser();
  },
};

export default authService;
