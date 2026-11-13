export function getSupabaseConfigurationError(url, anonKey) {
  const projectUrl = typeof url === 'string' ? url.trim() : '';
  const publicAnonKey = typeof anonKey === 'string' ? anonKey.trim() : '';

  if (!projectUrl) {
    return 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (or their VITE_ equivalents).';
  }
  if (!publicAnonKey) {
    return 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (or their VITE_ equivalents).';
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(projectUrl);
  } catch {
    return 'Supabase is misconfigured. Set VITE_SUPABASE_URL to the project URL.';
  }

  const [projectName, serviceDomain, topLevelDomain] = parsedUrl.hostname.toLowerCase().split('.');
  if (!['https:', 'http:'].includes(parsedUrl.protocol) ||
      (projectName === 'example' && serviceDomain === 'supabase' && topLevelDomain === 'co')) {
    return 'Supabase is misconfigured. Replace the placeholder VITE_SUPABASE_URL with the project URL.';
  }

  return null;
}

export function getSupabaseProjectOrigin(url) {
  return new URL(url).origin;
}
