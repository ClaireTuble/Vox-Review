console.log("Shopee scraper loaded");

function isShopeeProductPage() {
  const href = window.location.href;
  const path = window.location.pathname;

  const hasProductUrl = /-i\.\d+\.\d+/i.test(href) || /\/product\//i.test(path) || /\/i\//i.test(path) || /itemid=/i.test(href) || /flash_sale/i.test(path);

  const hasProductDom = !!document.querySelector(
    ".page-product, [class*='page-product'], [data-cmtid], .shopee-product-rating, div._44qVwb, div.WB2BS, [class*='product-title'], h1, [class*='product-name'], [class*='product-detail']"
  );

  const reviewishDom = !!document.querySelector(
    "[class*='rating'], [class*='review'], [class*='comment'], [class*='feedback'], [data-cmtid]"
  );

  if (path === "/" || path === "" || path.includes("/search") || path.includes("/cart") || path.includes("/user") || path.includes("/seller")) {
    if (!hasProductDom && !reviewishDom) return false;
  }

  return hasProductUrl || hasProductDom || reviewishDom;
}

function getShopeeProductMetadata() {
  const titleEl = document.querySelector("div._44qVwb, div.WB2BS, [class*='product-title'], h1");
  let productTitle = titleEl ? titleEl.innerText?.trim() : "";
  if (!productTitle && document.title) {
    productTitle = document.title.split("|")[0].split("-")[0].trim();
  }

  const imgEl = document.querySelector(
    "div.page-product__image img, div[class*='product-image'] img, [class*='gallery'] img, [class*='product'] img[src*='scontent']"
  );
  const productImage = imgEl ? (imgEl.src || imgEl.getAttribute("src")) : null;

  const ratingEl = document.querySelector("._1k47d8, [class*='rating-overview'] [class*='score'], div._12r-bH");
  const rating = ratingEl ? ratingEl.innerText?.trim() : null;

  const breadcrumbEls = document.querySelectorAll(".shopee-header-section__content a, [class*='breadcrumb'] a");
  let category = null;
  if (breadcrumbEls && breadcrumbEls.length > 0) {
    const categories = Array.from(breadcrumbEls).map(el => el.innerText?.trim()).filter(Boolean);
    category = categories.join(" / ");
  }

  return {
    productTitle: productTitle || "Shopee Product",
    productImage: productImage,
    rating: rating || null,
    category: category || "Shopee Products",
    ratingFilter: "all",
    productUrl: window.location.href,
  };
}

function cleanShopeeCommentText(text) {
  if (!text) return "";
  let cleaned = text.replace(/\s+/g, " ").trim();

  // Filter out system labels, metadata headers, and non-comment strings
  if (/^(?:Helpful|Report|Translate|Show More|Read Less|Variation:?|Color:?|Size:?)\s*$/i.test(cleaned)) return "";
  if (/^\d+\s*stars?\s*$/i.test(cleaned)) return "";
  if (/^[★☆\s\d\.\/]+$/i.test(cleaned)) return "";
  if (/^(?:Response from seller|Seller Reply):?/i.test(cleaned)) return "";

  return cleaned;
}

function scrapeShopeeReviews() {
  const isProduct = isShopeeProductPage();
  if (!isProduct) {
    console.log("[Shopee] Not a product detail page.");
    return {
      isProductPage: false,
      productTitle: "",
      reviews: [],
    };
  }

  let cards = Array.from(document.querySelectorAll("[data-cmtid], .shopee-product-rating"));

  if (cards.length === 0) {
    cards = Array.from(document.querySelectorAll(
      "[class*='rating'], [class*='review'], [class*='comment'], [class*='feedback']"
    )).filter((node) => {
      const text = (node.innerText || node.textContent || "").trim();
      return text.length > 20 && !/helpful|report|translate|variation|size|color/i.test(text);
    });
  }

  console.log("[Shopee] Found review cards:", cards.length);

  const reviews = [];
  const seenTexts = new Set();

  cards.forEach((card, index) => {
    const cmtId = card.getAttribute("data-cmtid");

    // 1. Reviewer Name
    const reviewerEl = card.querySelector(".shopee-product-rating__author-name, [class*='author-name'], [class*='user-name']");
    let reviewer = reviewerEl ? reviewerEl.innerText?.trim() : "Shopee Buyer";

    // 2. Date
    const dateEl = card.querySelector(".shopee-product-rating__time, [class*='rating__time'], [class*='time']");
    const date = dateEl ? dateEl.innerText?.trim() : "";

    // 3. User Comment Text (target dedicated comment content container)
    const contentEl = card.querySelector(
      ".shopee-product-rating__content, [class*='rating__content'], [class*='comment-text'], ._13c-n7, .Em32B1"
    );

    let text = "";
    if (contentEl) {
      text = cleanShopeeCommentText(contentEl.innerText || contentEl.textContent || "");
    }

    // Fallback: If dedicated container not found, clone card & strip non-comment sub-elements
    if (!text) {
      const clone = card.cloneNode(true);
      const toRemove = clone.querySelectorAll(
        ".shopee-product-rating__seller-reply, [class*='seller-reply'], [class*='author'], [class*='time'], [class*='rating-stars'], [class*='like'], [class*='helpful'], button, svg"
      );
      toRemove.forEach(el => el.remove());
      const rawText = clone.innerText || clone.textContent || "";
      text = cleanShopeeCommentText(rawText);
    }

    // Must be non-empty genuine comment text written by user
    if (!text || text.length < 2) return;

    const key = cmtId || text.toLowerCase();
    if (!seenTexts.has(key)) {
      seenTexts.add(key);
      reviews.push({
        id: cmtId || `shopee-review-${index}`,
        reviewer: reviewer || "Shopee Buyer",
        rating: null, // Per-review star ratings excluded per instructions
        date: date || "",
        text: text,
        review: text,
        platform: "shopee",
      });
    }
  });

  const metadata = getShopeeProductMetadata();
  console.log("[Shopee] Metadata & Reviews extracted:", { isProductPage: true, count: reviews.length });

  return {
    ...metadata,
    isProductPage: true,
    reviews: reviews,
  };
}