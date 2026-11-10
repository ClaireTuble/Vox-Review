export const SESSION_TIMEOUT_OPTIONS = [15, 30, 60, 240];
export const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
const SESSION_TIMEOUT_STORAGE_PREFIX = 'voxreview_superadmin_timeout';

export function validatePasswordChange({ currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword || !newPassword || !confirmPassword) {
    return 'Complete all password fields.';
  }
  if (newPassword !== confirmPassword) {
    return 'New passwords do not match.';
  }
  if (newPassword.length < 8) {
    return 'New password must be at least 8 characters long.';
  }
  if (!/[a-z]/i.test(newPassword) || !/\d/.test(newPassword)) {
    return 'New password must contain at least one letter and one number.';
  }
  if (newPassword === currentPassword) {
    return 'New password must differ from your current password.';
  }
  return null;
}

export function validateNewPassword({ newPassword, confirmPassword }) {
  if (!newPassword || !confirmPassword) {
    return 'Complete all password fields.';
  }
  if (newPassword !== confirmPassword) {
    return 'New passwords do not match.';
  }
  if (newPassword.length < 8) {
    return 'New password must be at least 8 characters long.';
  }
  if (!/[a-z]/i.test(newPassword) || !/\d/.test(newPassword)) {
    return 'New password must contain at least one letter and one number.';
  }
  return null;
}

export function getPasswordStrength(pwd) {
  if (!pwd) return { strength: 0, label: '' };
  let strength = 0;
  if (pwd.length >= 8) strength++;
  if (pwd.match(/[a-z]/) && pwd.match(/[A-Z]/)) strength++;
  if (pwd.match(/\d/)) strength++;
  if (pwd.match(/[^a-zA-Z\d]/)) strength++;

  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  return {
    strength,
    label: strength > 0 ? labels[strength - 1] : 'Weak',
  };
}

export function resolvePasswordInputType(isVisible) {
  return isVisible ? 'text' : 'password';
}

export function resolvePasswordToggleLabel(isVisible, fieldLabel = 'password') {
  return isVisible ? `Hide ${fieldLabel}` : `Show ${fieldLabel}`;
}

export async function changeSuperAdminPassword(auth, currentPassword, newPassword) {
  const { data: sessionData, error: sessionError } = await auth.getSession();
  if (sessionError) throw sessionError;

  const currentUser = sessionData?.session?.user;
  if (!currentUser?.email || currentUser.app_metadata?.role !== 'superadmin') {
    throw new Error('An authenticated Super Admin session is required.');
  }

  const { data: authData, error: authError } = await auth.signInWithPassword({
    email: currentUser.email,
    password: currentPassword,
  });
  if (authError) throw authError;
  if (
    authData?.user?.id !== currentUser.id ||
    authData.user.app_metadata?.role !== 'superadmin'
  ) {
    throw new Error('The current password could not be verified for this Super Admin.');
  }

  const { error: updateError } = await auth.updateUser({ password: newPassword });
  if (updateError) throw updateError;
  return true;
}

export async function revokeSuperAdminRefreshTokens(auth) {
  if (typeof auth?.signOut !== 'function') {
    throw new Error('Global session revocation is not supported by this authentication provider.');
  }
  const { error } = await auth.signOut({ scope: 'global' });
  if (error) throw error;
  return true;
}

export async function signOutCurrentSuperAdminSession(auth) {
  if (typeof auth?.signOut !== 'function') {
    throw new Error('Session logout is not supported by this authentication provider.');
  }
  const { error } = await auth.signOut({ scope: 'local' });
  if (error) throw error;
  return true;
}

export async function attemptSuperAdminLogout({ logout, onSuccess, onFailure }) {
  try {
    await logout();
  } catch (error) {
    onFailure(error);
    return false;
  }
  onSuccess();
  return true;
}

export function inactivityStorageKey(userId) {
  return `${SESSION_TIMEOUT_STORAGE_PREFIX}:${userId}`;
}

export function getSessionTimeoutPreference(storage, userId, now = Date.now()) {
  const raw = storage.getItem(inactivityStorageKey(userId));
  if (!raw) {
    return { minutes: DEFAULT_SESSION_TIMEOUT_MINUTES, lastActivityAt: now };
  }

  const preference = JSON.parse(raw);
  if (
    !SESSION_TIMEOUT_OPTIONS.includes(Number(preference.minutes)) ||
    !Number.isFinite(preference.lastActivityAt)
  ) {
    throw new Error('The saved Super Admin inactivity timeout preference is invalid.');
  }

  return { ...preference, minutes: Number(preference.minutes) };
}

export function saveSessionTimeoutPreference(storage, userId, minutes, now = Date.now()) {
  const parsedMinutes = Number(minutes);
  if (!SESSION_TIMEOUT_OPTIONS.includes(parsedMinutes)) {
    throw new Error('Select a supported inactivity timeout.');
  }
  const preference = { minutes: parsedMinutes, lastActivityAt: now };
  storage.setItem(inactivityStorageKey(userId), JSON.stringify(preference));
  return preference;
}

export function isSessionInactive(preference, now = Date.now()) {
  return now - preference.lastActivityAt >= preference.minutes * 60_000;
}

export function startSuperAdminInactivityMonitor({
  userId,
  onTimeout,
  storage = globalThis.localStorage,
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  if (!userId || typeof onTimeout !== 'function' || !windowObject || !documentObject) {
    throw new Error('A Super Admin user, timeout callback, and browser context are required.');
  }

  const key = inactivityStorageKey(userId);
  let timer = null;
  let stopped = false;
  let expired = false;
  let lastMoveCheckAt = 0;
  const activityHandlers = new Map();

  if (!storage.getItem(key)) {
    saveSessionTimeoutPreference(storage, userId, DEFAULT_SESSION_TIMEOUT_MINUTES, now());
  }

  const readPreference = () => getSessionTimeoutPreference(storage, userId, now());
  const stopTimer = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const checkTimeout = () => {
    if (stopped || expired) return true;
    const preference = readPreference();
    const remaining = preference.minutes * 60_000 - (now() - preference.lastActivityAt);
    if (remaining <= 0) {
      expired = true;
      stopTimer();
      onTimeout();
      return true;
    }
    stopTimer();
    timer = schedule(checkTimeout, remaining);
    return false;
  };
  const recordActivity = () => {
    if (documentObject.visibilityState === 'hidden' || checkTimeout()) return;
    const preference = readPreference();
    const currentTime = now();
    if (currentTime - preference.lastActivityAt >= 1_000) {
      saveSessionTimeoutPreference(storage, userId, preference.minutes, currentTime);
    }
    checkTimeout();
  };
  const handleVisibility = () => {
    if (documentObject.visibilityState === 'visible') {
      if (!checkTimeout()) recordActivity();
    }
  };
  const handleStorage = (event) => {
    if (event.key === key) checkTimeout();
  };

  const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
  activityEvents.forEach((eventName) => {
    const handler = eventName === 'pointermove'
      ? () => {
        if (now() - lastMoveCheckAt < 1_000) return;
        lastMoveCheckAt = now();
        recordActivity();
      }
      : recordActivity;
    windowObject.addEventListener(eventName, handler, { passive: true });
    activityHandlers.set(eventName, handler);
  });
  windowObject.addEventListener('focus', handleVisibility);
  windowObject.addEventListener('pageshow', handleVisibility);
  windowObject.addEventListener('storage', handleStorage);
  windowObject.addEventListener('voxreview_superadmin_timeout_change', checkTimeout);
  documentObject.addEventListener('visibilitychange', handleVisibility);
  checkTimeout();

  return () => {
    stopped = true;
    stopTimer();
    activityEvents.forEach((eventName) => windowObject.removeEventListener(
      eventName,
      activityHandlers.get(eventName),
    ));
    windowObject.removeEventListener('focus', handleVisibility);
    windowObject.removeEventListener('pageshow', handleVisibility);
    windowObject.removeEventListener('storage', handleStorage);
    windowObject.removeEventListener('voxreview_superadmin_timeout_change', checkTimeout);
    documentObject.removeEventListener('visibilitychange', handleVisibility);
  };
}

export function getSessionChoiceModalConfig(variant) {
  if (variant === 'logout_all') {
    return {
      title: 'Log Out All Devices?',
      message: 'This will sign you out of VoxReview Super Admin on ALL devices, including this current browser. You must log in again with your email, password, and verification code.',
      confirmButtonText: 'Yes, Log Out All',
      cancelButtonText: 'Cancel',
      isDanger: true,
    };
  }
  return {
    title: 'Keep Devices Signed In?',
    message: 'Keep your existing authenticated devices signed in where supported. Your password change may automatically revoke other sessions depending on Supabase Auth behavior.',
    confirmButtonText: 'Confirm and Continue',
    cancelButtonText: 'Cancel',
    isDanger: false,
  };
}
