export function isReviewEligibleForAggregates(review) {
  return review?.aggregateEligible !== false;
}

export function filterEligibleReviewEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => (
    entry?.aggregateEligible !== false &&
    isReviewEligibleForAggregates(entry?.review ?? entry)
  ));
}
