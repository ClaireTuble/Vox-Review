import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeGoogleOAuthSession,
  createGoogleOAuthSessionGate,
  createGoogleOAuthSuccessNavigator,
  isGoogleOAuthCallback,
} from './googleOAuthFlow.js';

test('Google callback verifies and persists the session before returning success', async () => {
  const session = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    user: { id: 'user-1' },
  };
  const calls = [];
  const persisted = [];
  const result = await completeGoogleOAuthSession({
    supabaseClient: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        getUser: async (token) => {
          calls.push(token);
          return { data: { user: session.user }, error: null };
        },
      },
    },
    callbackUrl: 'https://vox-review.vercel.app/login?code=oauth-code',
    persistSession: (verifiedSession) => {
      persisted.push(verifiedSession);
      return { ...verifiedSession, token: verifiedSession.access_token };
    },
    clearSession: async () => assert.fail('successful callback must not clear the session'),
  });

  assert.equal(result.success, true);
  assert.equal(result.session.user.id, 'user-1');
  assert.deepEqual(calls, ['access-token']);
  assert.equal(persisted.length, 1);
});

test('Google callback refuses to persist a session for a different verified identity', async () => {
  const session = { access_token: 'access-token', user: { id: 'user-1' } };
  let persistCount = 0;
  const cleared = [];

  await assert.rejects(
    completeGoogleOAuthSession({
      supabaseClient: {
        auth: {
          getSession: async () => ({ data: { session }, error: null }),
          getUser: async () => ({ data: { user: { id: 'user-2' } }, error: null }),
        },
      },
      callbackUrl: 'https://vox-review.vercel.app/login?code=oauth-code',
      persistSession: () => {
        persistCount += 1;
        return session;
      },
      clearSession: async (userId) => cleared.push(userId),
    }),
    /Google sign-in could not be completed/,
  );

  assert.equal(persistCount, 0);
  assert.deepEqual(cleared, ['user-1']);
});

test('error_description alone fails the callback despite a pending sign-in and existing session', async () => {
  let getSessionCount = 0;
  let persistCount = 0;

  await assert.rejects(
    completeGoogleOAuthSession({
      supabaseClient: {
        auth: {
          getSession: async () => {
            getSessionCount += 1;
            return {
              data: {
                session: { access_token: 'access-token', user: { id: 'user-1' } },
              },
              error: null,
            };
          },
          getUser: async () => assert.fail('callback error must not verify an existing session'),
        },
      },
      callbackUrl: 'https://vox-review.vercel.app/login?error_description=OAuth+failed',
      hasPendingSignIn: true,
      persistSession: () => {
        persistCount += 1;
        return { user: { id: 'user-1' } };
      },
      clearSession: async () => {},
    }),
    /Google sign-in could not be completed/,
  );

  assert.equal(getSessionCount, 0);
  assert.equal(persistCount, 0);
});

test('an explicit OAuth error is not overridden by a valid existing session', async () => {
  let getSessionCount = 0;
  let persistCount = 0;

  await assert.rejects(
    completeGoogleOAuthSession({
      supabaseClient: {
        auth: {
          getSession: async () => {
            getSessionCount += 1;
            return {
              data: {
                session: { access_token: 'access-token', user: { id: 'user-1' } },
              },
              error: null,
            };
          },
          getUser: async () => assert.fail('callback error must not verify an existing session'),
        },
      },
      callbackUrl: 'https://vox-review.vercel.app/login?error=access_denied',
      hasPendingSignIn: true,
      persistSession: () => {
        persistCount += 1;
        return { user: { id: 'user-1' } };
      },
      clearSession: async () => {},
    }),
    /Google sign-in was cancelled/,
  );

  assert.equal(getSessionCount, 0);
  assert.equal(persistCount, 0);
});

test('OAuth session gate blocks listener persistence until verification', async () => {
  const gate = createGoogleOAuthSessionGate(true);
  assert.equal(gate.canPersistRegularUserSession(), false);
  assert.equal(gate.canPersistRegularUserSession(true), true);
  await gate.run(async () => {});
  assert.equal(gate.canPersistRegularUserSession(), true);
});

test('successful OAuth callback navigates to after-login once after session verification', async () => {
  const navigations = [];
  const navigateAfterSuccess = createGoogleOAuthSuccessNavigator((...args) => {
    navigations.push(args);
  });
  const session = { access_token: 'access-token', user: { id: 'user-1' } };
  const result = await completeGoogleOAuthSession({
    supabaseClient: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        getUser: async () => ({ data: { user: session.user }, error: null }),
      },
    },
    callbackUrl: 'https://vox-review.vercel.app/login?code=oauth-code',
    persistSession: (verifiedSession) => verifiedSession,
    clearSession: async () => assert.fail('successful callback must not clear the session'),
  });

  assert.equal(isGoogleOAuthCallback('https://vox-review.vercel.app/login?code=oauth-code'), true);
  assert.equal(navigateAfterSuccess(result), true);
  assert.equal(navigateAfterSuccess(result), false);
  assert.deepEqual(navigations, [['/after-login', { replace: true }]]);
});
