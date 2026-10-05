import { API_BASE_URL } from '../../services/apiConfig.js';

const PLATFORM_AVAILABILITY_URL = `${API_BASE_URL}/api/health/platforms`;

export async function fetchPlatformAvailability(
  platform,
  fetchImpl = globalThis.fetch,
) {
  const platformKey = String(platform || '').trim().toLowerCase();
  if (!platformKey) {
    throw new Error('A supported platform is required to check availability.');
  }

  const response = await fetchImpl(
    `${PLATFORM_AVAILABILITY_URL}/${encodeURIComponent(platformKey)}/availability`,
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
}
