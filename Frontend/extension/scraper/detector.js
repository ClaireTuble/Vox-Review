// Supported platforms. Add new entries here when a new site is added.
const SUPPORTED_PLATFORMS = ["shopee", "lazada", "googleplay", "google", "steam"];

function detectPlatform() {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    const href = window.location.href.toLowerCase();

    if (host === "store.steampowered.com" || host.endsWith(".steampowered.com")) {
        const steamAppMatch = href.match(/https?:\/\/store\.steampowered\.com\/app\/(\d+)(?:\/|$)/i);
        if (steamAppMatch && path.startsWith("/app/")) {
            return "steam";
        }
    }

    // Google Play must be checked BEFORE generic Google to avoid mis-detection.
    if (host === "play.google.com" || host.startsWith("play.google.")) {
        return "googleplay";
    }

    if (host.includes("shopee") || href.includes("shopee.")) {
        return "shopee";
    }

    if (host.includes("lazada") || href.includes("lazada.")) {
        return "lazada";
    }

    // Google Maps: must be on a maps URL, not just any google.com page.
    if (
        (host === "www.google.com" || host === "maps.google.com" || host.endsWith(".google.com") || host.endsWith(".google.com.ph")) &&
        (path.startsWith("/maps") || host.startsWith("maps."))
    ) {
        return "google";
    }

    // Any other host → unsupported
    return "unknown";
}