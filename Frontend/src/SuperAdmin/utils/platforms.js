const SUPPORTED_PLATFORM_CODES = Object.freeze(['shopee', 'lazada', 'googleplay', 'steam']);

const PLATFORM_CODES_BY_NAME = Object.freeze({
  Shopee: 'shopee',
  Lazada: 'lazada',
  'Google Play Store': 'googleplay',
  Steam: 'steam',
});

function getPlatformCode(platform) {
  const code = String(platform?.platform || platform?.code || '').trim().toLowerCase();
  if (code) return code;
  return PLATFORM_CODES_BY_NAME[platform?.name] || null;
}

export function isSupportedPlatformCode(platformCode) {
  return SUPPORTED_PLATFORM_CODES.includes(String(platformCode || '').trim().toLowerCase());
}

export function filterSupportedPlatforms(platforms) {
  if (!Array.isArray(platforms)) return [];
  return platforms.filter((platform) => isSupportedPlatformCode(getPlatformCode(platform)));
}
