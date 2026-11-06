import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const modalSource = await readFile(new URL('./LogoutConfirmationModal.jsx', import.meta.url), 'utf8');
const dashboardSource = await readFile(
  new URL('../SuperAdmin/pages/SuperAdminDashboard.jsx', import.meta.url),
  'utf8',
);
const authServiceSource = await readFile(new URL('../services/authService.js', import.meta.url), 'utf8');

test('logout modal displays failures and prevents duplicate submission while pending', () => {
  assert.match(modalSource, /error && <p role="alert"[^>]*>\{error\}<\/p>/);
  assert.match(modalSource, /disabled=\{submitting\}/);
  assert.match(modalSource, /\{submitting \? 'Signing out…' : 'Log Out'\}/);
  assert.match(dashboardSource, /submitting=\{logoutSubmitting\}\s+error=\{logoutError\}/);
  assert.match(dashboardSource, /finally \{\s*setLogoutSubmitting\(false\);/);
});

test('rejected explicit logout keeps the dialog open for retry and only success navigates', () => {
  const explicitLogoutSource = dashboardSource.slice(
    dashboardSource.indexOf('const confirmSignOut = async () =>'),
    dashboardSource.indexOf('const renderActivePage = () =>'),
  );
  assert.match(
    explicitLogoutSource,
    /try \{\s*await authService\.logout\('superadmin'\);\s*setShowLogoutConfirmation\(false\);\s*navigate\(/,
  );
  assert.match(
    explicitLogoutSource,
    /catch \(error\) \{\s*setLogoutError\(error\.message \|\| 'Could not sign out of this session\.'\);/,
  );
  assert.doesNotMatch(explicitLogoutSource, /catch[\s\S]*?setShowLogoutConfirmation\(false\)/);
});

test('Super Admin local mirror clears only after provider logout resolves', () => {
  const start = authServiceSource.indexOf("if (role === 'superadmin')");
  const end = authServiceSource.indexOf('let logoutUserId', start);
  const superAdminLogoutSource = authServiceSource.slice(start, end);
  assert.match(
    superAdminLogoutSource,
    /await signOutCurrentSuperAdminSession\(adminSupabase\.auth\);\s*localStorage\.removeItem\(SUPERADMIN_AUTH_STORAGE_KEY\)/,
  );
});
