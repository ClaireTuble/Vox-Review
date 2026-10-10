import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isExpiredAccessToken,
  isInvalidAuthSessionError,
  isMatchingAuthUser,
  getRegularUserAfterAuthSync,
  signOutMatchingLocalSession,
} from './authSessionSync.js';

function createToken(expirySeconds) {
  const payload = btoa(JSON.stringify({ exp: expirySeconds }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${payload}.signature`;
}

test('logout identity matching preserves another user session', () => {
  const session = { user: { id: 'user-b' } };

  assert.equal(isMatchingAuthUser(session, 'user-b'), true);
  assert.equal(isMatchingAuthUser(session, 'user-a'), false);
  assert.equal(isMatchingAuthUser(session, null), false);
});

test('expired and malformed access tokens are not treated as active sessions', () => {
  assert.equal(isExpiredAccessToken(createToken(99), 100_000), true);
  assert.equal(isExpiredAccessToken(createToken(101), 100_000), false);
  assert.equal(
    isExpiredAccessToken('header.eyJleHAiOjEwMSwic3ViIjoi8J-YgCJ9.signature', 100_000),
    false,
  );
  assert.equal(isExpiredAccessToken('not-a-jwt', 100_000), true);
});

test('only provider authentication rejection is considered an invalid session', () => {
  assert.equal(isInvalidAuthSessionError({ status: 401 }), true);
  assert.equal(isInvalidAuthSessionError({ status: 403 }), true);
  assert.equal(isInvalidAuthSessionError({ status: 503 }), false);
  assert.equal(isInvalidAuthSessionError(new TypeError('network unavailable')), false);
});

test('local logout clears only the matching user session', async () => {
  let signOutCount = 0;
  const result = await signOutMatchingLocalSession({
    userId: 'user-a',
    getSession: async () => ({
      data: { session: { user: { id: 'user-b' } } },
      error: null,
    }),
    signOut: async () => {
      signOutCount += 1;
      return { error: null };
    },
  });

  assert.deepEqual(result, { cleared: false, reason: 'identity_mismatch' });
  assert.equal(signOutCount, 0);
});

test('local logout clears the matching session after remote revocation cannot be used', async () => {
  let signOutOptions;
  const result = await signOutMatchingLocalSession({
    userId: 'user-a',
    getSession: async () => ({
      data: { session: { user: { id: 'user-a' } } },
      error: null,
    }),
    signOut: async (options) => {
      signOutOptions = options;
      return { error: null };
    },
  });

  assert.deepEqual(result, { cleared: true, reason: null });
  assert.deepEqual(signOutOptions, { scope: 'local' });
});

test('regular-user logout sync updates UI state immediately for the matching user', () => {
  const result = getRegularUserAfterAuthSync(
    { detail: { action: 'signed_out', userId: 'user-a' } },
    { id: 'user-a' },
    () => null,
  );

  assert.deepEqual(result, { handled: true, user: null });
});

test('regular-user logout sync leaves a different current user unchanged', () => {
  const currentUser = { id: 'user-b' };
  const result = getRegularUserAfterAuthSync(
    { detail: { action: 'signed_out', userId: 'user-a' } },
    currentUser,
    () => null,
  );

  assert.deepEqual(result, { handled: false, user: currentUser });
});

test('regular-user login sync refreshes the matching profile without affecting other users', () => {
  const user = { id: 'user-a', email: 'updated@example.com' };
  const result = getRegularUserAfterAuthSync(
    { detail: { action: 'session_updated', userId: 'user-a' } },
    { id: 'user-a', email: 'old@example.com' },
    () => user,
  );

  assert.deepEqual(result, { handled: true, user });
});

test('regular-user auth sync ignores Super Admin events', () => {
  const currentUser = { id: 'user-a' };
  const result = getRegularUserAfterAuthSync(
    { type: 'voxreview_superadmin_auth_sync', detail: { id: 'admin-1' } },
    currentUser,
    () => null,
  );

  assert.deepEqual(result, { handled: false, user: currentUser });
});
