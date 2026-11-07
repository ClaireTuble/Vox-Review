function detectPlatform() {
    const host = window.location.hostname.toLowerCase();

    // Steam Store (store.steampowered.com)
    if (host === "store.steampowered.com" || host.endsWith(".steampowered.com") || host.includes("steampowered.com")) {
        return "steam";
    }

    // Google Play must be checked BEFORE generic Google to avoid mis-detection.
    if (host === "play.google.com" || host.startsWith("play.google.") || host.includes("play.google")) {
        return "googleplay";
    }

    if (host.includes("shopee")) {
        return "shopee";
    }

    if (host.includes("lazada")) {
        return "lazada";
    }

    // Any other host → unsupported
    return "unknown";
}