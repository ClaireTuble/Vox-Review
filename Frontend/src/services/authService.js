// Temporary Mock Authentication Service for VoxReview
// Ready to be replaced with Supabase / Backend API integration later.

const AUTH_STORAGE_KEY = 'voxreview_auth_session';

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

    if (normalizedEmail === 'user@test.com') {
      const session = {
        user: {
          id: 'usr_mock_123',
          email: 'user@test.com',
          name: 'Extension Analyst',
          role: 'user',
        },
        token: 'mock_jwt_token_user_123',
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      return { success: true, session };
    }

    if (normalizedEmail === 'admin@test.com') {
      const session = {
        user: {
          id: 'adm_mock_999',
          email: 'admin@test.com',
          name: 'Platform SuperAdmin',
          role: 'superadmin',
        },
        token: 'mock_jwt_token_admin_999',
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      return { success: true, session };
    }

    // Default fallback for demo flexibility if any other credentials entered
    // Defaults to 'user' role
    const session = {
      user: {
        id: `usr_demo_${Date.now()}`,
        email: email,
        name: email.split('@')[0] || 'User',
        role: 'user',
      },
      token: 'mock_jwt_token_demo',
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    return { success: true, session };
  },

  /**
   * Log out current user
   */
  logout: () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
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
