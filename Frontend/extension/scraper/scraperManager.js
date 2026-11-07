/**
 * scraperManager.js
 *
 * Routes the scrape call to the correct platform scraper.
 * Only platforms with registered scrapers are listed here.
 * Agoda is intentionally excluded (disabled, not deleted).
 */
function scrapeReviews(platform) {
    switch (platform) {

        case "shopee":
            return scrapeShopeeReviews();

        case "lazada":
            return scrapeLazadaReviews();

        case "googleplay":
            return scrapeGooglePlayReviews();

        case "steam":
            return scrapeSteamReviews();

        default:
            return [];
    }
}