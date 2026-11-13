export function createSavedAnalysesRequestGuard() {
  let activeUserId = null;
  let requestGeneration = 0;

  return {
    setActiveUser(userId) {
      if (userId === activeUserId) return;
      activeUserId = userId;
      requestGeneration += 1;
    },

    begin(userId) {
      const generation = ++requestGeneration;
      return {
        isCurrent: () => userId === activeUserId && generation === requestGeneration,
      };
    },

    invalidateAll() {
      requestGeneration += 1;
    },
  };
}

export function getSavedAnalysesForUser(state, userId) {
  return userId && state?.userId === userId && Array.isArray(state.items)
    ? state.items
    : [];
}
