const GOOGLE_SIGN_IN_CANCELLED = 'Google sign-in was cancelled. Please try again.';
const GOOGLE_SIGN_IN_FAILED = 'Google sign-in could not be completed. Please try again.';

export function createGoogleOAuthSessionGate(initiallyBlocked = false) {
  let blocked = initiallyBlocked;

  return {
    isBlocked: () => blocked,
    canPersistRegularUserSession: (verifiedOAuthSession = false) => (
      !blocked || verifiedOAuthSession
    ),
    block: () => {
      blocked = true;
    },
    release: () => {
      blocked = false;
    },
    run: async (callback) => {
      blocked = true;
      try {
        const result = await callback();
        blocked = false;
        return result;
      } catch (error) {
        blocked = true;
        throw error;
      }
    },
  };
}

export function createGoogleOAuthSuccessNavigator(navigate) {
  let hasNavigated = false;

  return (result) => {
    if (!result?.success || hasNavigated) return false;
    hasNavigated = true;
    navigate('/after-login', { replace: true });
    return true;
  };
}

export function isGoogleOAuthCallback(url) {
  try {
    const parsedUrl = new URL(url);
    const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
    return [
      'code',
      'error',
      'error_code',
      'error_description',
      'access_token',
      'refresh_token',
    ].some((parameter) => parsedUrl.searchParams.has(parameter) || hashParams.has(parameter));
  } catch {
    return false;
  }
}

function getCallbackError(url) {
  try {
    const parsedUrl = new URL(url);
    const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
    const error = parsedUrl.searchParams.get('error') ||
      parsedUrl.searchParams.get('error_code') ||
      hashParams.get('error') ||
      hashParams.get('error_code');
    const errorDescription = parsedUrl.searchParams.get('error_description') ||
      hashParams.get('error_description');
    if (!error) return errorDescription ? GOOGLE_SIGN_IN_FAILED : null;
    return error.toLowerCase() === 'access_denied'
      ? GOOGLE_SIGN_IN_CANCELLED
      : GOOGLE_SIGN_IN_FAILED;
  } catch {
    return GOOGLE_SIGN_IN_FAILED;
  }
}

function isSuccessfulOAuthCallback(url) {
  try {
    const parsedUrl = new URL(url);
    const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
    return Boolean(
      parsedUrl.searchParams.get('code') ||
      hashParams.get('code') ||
      parsedUrl.searchParams.get('access_token') ||
      hashParams.get('access_token'),
    );
  } catch {
    return false;
  }
}

export async function completeGoogleOAuthSession({
  supabaseClient,
  callbackUrl,
  hasPendingSignIn = false,
  persistSession,
  clearSession,
}) {
  let userId = null;

  try {
    const callbackError = getCallbackError(callbackUrl);
    if (callbackError) throw new Error(callbackError);
    if (!isSuccessfulOAuthCallback(callbackUrl) && !hasPendingSignIn) {
      throw new Error(GOOGLE_SIGN_IN_FAILED);
    }

    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;

    const session = sessionData?.session;
    userId = session?.user?.id || null;
    if (!session?.access_token || !userId) throw new Error(GOOGLE_SIGN_IN_FAILED);

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(
      session.access_token,
    );
    if (userError || !userData?.user || userData.user.id !== userId) {
      throw new Error(GOOGLE_SIGN_IN_FAILED);
    }

    const persistedSession = persistSession({ ...session, user: userData.user });
    if (!persistedSession) throw new Error(GOOGLE_SIGN_IN_FAILED);
    return { success: true, session: persistedSession };
  } catch (error) {
    await clearSession(userId);
    if (error?.message === GOOGLE_SIGN_IN_CANCELLED) throw error;
    throw new Error(GOOGLE_SIGN_IN_FAILED, { cause: error });
  }
}
