const PLATFORM_DOMAINS = Object.freeze({
  shopee: ['shopee.ph', 'shopee.com', 'shopee.co.id', 'shopee.com.my', 'shopee.sg', 'shopee.tw', 'shopee.vn'],
  lazada: ['lazada.com.ph', 'lazada.com', 'lazada.co.id', 'lazada.com.my', 'lazada.sg', 'lazada.vn'],
});

function matchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function detectPlatformFromUrl(urlString) {
  if (typeof urlString !== 'string' || !urlString.trim()) return 'unknown';

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return 'unknown';
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'unknown';
  const host = url.hostname.toLowerCase();
  if (matchesDomain(host, 'store.steampowered.com') || host.endsWith('.steampowered.com')) return 'steam';
  if (host === 'play.google.com') return 'googleplay';
  if (PLATFORM_DOMAINS.shopee.some((domain) => matchesDomain(host, domain))) return 'shopee';
  if (PLATFORM_DOMAINS.lazada.some((domain) => matchesDomain(host, domain))) return 'lazada';
  return 'unknown';
}
