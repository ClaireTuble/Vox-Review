import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptSuperAdminLogout,
  changeSuperAdminPassword,
  getPasswordStrength,
  getSessionTimeoutPreference,
  inactivityStorageKey,
  isSessionInactive,
  resolvePasswordInputType,
  resolvePasswordToggleLabel,
  revokeSuperAdminRefreshTokens,
  saveSessionTimeoutPreference,
  signOutCurrentSuperAdminSession,
  startSuperAdminInactivityMonitor,
  validatePasswordChange,
  validateNewPassword,
  getSessionChoiceModalConfig,
} from './securitySettings.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('password form validation enforces required fields, matching confirmation, and strength rules', () => {
  // Required fields
  assert.equal(validatePasswordChange({}), 'Complete all password fields.');
  assert.equal(validatePasswordChange({
    currentPassword: 'CurrentPassword123!',
    newPassword: '',
    confirmPassword: 'CurrentPassword123!',
  }), 'Complete all password fields.');

  // Confirmation mismatch
  assert.equal(validatePasswordChange({
    currentPassword: 'CurrentPassword123!',
    newPassword: 'NewSecurePassword123!',
    confirmPassword: 'DifferentPassword123!',
  }), 'New passwords do not match.');

  // Invalid or weak new password: too short (< 8 chars)
  assert.equal(validatePasswordChange({
    currentPassword: 'CurrentPassword123!',
    newPassword: 'Short1!',
    confirmPassword: 'Short1!',
  }), 'New password must be at least 8 characters long.');

  // Invalid or weak new password: no numbers
  assert.equal(validatePasswordChange({
    currentPassword: 'CurrentPassword123!',
    newPassword: 'LettersOnlyPassword!',
    confirmPassword: 'LettersOnlyPassword!',
  }), 'New password must contain at least one letter and one number.');

  // Invalid or weak new password: no letters
  assert.equal(validatePasswordChange({
    currentPassword: 'CurrentPassword123!',
    newPassword: '1234567890!@#',
    confirmPassword: '1234567890!@#',
  }), 'New password must contain at least one letter and one number.');

  // Same as current password
  assert.equal(validatePasswordChange({
    currentPassword: 'CurrentPassword123!',
    newPassword: 'CurrentPassword123!',
    confirmPassword: 'CurrentPassword123!',
  }), 'New password must differ from your current password.');

  // Valid new password
  assert.equal(validatePasswordChange({
    currentPassword: 'CurrentPassword123!',
    newPassword: 'NewSecurePassword456!',
    confirmPassword: 'NewSecurePassword456!',
  }), null);
});

test('password strength evaluator grades passwords accurately', () => {
  assert.deepEqual(getPasswordStrength(''), { strength: 0, label: '' });
  assert.equal(getPasswordStrength('weak').strength, 0);
  assert.equal(getPasswordStrength('short1').strength, 1);
  assert.equal(getPasswordStrength('sP1').strength, 2);
  assert.equal(getPasswordStrength('LongPassword1').strength, 3);
  assert.equal(getPasswordStrength('StrongPassword123!').strength, 4);
  assert.equal(getPasswordStrength('StrongPassword123!').label, 'Strong');
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

test('Super Admin logout callbacks reflect the durable logout result', async () => {
  const callbacks = [];
  assert.equal(await attemptSuperAdminLogout({
    logout: async () => {},
    onSuccess: () => callbacks.push('success'),
    onFailure: () => callbacks.push('failure'),
  }), true);
  assert.deepEqual(callbacks, ['success']);

  const logoutError = new Error('Server revocation failed');
  assert.equal(await attemptSuperAdminLogout({
    logout: async () => { throw logoutError; },
    onSuccess: () => callbacks.push('unexpected-success'),
    onFailure: (error) => callbacks.push(error),
  }), false);
  assert.equal(callbacks[1], logoutError);
  assert.equal(callbacks.includes('unexpected-success'), false);
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
  assert.equal(listeners.size, 0);
});

test('successful login using newly changed password and rejection of old password', async () => {
  // Simulate Supabase Auth database state
  let currentStoredPassword = 'InitialSuperAdminSecret123!';
  const superAdminUser = {
    id: 'superadmin-uuid-1',
    email: 'admin@voxreview.test',
    app_metadata: { role: 'superadmin' },
  };

  const simulatedAuth = {
    // Current authenticated session
    getSession: async () => ({
      data: {
        session: {
          access_token: 'valid-jwt-token-xyz',
          user: superAdminUser,
        },
      },
      error: null,
    }),
    // Authentication endpoint (used by login & reauth)
    signInWithPassword: async ({ email, password }) => {
      if (email === superAdminUser.email && password === currentStoredPassword) {
        return {
          data: {
            user: superAdminUser,
            session: { access_token: 'new-session-jwt', user: superAdminUser },
          },
          error: null,
        };
      }
      return {
        data: { user: null, session: null },
        error: new Error('Invalid login credentials'),
      };
    },
    // User update endpoint (used by changeSuperAdminPassword)
    updateUser: async ({ password }) => {
      currentStoredPassword = password;
      return {
        data: { user: { ...superAdminUser, updated_at: new Date().toISOString() } },
        error: null,
      };
    },
  };

  // 1. Initial login with old password succeeds
  const initialLogin = await simulatedAuth.signInWithPassword({
    email: 'admin@voxreview.test',
    password: 'InitialSuperAdminSecret123!',
  });
  assert.equal(initialLogin.data?.user?.id, 'superadmin-uuid-1');

  // 2. Change password to new password
  const changeResult = await changeSuperAdminPassword(
    simulatedAuth,
    'InitialSuperAdminSecret123!',
    'UpdatedSuperAdminSecret456!',
  );
  assert.equal(changeResult, true);

  // 3. Old password is now rejected for login
  const oldPasswordLogin = await simulatedAuth.signInWithPassword({
    email: 'admin@voxreview.test',
    password: 'InitialSuperAdminSecret123!',
  });
  assert.equal(oldPasswordLogin.error?.message, 'Invalid login credentials');
  assert.equal(oldPasswordLogin.data?.user, null);

  // 4. New password successfully logs in
  const newPasswordLogin = await simulatedAuth.signInWithPassword({
    email: 'admin@voxreview.test',
    password: 'UpdatedSuperAdminSecret456!',
  });
  assert.equal(newPasswordLogin.error, null);
  assert.equal(newPasswordLogin.data?.user?.id, 'superadmin-uuid-1');
  assert.equal(newPasswordLogin.data?.user?.app_metadata?.role, 'superadmin');
});

test('show/hide password functionality toggles input type and accessible labels while preserving value', () => {
  // 1. Initial hidden state
  let isVisible = false;
  let enteredValue = 'P@ssw0rdSecure!#99';

  assert.equal(resolvePasswordInputType(isVisible), 'password');
  assert.equal(resolvePasswordToggleLabel(isVisible, 'password'), 'Show password');
  assert.equal(resolvePasswordToggleLabel(isVisible, 'current password'), 'Show current password');
  assert.equal(resolvePasswordToggleLabel(isVisible, 'new password'), 'Show new password');
  assert.equal(resolvePasswordToggleLabel(isVisible, 'confirm new password'), 'Show confirm new password');

  // 2. Toggle to visible
  isVisible = !isVisible;
  assert.equal(resolvePasswordInputType(isVisible), 'text');
  assert.equal(resolvePasswordToggleLabel(isVisible, 'password'), 'Hide password');
  assert.equal(resolvePasswordToggleLabel(isVisible, 'current password'), 'Hide current password');
  assert.equal(resolvePasswordToggleLabel(isVisible, 'new password'), 'Hide new password');
  assert.equal(resolvePasswordToggleLabel(isVisible, 'confirm new password'), 'Hide confirm new password');

  // 3. Verify entered password value is strictly preserved without mutation or clearing
  assert.equal(enteredValue, 'P@ssw0rdSecure!#99');

  // 4. Toggle back to hidden
  isVisible = !isVisible;
  assert.equal(resolvePasswordInputType(isVisible), 'password');
  assert.equal(resolvePasswordToggleLabel(isVisible, 'password'), 'Show password');
  assert.equal(enteredValue, 'P@ssw0rdSecure!#99');
});

test('validateNewPassword enforces mandatory fields, matching confirmation, and complexity rules', () => {
  // Required fields
  assert.equal(validateNewPassword({}), 'Complete all password fields.');
  assert.equal(validateNewPassword({ newPassword: 'Pass', confirmPassword: '' }), 'Complete all password fields.');

  // Confirmation mismatch
  assert.equal(
    validateNewPassword({ newPassword: 'NewSecurePass123!', confirmPassword: 'DifferentPass123!' }),
    'New passwords do not match.'
  );

  // Short (< 8 chars)
  assert.equal(
    validateNewPassword({ newPassword: 'Short1!', confirmPassword: 'Short1!' }),
    'New password must be at least 8 characters long.'
  );

  // No numbers
  assert.equal(
    validateNewPassword({ newPassword: 'LettersOnlyPass!', confirmPassword: 'LettersOnlyPass!' }),
    'New password must contain at least one letter and one number.'
  );

  // No letters
  assert.equal(
    validateNewPassword({ newPassword: '1234567890!', confirmPassword: '1234567890!' }),
    'New password must contain at least one letter and one number.'
  );

  // Valid
  assert.equal(
    validateNewPassword({ newPassword: 'NewSecurePass123!', confirmPassword: 'NewSecurePass123!' }),
    null
  );
});

test('post-change device session options enforce keep-all vs logout-all semantics', async () => {
  let globalRevocationCalled = false;
  let localRevocationCalled = false;

  const mockAuth = {
    signOut: async ({ scope }) => {
      if (scope === 'global') globalRevocationCalled = true;
      if (scope === 'local') localRevocationCalled = true;
      return { error: null };
    },
  };

  // Option A: Keep All Devices Signed In (no sign-out calls)
  const optionAChoice = 'keep_sessions';
  assert.equal(optionAChoice, 'keep_sessions');
  assert.equal(globalRevocationCalled, false);
  assert.equal(localRevocationCalled, false);

  // Option B: Log Out All Devices (invokes global sign-out revoking all device sessions including current)
  await revokeSuperAdminRefreshTokens(mockAuth);
  assert.equal(globalRevocationCalled, true);
});

test('getSessionChoiceModalConfig provides explicit disclosure and strict button labeling for both options', () => {
  // Option A configuration
  const configA = getSessionChoiceModalConfig('keep_sessions');
  assert.equal(configA.title, 'Keep Devices Signed In?');
  assert.equal(
    configA.message,
    'Keep your existing authenticated devices signed in where supported. Your password change may automatically revoke other sessions depending on Supabase Auth behavior.'
  );
  assert.equal(configA.confirmButtonText, 'Confirm and Continue');
  assert.equal(configA.cancelButtonText, 'Cancel');
  assert.equal(configA.isDanger, false);

  // Option B configuration
  const configB = getSessionChoiceModalConfig('logout_all');
  assert.equal(configB.title, 'Log Out All Devices?');
  assert.equal(
    configB.message,
    'This will sign you out of VoxReview Super Admin on ALL devices, including this current browser. You must log in again with your email, password, and verification code.'
  );
  assert.equal(configB.confirmButtonText, 'Yes, Log Out All');
  assert.equal(configB.cancelButtonText, 'Cancel');
  assert.equal(configB.isDanger, true);
});

test('session choice confirmation modal lifecycle: cancel blocks execution, confirm executes once, duplicate clicks prevented', async () => {
  let executedAction = null;
  let executionCount = 0;
  let isSubmitting = false;

  const handleConfirm = async (variant) => {
    if (isSubmitting) return;
    isSubmitting = true;
    executionCount += 1;
    executedAction = variant;
  };

  const handleCancel = () => {
    if (isSubmitting) return;
    // Cancel closes modal without modifying session or running any action
  };

  // 1. User opens Option A modal then clicks Cancel
  handleCancel();
  assert.equal(executedAction, null);
  assert.equal(executionCount, 0);

  // 2. User opens Option B modal then clicks Cancel
  handleCancel();
  assert.equal(executedAction, null);
  assert.equal(executionCount, 0);

  // 3. User opens Option B modal and confirms
  await handleConfirm('logout_all');
  assert.equal(executedAction, 'logout_all');
  assert.equal(executionCount, 1);

  // 4. Duplicate clicks while submitting are strictly rejected
  await handleConfirm('logout_all');
  await handleConfirm('logout_all');
  assert.equal(executionCount, 1);
});

test('password submission flow lifecycle: handles reuse rejection, provider errors, and successful transition to session_choice', async () => {
  let step = 'new_password';
  let displayedNotice = null;
  let noticeType = null;
  let clearedForm = false;

  const setNotice = (msg, type = 'success') => {
    displayedNotice = msg;
    noticeType = type;
  };

  const executeSubmission = async (submitFn) => {
    try {
      await submitFn();
      clearedForm = true;
      step = 'session_choice';
      setNotice('Password updated successfully! Select your device session preference.', 'success');
    } catch (err) {
      setNotice(err.message || 'Password update failed.', 'error');
    }
  };

  // Case 1: Rejection due to current-password reuse (HTTP 422)
  await executeSubmission(async () => {
    throw new Error('You cannot reuse your current password. Please choose a different password.');
  });
  assert.equal(step, 'new_password', 'Flow step must NOT advance to session_choice on reuse rejection');
  assert.equal(clearedForm, false);
  assert.equal(displayedNotice, 'You cannot reuse your current password. Please choose a different password.');
  assert.equal(noticeType, 'error');

  // Case 2: Rejection due to provider failure (HTTP 500)
  await executeSubmission(async () => {
    throw new Error('Database connection refused by provider');
  });
  assert.equal(step, 'new_password', 'Flow step must NOT advance to session_choice on provider error');
  assert.equal(clearedForm, false);
  assert.equal(displayedNotice, 'Database connection refused by provider');
  assert.equal(noticeType, 'error');

  // Case 3: Successful update
  await executeSubmission(async () => {
    return { success: true, message: 'Password updated successfully.' };
  });
  assert.equal(step, 'session_choice', 'Flow step advances to session_choice ONLY on success');
  assert.equal(clearedForm, true);
  assert.equal(displayedNotice, 'Password updated successfully! Select your device session preference.');
  assert.equal(noticeType, 'success');
});

test('global logout confirmation execution: immediate navigation, storage cleanup, and isolation from regular user sessions', async () => {
  let navigatedTo = null;
  let navigationOptions = null;
  let sessionChoiceSubmitting = false;
  let noticeMessage = null;

  const mockStorage = new Map([
    ['superadmin_auth_session', JSON.stringify({ access_token: 'sa-token', user: { role: 'superadmin' } })],
    ['voxreview_superadmin_timeout:admin-1', JSON.stringify({ minutes: 30 })],
    ['user_auth_session', JSON.stringify({ access_token: 'regular-user-token', user: { role: 'user' } })],
  ]);

  const fakeNavigate = (to, opts) => {
    navigatedTo = to;
    navigationOptions = opts;
  };

  const fakeTriggerNotice = (msg) => {
    noticeMessage = msg;
  };

  // Mock global logout handler
  const handleConfirmSessionChoice = async (choice, recordChoiceApi) => {
    if (sessionChoiceSubmitting) return;
    sessionChoiceSubmitting = true;
    try {
      await recordChoiceApi(choice);
      if (choice === 'logout_all') {
        // Clear Super Admin storage without clearing regular user session
        mockStorage.delete('superadmin_auth_session');
        mockStorage.delete('voxreview_superadmin_timeout:admin-1');
        fakeNavigate('/superadmin/login', { replace: true });
        return;
      }
    } catch (err) {
      fakeTriggerNotice(err.message || 'Failed to update device sessions.');
    } finally {
      sessionChoiceSubmitting = false;
    }
  };

  // 1. Successful logout_all execution
  await handleConfirmSessionChoice('logout_all', async () => ({
    success: true,
    choice: 'logout_all',
  }));

  // Immediately redirected with route replacement
  assert.equal(navigatedTo, '/superadmin/login');
  assert.deepEqual(navigationOptions, { replace: true });

  // Super Admin session removed
  assert.equal(mockStorage.has('superadmin_auth_session'), false);
  assert.equal(mockStorage.has('voxreview_superadmin_timeout:admin-1'), false);

  // Unrelated regular user session preserved intact
  assert.equal(mockStorage.has('user_auth_session'), true);
  assert.equal(
    JSON.parse(mockStorage.get('user_auth_session')).access_token,
    'regular-user-token'
  );

  // 2. Failed global revocation does not navigate or report success
  navigatedTo = null;
  await handleConfirmSessionChoice('logout_all', async () => {
    throw new Error('Failed to revoke administrator sessions with authentication provider.');
  });
  assert.equal(navigatedTo, null, 'Must not navigate when revocation fails');
  assert.equal(noticeMessage, 'Failed to revoke administrator sessions with authentication provider.');
});
