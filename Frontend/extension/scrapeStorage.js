function getNormalizedReviewIdentity(review) {
  const text = typeof review === "string"
    ? review
    : review && typeof review === "object"
      ? [
        review.text,
        review.reviewText,
        review.comment,
        review.review,
        review.content,
        review.body,
        review.reviewBody,
      ].find((value) => typeof value === "string" && value.trim()) || ""
      : "";
  return text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function hasValidHelpfulness(review) {
  return review?.helpfulnessAvailable === true &&
    Number.isSafeInteger(review.helpfulCount) &&
    review.helpfulCount >= 0 &&
    ["helpful_votes", "review_likes"].includes(review.helpfulnessMetric);
}

function mergeReviewRefresh(existing, incoming) {
  if (!existing || typeof existing !== "object" || !incoming || typeof incoming !== "object") {
    return existing;
  }
  if (hasValidHelpfulness(incoming)) {
    return {
      ...existing,
      helpfulCount: incoming.helpfulCount,
      helpfulnessMetric: incoming.helpfulnessMetric,
      helpfulnessAvailable: true,
    };
  }
  const hasMetadata = [
    "helpfulCount",
    "helpfulnessMetric",
    "helpfulnessAvailable",
  ].some((key) => Object.hasOwn(existing, key) || Object.hasOwn(incoming, key));
  if (hasValidHelpfulness(existing) || !hasMetadata) {
    return existing;
  } else {
    return {
      ...existing,
      helpfulCount: null,
      helpfulnessMetric: null,
      helpfulnessAvailable: false,
    };
  }
}

function mergeUniqueReviewRecords(existingReviews, incomingReviews) {
  const merged = [];
  const reviewIndexesByText = new Map();
  existingReviews.forEach((review) => {
    const normalizedText = getNormalizedReviewIdentity(review);
    if (normalizedText && reviewIndexesByText.has(normalizedText)) return;
    if (normalizedText) reviewIndexesByText.set(normalizedText, merged.length);
    merged.push(review);
  });
  incomingReviews.forEach((review) => {
    const normalizedText = getNormalizedReviewIdentity(review);
    if (normalizedText && reviewIndexesByText.has(normalizedText)) {
      const index = reviewIndexesByText.get(normalizedText);
      merged[index] = mergeReviewRefresh(merged[index], review);
      return;
    }
    if (normalizedText) reviewIndexesByText.set(normalizedText, merged.length);
    merged.push(review);
  });
  return merged;
}

export function resolveScrapeReviews({
  currentScrape = {},
  incomingReviews,
  productTitle,
  pageUrl,
  ratingFilter,
  forceRefresh = false,
}) {
  const isDifferentProduct = currentScrape.productTitle &&
    currentScrape.productTitle !== productTitle;
  const isDifferentUrl = currentScrape.url && pageUrl &&
    currentScrape.url !== pageUrl;
  const isDifferentFilter = currentScrape.ratingFilter !== undefined &&
    currentScrape.ratingFilter !== ratingFilter;
  const sameScrapeContext = Boolean(currentScrape.sessionId) &&
    !isDifferentProduct && !isDifferentUrl && !isDifferentFilter;

  if (incomingReviews.length === 0 && sameScrapeContext) {
    return Array.isArray(currentScrape.reviews) ? currentScrape.reviews : [];
  }

  const productChanged = forceRefresh || isDifferentProduct || isDifferentUrl ||
    isDifferentFilter || !currentScrape.sessionId;
  return productChanged
    ? incomingReviews
    : mergeUniqueReviewRecords(currentScrape.reviews || [], incomingReviews);
}
