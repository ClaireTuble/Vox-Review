const TOPIC_LABELS = [
  'Quality', 'Performance / Functionality', 'Features / Content', 'Service / Support',
  'Delivery / Transaction', 'Price / Value', 'Usability / Experience',
  'Accuracy / Expectations', 'Availability / Accessibility', 'Environment / Location', 'Other / General',
];

const COMMON_REVIEW_WORDS = new Set([
  'about', 'after', 'again', 'also', 'ang', 'and', 'are', 'been', 'but', 'can', 'did',
  'for', 'from', 'have', 'ita', 'its', 'just', 'kung', 'mga', 'more', 'not', 'only',
  'really', 'this', 'that', 'the', 'then', 'they', 'their', 'there', 'very', 'was',
  'were', 'with', 'yung', 'para', 'pero', 'may', 'mga', 'ng', 'na', 'naman', 'po',
  'ito', 'sa', 'ako', 'ko', 'mo', 'siya', 'sya', 'din', 'rin', 'lang', 'to', 'at',
]);

export function getReviewText(review) {
  if (typeof review === 'string') return review;
  if (review && typeof review === 'object') {
    return review.text || review.reviewText || review.comment || review.review || '';
  }
  return '';
}

function unwrapReview(entry) {
  return Number.isInteger(entry?.topicResultIndex) ? entry.review : entry;
}

export function getMeaningfulKeywords(reviews) {
  const frequencies = new Map();
  reviews.forEach((entry) => {
    const words = getReviewText(unwrapReview(entry)).toLowerCase().match(/[a-z][a-z0-9'-]*/g) || [];
    const uniqueWords = new Set(words.filter((word) => word.length > 2 && !COMMON_REVIEW_WORDS.has(word)));
    uniqueWords.forEach((word) => frequencies.set(word, (frequencies.get(word) || 0) + 1));
  });
  return [...frequencies.entries()]
    .sort(([, first], [, second]) => second - first)
    .slice(0, 6)
    .map(([word]) => word);
}

export function aggregateTopicsForReviews(reviews, topicAnalysis, selectedCategory = null) {
  const topicResults = Array.isArray(topicAnalysis?.results) ? topicAnalysis.results : [];
  const seenReviewIndexes = new Set();
  const uniqueReviews = reviews.filter((entry, index) => {
    const resultIndex = Number.isInteger(entry?.topicResultIndex) ? entry.topicResultIndex : index;
    if (seenReviewIndexes.has(resultIndex)) return false;
    seenReviewIndexes.add(resultIndex);
    return true;
  });
  const eligibleReviews = uniqueReviews.filter((entry) => (
    selectedCategory == null || entry.category === selectedCategory
  ));
  const totalReviews = eligibleReviews.length;

  return TOPIC_LABELS.map((label) => {
    const topicReviews = eligibleReviews.filter((entry, index) => {
      const resultIndex = Number.isInteger(entry?.topicResultIndex) ? entry.topicResultIndex : index;
      const result = topicResults[resultIndex];
      return (result?.reviewIndex == null || result.reviewIndex === resultIndex) &&
        result?.topics?.some((topic) => topic.label === label);
    });
    const count = topicReviews.length;
    return {
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label,
      count,
      percentage: totalReviews ? Number(((count / totalReviews) * 100).toFixed(1)) : 0,
      keywords: getMeaningfulKeywords(topicReviews),
      reviews: topicReviews.slice(0, 3).map((entry) => getReviewText(unwrapReview(entry))).filter(Boolean),
    };
  });
}
