export const DEFAULT_TOPIC_PROCESS_TIMEOUT_BASE_MS = 150_000;
export const DEFAULT_TOPIC_PROCESS_TIMEOUT_PER_REVIEW_MS = 12_000;

export function getTopicProcessTimeoutMs(
  reviewCount,
  {
    baseMs = Number(process.env.TOPIC_PROCESS_TIMEOUT_BASE_MS || DEFAULT_TOPIC_PROCESS_TIMEOUT_BASE_MS),
    perReviewMs = Number(process.env.TOPIC_PROCESS_TIMEOUT_PER_REVIEW_MS || DEFAULT_TOPIC_PROCESS_TIMEOUT_PER_REVIEW_MS),
  } = {},
) {
  return baseMs + reviewCount * perReviewMs;
}
