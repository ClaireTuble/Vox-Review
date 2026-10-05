import { API_BASE_URL } from '../../services/apiConfig.js';

export const SVM_REQUEST_TIMEOUT_MS = 65_000;

const SVM_API_URL = `${API_BASE_URL}/api/nlp/svm/predict`;

export async function requestSvmBatch(reviews, {
  platform,
  fetchImpl = globalThis.fetch,
  timeoutMs = SVM_REQUEST_TIMEOUT_MS,
  onFailure = () => {},
} = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(SVM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviews, platform }),
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      const requestError = new Error(payload?.message || payload?.error || 'SVM analysis failed.');
      requestError.code = payload?.error || null;
      throw requestError;
    }
    return payload;
  } catch (error) {
    const requestError = timedOut
      ? Object.assign(new Error(`SVM analysis timed out after ${timeoutMs / 1000} seconds. Please retry.`), {
          name: 'TimeoutError',
          code: 'ETIMEDOUT',
        })
      : error;
    onFailure(requestError);
    throw requestError;
  } finally {
    clearTimeout(timeoutId);
  }
}