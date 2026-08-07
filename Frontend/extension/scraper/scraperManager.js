function scrapeReviews(platform) {

    switch (platform) {

        case "shopee":
            return scrapeShopeeReviews();


        case "lazada":
            return scrapeLazadaReviews();


        case "google":
            return scrapeGoogleReviews();


        default:
            return [];
    }

}