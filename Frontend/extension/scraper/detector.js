function detectPlatform() {

    const host = window.location.hostname.toLowerCase();

    if (host.includes("shopee")) {
        return "shopee";
    }

    if (host.includes("lazada")) {
        return "lazada";
    }

    if (host.includes("play.google") || host.includes("play.google.com")) {
        return "googleplay";
    }

    if (host.includes("agoda")) {
        return "agoda";
    }

    if (host.includes("google")) {
        return "google";
    }

    return "unknown";
}