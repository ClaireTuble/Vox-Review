function detectPlatform() {
    const host = window.location.hostname.toLowerCase();

    // Steam Store and the Community "See All Reviews" route.
    if (host === "store.steampowered.com" || host.endsWith(".steampowered.com") || host.includes("steampowered.com")) {
        return "steam";
    }
    if (
        host === "steamcommunity.com" &&
        /^\/app\/\d+\/reviews\/?$/i.test(path)
    ) {
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