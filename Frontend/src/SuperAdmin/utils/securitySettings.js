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
  return null;
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
  if (raw === null) {
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
  if (storage.getItem(key) === null) {
    saveSessionTimeoutPreference(storage, userId, DEFAULT_SESSION_TIMEOUT_MINUTES, now());
  }
  const initialPreference = getSessionTimeoutPreference(storage, userId, now());
  let timer = null;
  let stopped = false;
  let cleanupComplete = false;
  let expired = false;
  let lastMoveCheckAt = 0;
  const listeners = [];

  const readPreference = () => getSessionTimeoutPreference(storage, userId, now());
  const stopTimer = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const checkTimeout = (preference = readPreference()) => {
    if (stopped || expired) return true;
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
  const addListener = (target, eventName, handler, options) => {
    listeners.push({ target, eventName, handler });
    target.addEventListener(eventName, handler, options);
  };
  const cleanup = () => {
    if (cleanupComplete) return [];
    cleanupComplete = true;
    stopped = true;
    const cleanupErrors = [];

    if (timer !== null) {
      const activeTimer = timer;
      timer = null;
      try {
        cancel(activeTimer);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    for (const { target, eventName, handler } of listeners.reverse()) {
      try {
        target.removeEventListener(eventName, handler);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    listeners.length = 0;
    return cleanupErrors;
  };
  const cleanupOrThrow = (errors, message) => {
    if (errors.length > 0) {
      throw new AggregateError(errors, message);
    }
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
  try {
    activityEvents.forEach((eventName) => {
      const handler = eventName === 'pointermove'
        ? () => {
          if (now() - lastMoveCheckAt < 1_000) return;
          lastMoveCheckAt = now();
          recordActivity();
        }
        : recordActivity;
      addListener(windowObject, eventName, handler, { passive: true });
    });
    addListener(windowObject, 'focus', handleVisibility);
    addListener(windowObject, 'pageshow', handleVisibility);
    addListener(windowObject, 'storage', handleStorage);
    addListener(windowObject, 'voxreview_superadmin_timeout_change', () => checkTimeout());
    checkTimeout(initialPreference);
    addListener(documentObject, 'visibilitychange', handleVisibility);
  } catch (initializationError) {
    const cleanupErrors = cleanup();
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [initializationError, ...cleanupErrors],
        'Super Admin inactivity monitor initialization and cleanup failed.',
        { cause: initializationError },
      );
    }
    throw initializationError;
  }

  return () => {
    cleanupOrThrow(cleanup(), 'Super Admin inactivity monitor cleanup failed.');
  };
}
