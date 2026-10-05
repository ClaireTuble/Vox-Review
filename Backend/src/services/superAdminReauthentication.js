import { createClient } from "@supabase/supabase-js";

export function createSuperAdminReauthenticator({
  createAuthClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      const error = new Error("Super Admin re-authentication is unavailable.");
      error.statusCode = 503;
      throw error;
    }
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  },
} = {}) {
  return async function verifySuperAdminPassword(authUser, password) {
    if (!authUser?.id || !authUser?.email || typeof password !== "string" || !password.trim()) {
      const error = new Error("Enter your Super Admin password to confirm this action.");
      error.statusCode = 400;
      throw error;
    }

    let result;
    try {
      result = await createAuthClient().auth.signInWithPassword({
        email: authUser.email,
        password,
      });
    } catch {
      const error = new Error("Security confirmation could not be verified. Please try again.");
      error.statusCode = 503;
      throw error;
    }

    if (
      result.error ||
      result.data?.user?.id !== authUser.id ||
      result.data?.user?.app_metadata?.role !== "superadmin"
    ) {
      const error = new Error("Super Admin password is incorrect.");
      error.statusCode = 403;
      throw error;
    }

    return true;
  };
}

export const verifySuperAdminPassword = createSuperAdminReauthenticator();
