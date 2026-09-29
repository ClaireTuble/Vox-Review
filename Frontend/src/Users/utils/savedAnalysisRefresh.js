import { getReviewText } from './reviewTopics.js';

const SYNTHETIC_REVIEW_ID = /^(?:shopee|lazada|google|googleplay|steam)(?:-dom)?-review-\d+$/i;

function normalizeIdentityPart(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
    : '';
}

function hasUnstableReviewId(review, id) {
  if (SYNTHETIC_REVIEW_ID.test(id)) return true;

  const reviewer = normalizeIdentityPart(
    review.reviewer ?? review.author ?? review.userName ?? review.reviewerName ?? '',
  );
  const date = normalizeIdentityPart(review.date ?? review.reviewDate ?? '');
  if (reviewer && date && new RegExp(`^${reviewer.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}-${date.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}-\\d+$`, 'i').test(id)) {
    return true;
  }

  const steamAuthorId = reviewer.match(/^steam user (\d{15,20})$/)?.[1];
  return Boolean(steamAuthorId && id === steamAuthorId);
}

export function getSavedReviewIdentity(review) {
  const text = normalizeIdentityPart(getReviewText(review));
  if (!text) return '';

  if (review && typeof review === 'object') {
    const id = normalizeIdentityPart(review.id ?? review.reviewId ?? '');
    if (id && !hasUnstableReviewId(review, id)) return `id:${id}`;

    const reviewer = normalizeIdentityPart(
      review.reviewer ?? review.author ?? review.userName ?? review.reviewerName ?? '',
    );
    return `text:${text}|reviewer:${reviewer}`;
  }

  return `text:${text}|reviewer:`;
}

export function getNewReviews(existingReviews, fetchedReviews) {
  const knownIdentities = new Set(
    (Array.isArray(existingReviews) ? existingReviews : [])
      .map(getSavedReviewIdentity)
      .filter(Boolean),
  );
  const newIdentities = new Set();

  return (Array.isArray(fetchedReviews) ? fetchedReviews : []).filter((review) => {
    const identity = getSavedReviewIdentity(review);
    if (!identity || knownIdentities.has(identity) || newIdentities.has(identity)) return false;
    newIdentities.add(identity);
    return true;
  });
}
