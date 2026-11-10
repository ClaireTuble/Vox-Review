import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authServiceSource = await readFile(new URL('./authService.js', import.meta.url), 'utf8');
const protectedRouteSource = await readFile(
  new URL('../components/ProtectedRoute.jsx', import.meta.url),
  'utf8',
);

test('password-only Super Admin login is rejected', () => {
  const login = authServiceSource.slice(
    authServiceSource.indexOf('  login: async (email, password, role ='),
    authServiceSource.indexOf('  signInWithGoogle:'),
  );
  assert.match(login, /desiredRole === 'superadmin'[\s\S]*?must sign in through the OTP verification flow/);
  assert.doesNotMatch(login, /adminSupabase\.auth\.signInWithPassword/);
});

test('OTP verification binds registration to the Supabase session established for that attempt', () => {
  const otpFlow = authServiceSource.slice(
    authServiceSource.indexOf('  verifySuperAdminTwoFactor: async'),
    authServiceSource.indexOf('  login: async (email, password, role ='),
  );
  assert.ok(otpFlow.indexOf('signInWithPassword') < otpFlow.indexOf('/api/admin/auth/verify-otp'));
  assert.match(otpFlow, /Authorization: `Bearer \$\{data\.session\.access_token\}`/);
  assert.match(otpFlow, /JSON\.stringify\(\{ challengeToken, otp \}\)/);
  assert.match(otpFlow, /result\.user\?\.id !== sessionUser\.id/);
  assert.ok(otpFlow.indexOf('result.user?.id !== sessionUser.id') < otpFlow.indexOf('persistSuperAdminSession(data.session)'));
});

test('session restoration requires backend OTP-session validation and fails closed', () => {
  const verification = authServiceSource.slice(
    authServiceSource.indexOf('  verifySuperAdminSession: async'),
    authServiceSource.indexOf('  changeSuperAdminPassword:'),
  );
  assert.match(verification, /\/api\/admin\/auth\/session/);
  assert.match(verification, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(verification, /verification\.user\?\.id !== userData\.user\.id/);
  assert.match(protectedRouteSource, /authService\.verifySuperAdminSession\(\)/);
  assert.match(protectedRouteSource, /Retry verification/);
});

test('Super Admin logout reports server revocation failure after local cleanup', () => {
  const logout = authServiceSource.slice(
    authServiceSource.indexOf('  logout: async (role ='),
    authServiceSource.indexOf('  setSession:'),
  );
  assert.match(logout, /\/api\/admin\/log-logout/);
  assert.match(logout, /if \(!response\.ok \|\| !result\.success\)/);
  assert.match(logout, /server-side session revocation failed/);
  assert.ok(logout.indexOf('localStorage.removeItem(SUPERADMIN_AUTH_STORAGE_KEY)') < logout.indexOf('if (revocationError)'));
});

test('password change uses authenticated OTP endpoints and explicit session choice', () => {
  assert.match(authServiceSource, /\/api\/admin\/auth\/password-change\/request-otp/);
  assert.match(authServiceSource, /\/api\/admin\/auth\/password-change\/verify-otp/);
  assert.match(authServiceSource, /\/api\/admin\/auth\/password-change\/confirm/);
  assert.match(authServiceSource, /\/api\/admin\/auth\/password-change\/session-choice/);
  assert.match(authServiceSource, /Authorization: `Bearer \$\{token\}`/);
});
