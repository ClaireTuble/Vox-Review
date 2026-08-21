import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('VoxReview: Supabase env vars are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

const authOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
};

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: authOptions,
});

export const adminSupabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    ...authOptions,
    storageKey: 'voxreview_superadmin_auth',
  },
});
