import { createClient } from '@supabase/supabase-js';
import { logGoogleOAuthDiag } from '../services/authSessionSync.js';
import { getSupabaseConfigurationError } from './supabaseConfiguration.js';
import { createChromeAuthStorage } from './extensionAuthStorage.js';
import { createCoordinatedAuthFetch } from './coordinatedAuthFetch.js';

const configuredSupabaseUrl = import.meta.env?.VITE_SUPABASE_URL ||
  globalThis.process?.env?.VITE_SUPABASE_URL;
const configuredSupabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  globalThis.process?.env?.VITE_SUPABASE_ANON_KEY;
export const supabaseConfigurationError = getSupabaseConfigurationError(
  configuredSupabaseUrl,
  configuredSupabaseAnonKey,
);
export const supabaseUrl = supabaseConfigurationError ? null : configuredSupabaseUrl.trim();
export const supabaseAnonKey = supabaseConfigurationError ? null : configuredSupabaseAnonKey.trim();

if (supabaseConfigurationError) {
  console.error(`VoxReview configuration error: ${supabaseConfigurationError}`);
}

const authOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
};
const extensionRuntime = globalThis.window?.location?.protocol === 'chrome-extension:';
const extensionLocalStorage = globalThis.chrome?.storage?.local;
const extensionStorage = extensionRuntime
  ? createChromeAuthStorage({
      get: (keys) => extensionLocalStorage.get(keys),
      set: async (value) => {
        const session = value['voxreview_auth_session'];
        const result = await globalThis.chrome.runtime.sendMessage({
          type: 'persistAuthSession',
          session,
        });
        if (!result?.ok || !result.persisted) {
          throw new Error('The latest extension authentication session could not be persisted.');
        }
      },
      remove: async (keys) => {
        const stored = await extensionLocalStorage.get(keys);
        const session = stored?.['voxreview_auth_session'];
        if (!session?.user?.id) return;
        const result = await globalThis.chrome.runtime.sendMessage({
          type: 'clearAuthSession',
          userId: session.user.id,
        });
        if (!result?.ok) {
          throw new Error('The extension authentication session could not be cleared.');
        }
      },
    })
  : undefined;
const authFetch = createCoordinatedAuthFetch({ extensionRuntime });

logGoogleOAuthDiag('supabase-auth-config', {
  persistSession: authOptions.persistSession,
  autoRefreshToken: authOptions.autoRefreshToken,
  detectSessionInUrl: authOptions.detectSessionInUrl,
  flowTypeConfigured: false,
});

const clientUrl = supabaseUrl || 'https://invalid.invalid';
const clientKey = supabaseAnonKey || 'unconfigured-public-anon-key';
const globalOptions = supabaseConfigurationError
  ? {
      fetch: async () => {
        throw new Error(supabaseConfigurationError);
      },
    }
  : { fetch: authFetch };

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    ...authOptions,
    ...(extensionRuntime
      ? {
          storage: extensionStorage,
          storageKey: 'voxreview_auth_session',
        }
      : {}),
  },
  global: globalOptions,
});

export const adminSupabase = createClient(clientUrl, clientKey, {
  auth: {
    ...authOptions,
    storageKey: 'voxreview_superadmin_auth',
  },
  global: globalOptions,
});
