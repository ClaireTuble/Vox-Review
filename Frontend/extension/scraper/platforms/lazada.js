console.log("Lazada scraper loaded");

/**
 * Detect if the current page is a Lazada product detail page.
 */
function isLazadaProductPage() {
  const href = window.location.href;
  const path = window.location.pathname;

  const hasProductUrl = /-i\d+-s\d+\.html/i.test(href) || /\.html$/i.test(path) || /\/products\//i.test(path) || /itemid=/i.test(href) || /product/i.test(path);
  const hasProductDom = !!document.querySelector(
    "#module_product_detail, .pdp-block, .pdp-product-title, #module_product_review, .mod-reviews, .pdp-mod-review, [class*='mod-review'], [class*='pdp'], [class*='product-title'], h1"
  );
  const reviewishDom = !!document.querySelector(
    "[class*='review'], [class*='rating'], [class*='comment'], [class*='feedback'], .mod-reviews"
  );

  if (path === "/" || path === "" || path.includes("/catalog") || path.includes("/tag") || path.includes("/cart") || path.includes("/customer") || path.includes("/shop/")) {
    if (!hasProductDom && !reviewishDom) return false;
  }

  return hasProductUrl || hasProductDom || reviewishDom;
}

/**
 * Extract Lazada product metadata (title, image, rating summary, category, filter).
 */
function getLazadaProductMetadata() {
  const titleEl = document.querySelector(
    ".pdp-product-title, [class*='product-title'], h1"
  );
  let productTitle = titleEl ? titleEl.innerText?.trim() : "";
  if (!productTitle && document.title) {
    productTitle = document.title.split("|")[0].split("-")[0].trim();
  }

  const imgEl = document.querySelector(
    "[class*='gallery'] img, [class*='pdp'] img, [class*='product-image'] img, [class*='preview'] img"
  );
  const productImage = imgEl ? (imgEl.src || imgEl.getAttribute("src")) : null;

  const ratingCandidates = Array.from(
    document.querySelectorAll(
      "[class*='rating-average'], [class*='rating-score'], [class*='review-summary'] [class*='rating'], [class*='pdp-review-summary-overall-rating'], [class*='pdp-review-summary']"
    )
  );

  let rating = null;
  for (const el of ratingCandidates) {
    const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (!match) continue;

    const value = parseFloat(match[1]);
    if (Number.isNaN(value) || value < 0 || value > 5) continue;

    const className = (el.className || "").toLowerCase();
    const textLower = text.toLowerCase();

    const isReviewCard = /review|comment|item|card/i.test(className) && /star/i.test(className);
    const isBuyerReview = /review|comment|item|card/i.test(textLower) && /star/i.test(textLower);
    const isProductSummary = !isReviewCard && !isBuyerReview && !/seller|helpful|reply|like|video|image/i.test(textLower);

    if (isProductSummary) {
      rating = match[1];
      break;
    }
  }

  const breadcrumbEls = document.querySelectorAll(
    "[class*='breadcrumb'] a, [class*='breadCrumb'] a"
  );
  let category = null;
  if (breadcrumbEls && breadcrumbEls.length > 0) {
    const parts = Array.from(breadcrumbEls)
      .map((el) => el.innerText?.trim())
      .filter(Boolean);
    category = parts.join(" / ");
  }

  const activeFilterEl = document.querySelector(
    "[class*='rate-filter'] [class*='active'], [class*='rating-filter'] [class*='active']"
  );
  const ratingFilter = activeFilterEl
    ? activeFilterEl.innerText?.trim() || "all"
    : "all";

  return {
    productTitle: productTitle || "Lazada Product",
    productImage: productImage,
    rating: rating || null,
    category: category || "Lazada Products",
    ratingFilter: ratingFilter,
    productUrl: window.location.href,
  };
}

/**
 * Validation step: Rejects obvious source-code, CSS, JavaScript, embedded JSON, or configuration content.
 */
function isCodeOrJsonText(text) {
  if (!text || typeof text !== "string") return true;
  const str = text.trim();

  // Rejection rules for source code, CSS, JSON, scripts, and configuration
  if (/window\.__/i.test(str)) return true;
  if (/font-size\s*:|display\s*:|background\s*:|color\s*:|margin\s*:|padding\s*:/i.test(str)) return true;
  if (/^[\{\[\s]*"(?:@type|@context|app|page|pdp|sku|catalog)/i.test(str)) return true;
  if (/function\s*\(|var\s+[a-zA-Z0-9_\$]+|const\s+[a-zA-Z0-9_\$]+|let\s+[a-zA-Z0-9_\$]+/i.test(str)) return true;
  if (/<script|<style|<template|<div|<span|<!DOCTYPE/i.test(str)) return true;
  if (/@media|@import|@keyframes|\.css/i.test(str)) return true;

  // High concentration of code brackets / syntax symbols
  const codeSymbolCount = (str.match(/[{};<>=]/g) || []).length;
  if (codeSymbolCount > 2) return true;

  return false;
}

/**
 * Helper to filter out non-review system labels, headers, and code snippets.
 */
function shouldIgnoreLazadaText(line) {
  if (!line) return true;
  if (isCodeOrJsonText(line)) return true;

  const lower = line.toLowerCase().trim();
  if (lower.startsWith("helpful")) return true;
  if (lower.includes("response from seller")) return true;
  if (lower.includes("seller response")) return true;
  if (lower.includes("seller reply")) return true;
  if (lower === "product details") return true;
  if (lower === "recommendations") return true;
  if (lower.startsWith("if this review was helpful")) return true;
  if (/^\(\d+\)$/.test(lower)) return true;
  if (/^\d+\s*stars?\s*$/i.test(lower)) return true;
  if (/^[★☆\s\d\.\/]+$/i.test(lower)) return true;
  return false;
}

/**
 * Scrape genuine customer review text from Lazada product page.
 */
function scrapeLazadaReviews() {
  const isProduct = isLazadaProductPage();
  if (!isProduct) {
    console.log("Lazada: Not a product detail page.");
    return {
      isProductPage: false,
      productTitle: "",
      reviews: [],
    };
  }

  // Target ONLY legitimate review container items in Lazada DOM
  const cards = Array.from(
    document.querySelectorAll(
      ".mod-reviews .item, .pdp-mod-review .item, [class*='mod-review'] .item, #module_product_review .item, [class*='pdp-review'] .item, [class*='review-item']"
    )
  );

  console.log("Lazada: Found review cards:", cards.length);

  const reviews = [];
  const seenTexts = new Set();

  if (cards.length === 0) {
    console.log("Lazada: Review DOM not mounted or empty.");
    return {
      ...getLazadaProductMetadata(),
      isProductPage: true,
      reviews: [],
    };
  }

  cards.forEach((card, index) => {
    // 1. Reviewer Name
    const reviewerEl = card.querySelector(
      ".user-name, .reviewer, [class*='user-name'], [class*='reviewer'], [class*='author'], .middle span, .middle"
    );
    let reviewer = reviewerEl
      ? (reviewerEl.innerText || reviewerEl.textContent || "").replace(/\s+/g, " ").trim()
      : "Anonymous";
    if (isCodeOrJsonText(reviewer)) reviewer = "Lazada Buyer";

    // 2. Date
    const dateEl = card.querySelector(
      ".title.right, [class*='title'][class*='right'], .time, [class*='time'], [class*='date'], [class*='review-time']"
    );
    const date = dateEl
      ? (dateEl.innerText || dateEl.textContent || "").replace(/\s+/g, " ").trim()
      : "";

    // 3. User Review Content Text
    const lines = [];

    // Primary: dedicated review comment text container
    const mainTextContainer = card.querySelector(
      ".item-content-main-content-reviews-item, [class*='main-content-reviews-item'], [class*='review-content'], [class*='user-comment']"
    );

    if (mainTextContainer) {
      const rawMainText = mainTextContainer.innerText || mainTextContainer.textContent || "";
      const rawLines = rawMainText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      rawLines.forEach((l) => {
        if (!shouldIgnoreLazadaText(l) && !lines.includes(l)) {
          lines.push(l);
        }
      });
    }

    // Secondary / Fallback: clone card and strip non-comment sub-elements (scripts, styles, seller replies, footers)
    if (lines.length === 0) {
      const cardClone = card.cloneNode(true);
      const toRemove = cardClone.querySelectorAll(
        "script, style, template, meta, link, svg, button, .item-content-seller-reply, .item-content-footer, .reviewer, .user-name, .title.right, .item-content-head-rating, [class*='seller-reply'], [class*='helpful'], [class*='footer']"
      );
      toRemove.forEach((el) => el.remove());

      const rawCardText = cardClone.innerText || cardClone.textContent || "";
      const rawLines = rawCardText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      rawLines.forEach((l) => {
        if (!shouldIgnoreLazadaText(l) && l !== reviewer && l !== date && !lines.includes(l)) {
          lines.push(l);
        }
      });
    }

    const fullText = lines.join("\n").trim();

    // Must be non-empty, genuine review text and NOT code/JSON
    if (!fullText || fullText.length < 2 || isCodeOrJsonText(fullText)) return;

    const textKey = fullText.toLowerCase();
    if (!seenTexts.has(textKey)) {
      seenTexts.add(textKey);
      reviews.push({
        id: reviewer && date ? `${reviewer}-${date}-${index}` : `lazada-review-${index}`,
        reviewer,
        rating: null,
        date,
        text: fullText,
        review: fullText,
        platform: "lazada",
      });
    }
  });

  console.log("Lazada: Scraped buyer reviews:", reviews.length);
  const metadata = getLazadaProductMetadata();
  return {
    ...metadata,
    isProductPage: true,
    reviews,
  };
}
