console.log("Shopee scraper started");

function getShopeeProductMetadata() {
  // Extract Title
  const titleEl = document.querySelector("div._44qVwb, div.WB2BS, [class*='product-title'], h1");
  let productTitle = titleEl ? titleEl.innerText?.trim() : "";
  if (!productTitle && document.title) {
    productTitle = document.title.split("|")[0].split("-")[0].trim();
  }

  // Extract Product Image (main product gallery image only)
  const imgEl = document.querySelector(
    "div.page-product__image img, div[class*='product-image'] img, [class*='gallery'] img, [class*='product'] img[src*='scontent']"
  );
  const productImage = imgEl ? (imgEl.src || imgEl.getAttribute("src")) : null;

  console.log("[Shopee] Product image:", productImage);

  // Extract Rating
  const ratingEl = document.querySelector("._1k47d8, [class*='rating-overview'] [class*='score'], div._12r-bH");
  const rating = ratingEl ? ratingEl.innerText?.trim() : null;

  // Extract Category
  const breadcrumbEls = document.querySelectorAll(".shopee-header-section__content a, [class*='breadcrumb'] a");
  let category = null;
  if (breadcrumbEls && breadcrumbEls.length > 0) {
    const categories = Array.from(breadcrumbEls).map(el => el.innerText?.trim()).filter(Boolean);
    category = categories.join(" / ");
  }

  return {
    productTitle: productTitle || "Shopee Product",
    productImage: productImage,
    rating: rating || "4.8",
    category: category || "Shopee Products"
  };
}

function scrapeShopeeReviews() {
  const cards = document.querySelectorAll("[data-cmtid]");

  console.log("Found review cards:", cards.length);

  const reviews = [];

  cards.forEach((card) => {
    const text = card.innerText?.trim();
    const cmtId = card.getAttribute("data-cmtid");

    if (text) {
      reviews.push({
        id: cmtId || text,
        text: text,
        platform: "shopee"
      });
    }
  });

  const metadata = getShopeeProductMetadata();
  console.log("Product metadata extracted:", metadata);

  return {
    ...metadata,
    reviews: reviews
  };
}