import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPopupAuthState } from './popupAuthSession.js';

test('popup auth state clears immediately when its extension session is removed', () => {
  const calls = [];
  const lastAuthUserIdRef = { current: 'user-a' };
  const profileRefreshRef = { current: { userId: 'user-a', promise: Promise.resolve() } };

  clearPopupAuthState({
    authService: {
      clearSessionLocally: () => calls.push('clear-local-session'),
    },
    lastAuthUserIdRef,
    profileRefreshRef,
    setAuthenticatedUser: (user) => calls.push(['set-user', user]),
    setAuthToastMessage: (message) => calls.push(['set-toast', message]),
  });

  assert.equal(lastAuthUserIdRef.current, null);
  assert.deepEqual(profileRefreshRef.current, { userId: null, promise: null });
  assert.deepEqual(calls, [
    'clear-local-session',
    ['set-user', null],
    ['set-toast', ''],
  ]);
});
