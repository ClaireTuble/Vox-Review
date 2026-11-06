import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  attemptSuperAdminLogout,
  changeSuperAdminPassword,
  getSessionTimeoutPreference,
  inactivityStorageKey,
  isSessionInactive,
  revokeSuperAdminRefreshTokens,
  saveSessionTimeoutPreference,
  signOutCurrentSuperAdminSession,
  startSuperAdminInactivityMonitor,
  validatePasswordChange,
} from './securitySettings.js';

const dashboardSource = await readFile(
  new URL('../pages/SuperAdminDashboard.jsx', import.meta.url),
  'utf8',
);

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
  };
}

test('password form validation requires all fields and matching confirmation', () => {
  assert.equal(validatePasswordChange({}), 'Complete all password fields.');
  assert.equal(validatePasswordChange({
    currentPassword: 'current',
    newPassword: 'new',
    confirmPassword: 'different',
  }), 'New passwords do not match.');
  assert.equal(validatePasswordChange({
    currentPassword: 'current',
    newPassword: 'new',
    confirmPassword: 'new',
  }), null);
});

test('password update verifies the current Super Admin password before updating', async () => {
  const calls = [];
  const auth = {
    getSession: async () => ({
      data: { session: { user: { id: 'admin-1', email: 'admin@example.test', app_metadata: { role: 'superadmin' } } } },
    }),
    signInWithPassword: async (credentials) => {
      calls.push(['reauth', credentials]);
      return { data: { user: { id: 'admin-1', app_metadata: { role: 'superadmin' } } } };
    },
    updateUser: async (updates) => {
      calls.push(['update', updates]);
      return { error: null };
    },
  };

  assert.equal(await changeSuperAdminPassword(auth, 'current-secret', 'new-secret'), true);
  assert.deepEqual(calls, [
    ['reauth', { email: 'admin@example.test', password: 'current-secret' }],
    ['update', { password: 'new-secret' }],
  ]);
});

test('password update surfaces provider failures and does not report success', async () => {
  const auth = {
    getSession: async () => ({
      data: { session: { user: { id: 'admin-1', email: 'admin@example.test', app_metadata: { role: 'superadmin' } } } },
    }),
    signInWithPassword: async () => ({ error: new Error('Invalid login credentials') }),
    updateUser: async () => assert.fail('Password update must not run after reauthentication fails.'),
  };

  await assert.rejects(
    changeSuperAdminPassword(auth, 'wrong-secret', 'new-secret'),
    /Invalid login credentials/,
  );
});

test('password update surfaces provider errors from the update operation', async () => {
  const auth = {
    getSession: async () => ({
      data: { session: { user: { id: 'admin-1', email: 'admin@example.test', app_metadata: { role: 'superadmin' } } } },
    }),
    signInWithPassword: async () => ({
      data: { user: { id: 'admin-1', app_metadata: { role: 'superadmin' } } },
    }),
    updateUser: async () => ({ error: new Error('Password update unavailable') }),
  };

  await assert.rejects(
    changeSuperAdminPassword(auth, 'current-secret', 'new-secret'),
    /Password update unavailable/,
  );
});

test('refresh-token revocation requests provider-wide sign-out and exposes unsupported or failed flows', async () => {
  let options;
  assert.equal(await revokeSuperAdminRefreshTokens({
    signOut: async (value) => {
      options = value;
      return { error: null };
    },
  }), true);
  assert.deepEqual(options, { scope: 'global' });

  await assert.rejects(revokeSuperAdminRefreshTokens({}), /not supported/);
  await assert.rejects(
    revokeSuperAdminRefreshTokens({ signOut: async () => ({ error: new Error('Provider failure') }) }),
    /Provider failure/,
  );
});

test('current-session logout only signs out the local Super Admin session', async () => {
  let options;
  assert.equal(await signOutCurrentSuperAdminSession({
    signOut: async (value) => {
      options = value;
      return { error: null };
    },
  }), true);
  assert.deepEqual(options, { scope: 'local' });
  await assert.rejects(
    signOutCurrentSuperAdminSession({ signOut: async () => ({ error: new Error('Logout failed') }) }),
    /Logout failed/,
  );
});

test('inactivity preference persists per Super Admin and expires at its configured deadline', () => {
  const storage = createStorage();
  const saved = saveSessionTimeoutPreference(storage, 'admin-1', 15, 10_000);
  assert.deepEqual(saved, { minutes: 15, lastActivityAt: 10_000 });
  assert.deepEqual(getSessionTimeoutPreference(storage, 'admin-1'), saved);
  assert.equal(storage.getItem(inactivityStorageKey('another-admin')), null);
  assert.equal(isSessionInactive(saved, 909_999), false);
  assert.equal(isSessionInactive(saved, 910_000), true);
});

test('inactivity monitor logs out after a timer or when a backgrounded page regains focus', () => {
  const storage = createStorage();
  const listeners = new Map();
  const windowObject = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  };
  const documentListeners = new Map();
  const documentObject = {
    visibilityState: 'visible',
    addEventListener: (name, callback) => documentListeners.set(name, callback),
    removeEventListener: (name) => documentListeners.delete(name),
  };
  let currentTime = 0;
  let callbackId = 0;
  const timers = new Map();
  let timeoutCount = 0;
  const stop = startSuperAdminInactivityMonitor({
    userId: 'admin-1',
    onTimeout: () => { timeoutCount += 1; },
    storage,
    windowObject,
    documentObject,
    now: () => currentTime,
    schedule: (callback) => {
      const id = ++callbackId;
      timers.set(id, callback);
      return id;
    },
    cancel: (id) => timers.delete(id),
  });

  currentTime = 1_200;
  listeners.get('pointerdown')();
  assert.equal(getSessionTimeoutPreference(storage, 'admin-1').lastActivityAt, currentTime);
  currentTime = 1_200 + 30 * 60_000;
  documentObject.visibilityState = 'hidden';
  documentListeners.get('visibilitychange')();
  documentObject.visibilityState = 'visible';
  listeners.get('focus')();

  assert.equal(timeoutCount, 1);
  stop();
  stop();
  assert.equal(listeners.size, 0);
  assert.equal(timers.size, 0);
});

test('malformed inactivity preferences fail before registering listeners or timers', () => {
  for (const malformedValue of ['', 'not-json', '{"minutes":0,"lastActivityAt":0}']) {
    const storage = createStorage();
    storage.setItem(inactivityStorageKey('admin-1'), malformedValue);
    let listenerRegistrations = 0;
    let timerRegistrations = 0;
    const windowObject = {
      addEventListener: () => { listenerRegistrations += 1; },
      removeEventListener: () => {},
    };
    const documentObject = {
      addEventListener: () => { listenerRegistrations += 1; },
      removeEventListener: () => {},
    };

    assert.throws(() => startSuperAdminInactivityMonitor({
      userId: 'admin-1',
      onTimeout: () => {},
      storage,
      windowObject,
      documentObject,
      schedule: () => { timerRegistrations += 1; },
      cancel: () => {},
    }));
    assert.equal(listenerRegistrations, 0);
    assert.equal(timerRegistrations, 0);
  }
});

test('initialization failure removes listeners and cancels its scheduled timer before failed logout', async () => {
  const storage = createStorage();
  const windowListeners = new Map();
  const documentListeners = new Map();
  const removedWindowListeners = [];
  const windowObject = {
    addEventListener: (name, callback) => windowListeners.set(name, callback),
    removeEventListener: (name, callback) => {
      removedWindowListeners.push([name, callback]);
      windowListeners.delete(name);
    },
  };
  const documentObject = {
    visibilityState: 'visible',
    addEventListener: (name, callback) => {
      documentListeners.set(name, callback);
      throw new Error('Document listener registration failed.');
    },
    removeEventListener: (name, callback) => {
      assert.equal(documentListeners.get(name), callback);
      documentListeners.delete(name);
    },
  };
  const scheduledCallbacks = new Map();
  const cancelledCallbacks = [];
  let nextTimerId = 0;

  assert.throws(() => startSuperAdminInactivityMonitor({
    userId: 'admin-1',
    onTimeout: () => {},
    storage,
    windowObject,
    documentObject,
    now: () => 0,
    schedule: (callback) => {
      const timerId = ++nextTimerId;
      scheduledCallbacks.set(timerId, callback);
      return timerId;
    },
    cancel: (timerId) => {
      cancelledCallbacks.push(timerId);
      scheduledCallbacks.delete(timerId);
    },
  }), /Document listener registration failed/);

  assert.equal(windowListeners.size, 0);
  assert.equal(documentListeners.size, 0);
  assert.equal(scheduledCallbacks.size, 0);
  assert.deepEqual(cancelledCallbacks, [1]);
  assert.equal(removedWindowListeners.length, 9);

  const logoutCalls = [];
  const logoutResult = await attemptSuperAdminLogout({
    logout: async () => { throw new Error('Logout failed.'); },
    onSuccess: () => logoutCalls.push('navigate'),
    onFailure: () => logoutCalls.push('failure'),
  });
  assert.equal(logoutResult, false);
  assert.deepEqual(logoutCalls, ['failure']);
  assert.equal(windowListeners.size, 0);
  assert.equal(documentListeners.size, 0);
});
test('a rejected inactivity logout reports failure without navigating or claiming sign-out', async () => {
  const calls = [];
  const error = new Error('Authentication provider unavailable');

  const result = await attemptSuperAdminLogout({
    logout: async () => { throw error; },
    onSuccess: () => calls.push('navigate'),
    onFailure: (failure) => calls.push(failure),
  });

  assert.equal(result, false);
  assert.deepEqual(calls, [error]);
});

test('a rejected logout after monitor initialization failure reports failure without navigating', async () => {
  const calls = [];
  const error = new Error('Local sign-out failed');

  const result = await attemptSuperAdminLogout({
    logout: async () => { throw error; },
    onSuccess: () => calls.push('navigate'),
    onFailure: (failure) => calls.push(failure),
  });

  assert.equal(result, false);
  assert.deepEqual(calls, [error]);
});

test('successful inactivity logout navigates only after sign-out resolves', async () => {
  const calls = [];

  const result = await attemptSuperAdminLogout({
    logout: async () => { calls.push('logout'); },
    onSuccess: () => calls.push('navigate'),
    onFailure: (error) => calls.push(error),
  });

  assert.equal(result, true);
  assert.deepEqual(calls, ['logout', 'navigate']);
});

test('timeout and monitor-failure paths use fail-closed logout with a visible retry', () => {
  assert.match(
    dashboardSource,
    /onTimeout:\s*\(\)\s*=>\s*\{\s*void attemptForcedLogout\('Inactivity timeout\.'\)/,
  );
  assert.match(
    dashboardSource,
    /catch \(error\) \{[\s\S]*?queueMicrotask\(\(\) => \{\s*void attemptForcedLogout\('Inactivity protection failure\.'\)/,
  );
  assert.match(dashboardSource, /onFailure: \(error\) => \{[\s\S]*?setForcedLogoutError\(/);
  assert.match(dashboardSource, /onClick=\{\(\) => void attemptForcedLogout\('Retry\.'\)\}/);
  assert.doesNotMatch(dashboardSource, /\.finally\(\(\) => navigate\(/);
});
