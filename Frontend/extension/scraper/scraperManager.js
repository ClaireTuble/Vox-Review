function scrapeReviews(platform) {

    switch (platform) {

        case "shopee":
            return scrapeShopeeReviews();


        case "lazada":
            return scrapeLazadaReviews();


        case "google":
            return scrapeGoogleReviews();


        case "googleplay":
            return scrapeGooglePlayReviews();


        case "agoda":
            return scrapeAgodaReviews();


        default:
            return [];
    }

}