export function clearPopupAuthState({
  authService,
  lastAuthUserIdRef,
  profileRefreshRef,
  setAuthenticatedUser,
  setAuthToastMessage,
}) {
  lastAuthUserIdRef.current = null;
  profileRefreshRef.current = { userId: null, promise: null };
  authService.clearSessionLocally();
  setAuthenticatedUser(null);
  setAuthToastMessage('');
}
