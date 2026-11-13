(function () {
  // Keep platform collection disabled until authorization has been reviewed for each source.
  const collectionEnabled = {
    steam: false,
    googleplay: false,
    shopee: false,
    lazada: false,
  };

  function parseNonNegativeSafeInteger(value) {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(normalized)) return null;
    const parsed = Number(normalized.replace(/,/g, ""));
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  function buildHelpfulnessFields(platform, metric, count) {
    if (globalThis.__voxreviewHelpfulnessCollection?.[platform] !== true || count === null) {
      return {
        helpfulCount: null,
        helpfulnessMetric: null,
        helpfulnessAvailable: false,
      };
    }
    return {
      helpfulCount: count,
      helpfulnessMetric: metric,
      helpfulnessAvailable: true,
    };
  }

  globalThis.__voxreviewHelpfulnessCollection = collectionEnabled;
  globalThis.__voxreviewHelpfulness = {
    parseNonNegativeSafeInteger,
    isCollectionEnabled: (platform) => globalThis.__voxreviewHelpfulnessCollection?.[platform] === true,
    buildHelpfulnessFields,
  };
}());
