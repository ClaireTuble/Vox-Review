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
  let cardSelectorUsed = ".product-ratings__list .YNedDV";

  if (reviewEntries.length === 0) {
    const cards = Array.from(document.querySelectorAll("[data-cmtid], .shopee-product-rating"));
    reviewEntries = cards.map((card) => ({ card, bodyEl: null }));
    cardSelectorUsed = "[data-cmtid], .shopee-product-rating";
  }

  if (reviewEntries.length === 0) {
    const cards = Array.from(document.querySelectorAll(
      "[class*='rating'], [class*='review'], [class*='comment'], [class*='feedback']"
    )).filter((node) => {
      const text = (node.innerText || node.textContent || "").trim();
      return text.length > 20 && !/helpful|report|translate|variation|size|color/i.test(text);
    });
    reviewEntries = cards.map((card) => ({ card, bodyEl: null }));
    cardSelectorUsed = "[class*='rating'], [class*='review'], [class*='comment'], [class*='feedback']";
  }

  console.log("[Shopee] Found review cards:", reviewEntries.length);

  const reviews = [];
  const seenTexts = new Set();
  let debuggedReview = false;

  reviewEntries.forEach(({ card, bodyEl: preferredBodyEl }, index) => {
    if (!card) return;
    const cmtId = card.getAttribute("data-cmtid");

    // 1. Reviewer Name
    const reviewerEl = card.querySelector(".shopee-product-rating__author-name, [class*='author-name'], [class*='user-name']");
    let reviewer = reviewerEl ? reviewerEl.innerText?.trim() : "Shopee Buyer";

    // 2. Date
    const dateEl = card.querySelector(".shopee-product-rating__time, [class*='rating__time'], [class*='time']");
    const date = dateEl ? dateEl.innerText?.trim() : "";

    // 3. Read only the dedicated review-body element; never scrape the whole card.
    const { rawText, text, bodyEl, selector } = preferredBodyEl
      ? { rawText: preferredBodyEl.innerText || preferredBodyEl.textContent || "", text: cleanShopeeCommentText(preferredBodyEl.innerText || preferredBodyEl.textContent || ""), bodyEl: preferredBodyEl, selector: ".product-ratings__list .YNedDV" }
      : getShopeeReviewBody(card);

    // Must be non-empty genuine comment text written by user
    if (!text || text.length < 2) return;

    if (!debuggedReview) {
      console.log("[Shopee] REVIEW CARD SELECTOR", cardSelectorUsed);
      console.log("[Shopee] REVIEW CARD CHILDREN", Array.from(card.children).map((child) => ({
        tag: child.tagName,
        className: child.className,
        text: (child.innerText || child.textContent || "").trim(),
      })));
      console.log("[Shopee] REVIEW BODY SELECTOR", selector);
      console.log("[Shopee] REVIEW BODY ELEMENT", bodyEl);
      console.log("[Shopee] EXTRACTED REVIEW TEXT", text);
      debuggedReview = true;
    }

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