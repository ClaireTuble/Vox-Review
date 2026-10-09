import { API_BASE_URL } from '../../services/apiConfig.js';

const PLATFORM_AVAILABILITY_URL = `${API_BASE_URL}/api/health/platforms`;
export const PLATFORM_AVAILABILITY_TIMEOUT_MS = 30_000;
export const PLATFORM_AVAILABILITY_CACHE_TTL_MS = 30_000;

export function createPlatformAvailabilityChecker({
  fetchAvailability = fetchPlatformAvailability,
  cacheTtlMs = PLATFORM_AVAILABILITY_CACHE_TTL_MS,
  now = Date.now,
} = {}) {
  const cache = new Map();
  const inFlight = new Map();

  function get(platform) {
    const platformKey = String(platform || '').trim().toLowerCase();
    const entry = cache.get(platformKey);
    if (!entry) return null;
    if (now() - entry.checkedAt >= cacheTtlMs) {
      cache.delete(platformKey);
      return null;
    }
    return entry.result;
  }

  function check(platform, { force = false } = {}) {
    const platformKey = String(platform || '').trim().toLowerCase();
    if (!platformKey) {
      return Promise.reject(new Error('A supported platform is required to check availability.'));
    }
    if (inFlight.has(platformKey)) return inFlight.get(platformKey);
    if (!force) {
      const cachedResult = get(platformKey);
      if (cachedResult) return Promise.resolve(cachedResult);
    }

    const request = Promise.resolve()
      .then(() => fetchAvailability(platformKey))
      .then((result) => {
        cache.set(platformKey, { result, checkedAt: now() });
        return result;
      })
      .finally(() => {
        if (inFlight.get(platformKey) === request) inFlight.delete(platformKey);
      });
    inFlight.set(platformKey, request);
    return request;
  }

  return { check, get };
}

export async function fetchPlatformAvailability(
  platform,
  fetchImpl = globalThis.fetch,
  timeoutMs = PLATFORM_AVAILABILITY_TIMEOUT_MS,
) {
  const platformKey = String(platform || '').trim().toLowerCase();
  if (!platformKey) {
    throw new Error('A supported platform is required to check availability.');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(
      `${PLATFORM_AVAILABILITY_URL}/${encodeURIComponent(platformKey)}/availability`,
      { signal: controller.signal },
    );
    const payload = await response.json();
    if (!response.ok || !payload?.success || typeof payload.is_active !== 'boolean') {
      const error = new Error(payload?.message || payload?.error || 'Unable to verify platform availability.');
      error.code = payload?.error || null;
      throw error;
    }

    return {
      platform: payload.platform,
      name: payload.name,
      isActive: payload.is_active,
    };
  } catch (error) {
    if (timedOut) {
      throw new Error('Platform availability check timed out.', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
