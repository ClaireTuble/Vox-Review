console.log("Lazada scraper started");

function getLazadaProductMetadata() {
  // Product title
  const titleEl = document.querySelector(
    ".pdp-product-title, [class*='product-title'], h1"
  );
  let productTitle = titleEl ? titleEl.innerText?.trim() : "";
  if (!productTitle && document.title) {
    productTitle = document.title.split("|")[0].split("-")[0].trim();
  }

  // Product image (main gallery image only)
  const imgEl = document.querySelector(
    "[class*='gallery'] img, [class*='pdp'] img, [class*='product-image'] img, [class*='preview'] img"
  );
  const productImage = imgEl ? (imgEl.src || imgEl.getAttribute("src")) : null;

  console.log("[Lazada] Image:", productImage);

  // Overall rating (review summary rating)
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
    if (Number.isNaN(value)) continue;
    if (value < 0 || value > 5) continue;

    const label = (el.getAttribute("aria-label") || "").toLowerCase();
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

  console.log("[Lazada] Product rating:", rating);

  // Category from breadcrumb
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

  // Active rating filter (e.g. "3 Stars", "All")
  const activeFilterEl = document.querySelector(
    "[class*='rate-filter'] [class*='active'], " +
    "[class*='rating-filter'] [class*='active']"
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

function shouldIgnoreLazadaText(line) {
  if (!line) return true;
  const lower = line.toLowerCase().trim();
  if (lower.startsWith("helpful")) return true;
  if (lower.includes("response from seller")) return true;
  if (lower.includes("seller response")) return true;
  if (lower.includes("seller reply")) return true;
  if (lower === "product details") return true;
  if (lower === "recommendations") return true;
  if (lower.startsWith("if this review was helpful")) return true;
  if (/^\(\d+\)$/.test(lower)) return true;
  return false;
}

function scrapeLazadaReviews() {
  let cards = Array.from(
    document.querySelectorAll(
      ".mod-reviews .item, .pdp-mod-review .item, [class*='mod-review'] .item, #module_product_review .item, [class*='pdp-review'] .item"
    )
  );

  if (cards.length === 0) {
    cards = Array.from(document.querySelectorAll(".item"));
  }

  if (cards.length === 0) {
    console.log("Lazada: Review content not ready yet; waiting for buyer review DOM.");
    return {
      ...getLazadaProductMetadata(),
      reviews: [],
    };
  }

  console.log("Lazada: Found review cards:", cards.length);

  const reviews = [];

  cards.forEach((card, index) => {
    // 1. Reviewer
    const reviewerEl = card.querySelector(
      ".user-name, .reviewer, [class*='user-name'], [class*='reviewer'], [class*='author'], .middle span, .middle"
    );
    let reviewer = reviewerEl
      ? (reviewerEl.innerText || reviewerEl.textContent || "").replace(/\s+/g, " ").trim()
      : "";
    if (!reviewer) {
      reviewer = "Anonymous";
    }

    // 2. Date
    const dateEl = card.querySelector(
      ".title.right, [class*='title'][class*='right'], .time, [class*='time'], [class*='date'], [class*='review-time']"
    );
    const date = dateEl
      ? (dateEl.innerText || dateEl.textContent || "").replace(/\s+/g, " ").trim()
      : "";

    // 3. Merge all review lines into one review text (preserving order & line breaks)
    const lines = [];

    // Extract SKU / attribute lines (e.g. Material: ..., Size: ..., Style: ...)
    const skuContainer = card.querySelector(".item-content-sku-item, [class*='sku-item']");
    if (skuContainer) {
      const rawSkuText = skuContainer.innerText || skuContainer.textContent || "";
      const rawLines = rawSkuText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      rawLines.forEach((l) => {
        if (!shouldIgnoreLazadaText(l) && !lines.includes(l)) {
          lines.push(l);
        }
      });
    }

    // Extract main buyer comment text lines
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

    // Fallback: If specific containers not found, extract lines from card while stripping seller reply & footer
    if (lines.length === 0) {
      const cardClone = card.cloneNode(true);
      const toRemove = cardClone.querySelectorAll(
        ".item-content-seller-reply, .item-content-footer, .reviewer, .user-name, .title.right, .item-content-head-rating, [class*='seller-reply'], [class*='helpful'], [class*='footer']"
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

    // Debugging log
    console.log({
      reviewer,
      date,
      rating: null,
      text: fullText
    });

    reviews.push({
      id: reviewer && date ? `${reviewer}-${date}-${index}` : `lazada-review-${index}`,
      reviewer,
      rating: null, // Per-review stars removed per instructions
      date,
      text: fullText,
      review: fullText,
      platform: "lazada",
    });
  });

  console.log("Lazada: Scraped buyer reviews:", reviews.length);

  const metadata = getLazadaProductMetadata();
  console.log("Lazada: Product metadata:", metadata);

  return {
    ...metadata,
    reviews,
  };
}

