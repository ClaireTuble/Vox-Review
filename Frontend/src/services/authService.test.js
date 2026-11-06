import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const authServiceSource = await readFile(new URL('./authService.js', import.meta.url), 'utf8');

test('a null INITIAL_SESSION preserves the mirrored session during initialization', () => {
  const listenerStart = authServiceSource.indexOf('supabase.auth.onAuthStateChange');
  const listenerSource = authServiceSource.slice(listenerStart);
  const missingSessionStart = listenerSource.indexOf("event === 'INITIAL_SESSION' && !session");
  const missingSessionEnd = listenerSource.indexOf('} else if (session?.user', missingSessionStart);
  const missingSessionHandler = listenerSource.slice(missingSessionStart, missingSessionEnd);

  assert.ok(missingSessionStart >= 0);
  assert.match(missingSessionHandler, /preserving the local session mirror/);
  assert.doesNotMatch(
    missingSessionHandler,
    /localStorage\.removeItem|clearRegularUserSession|dispatchEvent/,
  );
});

test('an explicit SIGNED_OUT still clears the matching regular-user mirror', () => {
  const listenerStart = authServiceSource.indexOf('supabase.auth.onAuthStateChange');
  const listenerSource = authServiceSource.slice(listenerStart);

  assert.match(
    listenerSource,
    /if \(event === 'SIGNED_OUT'\) \{\s*clearRegularUserSession\(lastRegularUserId \|\| getStoredRegularUserId\(\)\)/,
  );
});

test('manual Super Admin logout is local while cross-device revocation remains explicit', () => {
  const logoutStart = authServiceSource.indexOf("logout: async (role = 'user') =>");
  const logoutEnd = authServiceSource.indexOf('let logoutUserId', logoutStart);
  const logoutSource = authServiceSource.slice(logoutStart, logoutEnd);

  assert.match(logoutSource, /signOutCurrentSuperAdminSession\(adminSupabase\.auth\)/);
  assert.match(
    authServiceSource,
    /await revokeSuperAdminRefreshTokens\(adminSupabase\.auth\);[\s\S]*?localStorage\.removeItem\(SUPERADMIN_AUTH_STORAGE_KEY\);[\s\S]*?voxreview_superadmin_auth_sync/,
  );
});
