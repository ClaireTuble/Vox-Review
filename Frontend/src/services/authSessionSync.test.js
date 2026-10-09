import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isExpiredAccessToken,
  isInvalidAuthSessionError,
  isMatchingAuthUser,
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
