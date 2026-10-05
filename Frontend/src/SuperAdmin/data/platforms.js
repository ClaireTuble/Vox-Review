import authService from '../../services/authService.js';

let cachedPlatforms = null;

/**
 * Returns the last successfully fetched health data array from memory cache,
 * or null if no fetch has occurred yet.
 */
export function getCachedPlatformHealth() {
  return cachedPlatforms;
}

export function requestPlatformHealth(platform) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Health checks require a browser page.'));
  }

  const requestId = `${platform}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const onResult = (event) => {
      if (event.detail?.requestId !== requestId) return;
      clearTimeout(timeoutId);
      window.removeEventListener('voxreview_health_check_result', onResult);
      if (event.detail?.ok === false && !event.detail?.status) {
        reject(new Error('The extension could not run the health check.'));
      } else {
        resolve(event.detail);
      }
    };

    const timeoutId = setTimeout(() => {
      window.removeEventListener('voxreview_health_check_result', onResult);
      reject(new Error('The extension health check timed out.'));
    }, 50_000);

    window.addEventListener('voxreview_health_check_result', onResult);
    window.dispatchEvent(new CustomEvent('voxreview_health_check', {
      detail: { platform, requestId },
    }));
  });
}

const BACKEND_URLS = ['http://localhost:5000', 'http://127.0.0.1:5000'];

/**
 * Fetches real platform health data from the backend API.
 * Tries localhost then 127.0.0.1 to avoid IPv4/IPv6 DNS resolution mismatches.
 * Updates the in-memory cache on success.
 *
 * @returns {Promise<Array>} Array of platform health objects
 * @throws {Error} If the backend is unreachable on all URLs
 */
export async function fetchPlatformHealth() {
  let lastError = null;

  for (const baseUrl of BACKEND_URLS) {
    try {
      const res = await fetch(`${baseUrl}/api/health/status`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.success) {
        cachedPlatforms = data.platforms;
        return data.platforms;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Health API unreachable on localhost:5000 and 127.0.0.1:5000');
}

/**
 * Fallback data used ONLY when the backend is unreachable.
 * All scraping statuses are "Unavailable" — never fake "Working".
 */
export const FALLBACK_PLATFORMS = [
  {
    name: 'Shopee',
    category: 'E-Commerce',
    domain: 'shopee.ph',
    supportStatus: 'Supported',
    platformStatus: 'Active',
    scrapingStatus: 'Unavailable',
    lastChecked: 'Never',
    lastSuccessfulCheck: 'Never',
    errorCount: 0,
    lastError: null,
    errorStatus: null,
    errorStage: null,
    errorMessage: null,
    status: 'Unavailable',
    statusBg: 'rgba(107,114,128,0.08)',
    statusColor: '#9CA3AF',
  },
  {
    name: 'Lazada',
    category: 'E-Commerce',
    domain: 'lazada.com.ph',
    supportStatus: 'Supported',
    platformStatus: 'Active',
    scrapingStatus: 'Unavailable',
    lastChecked: 'Never',
    lastSuccessfulCheck: 'Never',
    errorCount: 0,
    lastError: null,
    errorStatus: null,
    errorStage: null,
    errorMessage: null,
    status: 'Unavailable',
    statusBg: 'rgba(107,114,128,0.08)',
    statusColor: '#9CA3AF',
  },
  {
    name: 'Google Maps',
    category: 'Places & Maps',
    domain: 'google.com/maps',
    supportStatus: 'Supported',
    platformStatus: 'Active',
    scrapingStatus: 'Unavailable',
    lastChecked: 'Never',
    lastSuccessfulCheck: 'Never',
    errorCount: 0,
    lastError: null,
    errorStatus: null,
    errorStage: null,
    errorMessage: null,
    status: 'Unavailable',
    statusBg: 'rgba(107,114,128,0.08)',
    statusColor: '#9CA3AF',
  },
  {
    name: 'Google Play Store',
    category: 'Mobile Apps',
    domain: 'play.google.com',
    supportStatus: 'Supported',
    platformStatus: 'Active',
    scrapingStatus: 'Unavailable',
    lastChecked: 'Never',
    lastSuccessfulCheck: 'Never',
    errorCount: 0,
    lastError: null,
    errorStatus: null,
    errorStage: null,
    errorMessage: null,
    status: 'Unavailable',
    statusBg: 'rgba(107,114,128,0.08)',
    statusColor: '#9CA3AF',
  },
  {
    name: 'Steam',
    category: 'Gaming',
    domain: 'store.steampowered.com',
    supportStatus: 'Supported',
    platformStatus: 'Active',
    scrapingStatus: 'Unavailable',
    lastChecked: 'Never',
    lastSuccessfulCheck: 'Never',
    errorCount: 0,
    lastError: null,
    errorStatus: null,
    errorStage: null,
    errorMessage: null,
    status: 'Unavailable',
    statusBg: 'rgba(107,114,128,0.08)',
    statusColor: '#9CA3AF',
  },
];

/**
 * Toggles a platform's is_active state via the Super Admin API.
 * Requires a valid Super Admin access token.
 *
 * @param {string} platformKey - e.g. 'shopee', 'lazada', 'google', 'googleplay', 'steam'
 * @param {string} [accessToken] - Super Admin JWT (auto-fetched if not provided)
 * @param {boolean|null} [desiredStatus=null] - true → Active, false → Disabled, null → toggle
 * @param {string|null} [confirmationPassword=null] - Super Admin password for disabling
 * @returns {Promise<Object>} Updated platform object from the backend
 */
export async function togglePlatformActive(
  platformKey,
  accessToken = null,
  desiredStatus = null,
  confirmationPassword = null,
) {
  let token = accessToken;
  if (!token) {
    token = await authService.getSuperAdminAccessToken();
  }

  let lastError = null;

  for (const baseUrl of BACKEND_URLS) {
    let responseReceived = false;
    try {
      const body = {
        ...(desiredStatus !== null ? { is_active: desiredStatus } : {}),
        ...(confirmationPassword !== null ? { confirmationPassword } : {}),
      };
      const res = await fetch(`${baseUrl}/api/admin/platforms/${encodeURIComponent(platformKey)}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      responseReceived = true;
      const data = await res.json();
      if (res.ok && data.success) {
        return {
          ...data.platform,
          ...(typeof data.auditRecorded === 'boolean' ? { auditRecorded: data.auditRecorded } : {}),
        };
      }
      throw new Error(data.message || data.error || 'Failed to toggle platform status.');
    } catch (err) {
      if (responseReceived) throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('Toggle API unreachable.');
}
