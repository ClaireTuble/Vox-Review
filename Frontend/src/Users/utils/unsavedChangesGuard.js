export function createUnsavedChangesGuard() {
  let pendingAction = null;

  return {
    request(action, shouldConfirm, onConfirmationRequired) {
      if (shouldConfirm) {
        pendingAction = action;
        onConfirmationRequired();
        return false;
      }

      action();
      return true;
    },
    cancel() {
      pendingAction = null;
    },
    confirm(discardChanges) {
      const action = pendingAction;
      pendingAction = null;
      if (!action) return;
      discardChanges();
      action();
    },
  };
}
