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

  return {
    productTitle: productTitle || "Shopee Product",
    platform: "shopee",
    productUrl: window.location.href,
  };
}

function cleanShopeeCommentText(text) {
  if (!text) return "";
  return text.trim();
}

function getShopeeReviewBody(card) {
  const bodySelectors = [
    ".YNedDV",
    ".shopee-product-rating__text",
    '[data-testid*="review-content"]',
    '[data-testid*="comment-content"]',
    '[class*="comment-text"]',
    '[class*="rating__content"]',
    ".shopee-product-rating__content",
    ".shopee-product-rating__content-v2",
    "._13c-n7",
    ".Em32B1",
  ];

  for (const selector of bodySelectors) {
    const bodyEl = card.querySelector(selector);
    const rawText = bodyEl?.innerText || bodyEl?.textContent || "";
    const text = cleanShopeeCommentText(rawText);
    if (text) {
      return { rawText, text, bodyEl, selector };
    }
  }

  return { rawText: "", text: "", bodyEl: null, selector: "" };
}

function extractShopeeReviewLikes(card) {
  if (!globalThis.__voxreviewHelpfulness?.isCollectionEnabled("shopee")) {
    return { helpfulCount: null, helpfulnessMetric: null, helpfulnessAvailable: false };
  }
  const element = card.querySelector(".shopee-product-rating__like-count");
  const text = (element?.innerText || element?.textContent || "").trim();
  const count = globalThis.__voxreviewHelpfulness?.parseNonNegativeSafeInteger(text) ?? null;
  return globalThis.__voxreviewHelpfulness?.buildHelpfulnessFields(
    "shopee",
    "review_likes",
    count,
  ) || { helpfulCount: null, helpfulnessMetric: null, helpfulnessAvailable: false };
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

  const bodyElements = Array.from(document.querySelectorAll(".product-ratings__list .YNedDV"));
  let reviewEntries = bodyElements.map((bodyEl) => ({
    card: bodyEl.closest("[data-cmtid], .shopee-product-rating, .product-ratings__list > div") || bodyEl.parentElement,
    bodyEl,
  }));

  if (reviewEntries.length === 0) {
    const cards = Array.from(document.querySelectorAll("[data-cmtid], .shopee-product-rating"));
    reviewEntries = cards.map((card) => ({ card, bodyEl: null }));
  }

  if (reviewEntries.length === 0) {
    const cards = Array.from(document.querySelectorAll(
      "[class*='rating'], [class*='review'], [class*='comment'], [class*='feedback']"
    )).filter((node) => {
      const text = (node.innerText || node.textContent || "").trim();
      return text.length > 20 && !/helpful|report|translate|variation|size|color/i.test(text);
    });
    reviewEntries = cards.map((card) => ({ card, bodyEl: null }));
  }

  console.log("[Shopee] Found review cards:", reviewEntries.length);

  const reviews = [];
  const seenTexts = new Set();

  reviewEntries.forEach(({ card, bodyEl: preferredBodyEl }) => {
    if (!card) return;
    const dateEl = card.querySelector(".shopee-product-rating__time, [class*='rating__time'], [class*='time']");
    const date = dateEl ? dateEl.innerText?.trim() : "";

    const { text } = preferredBodyEl
      ? { text: cleanShopeeCommentText(preferredBodyEl.innerText || preferredBodyEl.textContent || "") }
      : getShopeeReviewBody(card);

    // Must be non-empty genuine comment text written by user
    if (!text || text.length < 2) return;

    const key = text.toLowerCase();
    if (!seenTexts.has(key)) {
      seenTexts.add(key);
      reviews.push({
        ...(date ? { date } : {}),
        ...extractShopeeReviewLikes(card),
        text,
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