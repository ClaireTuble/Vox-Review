console.log("Agoda scraper loaded");

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function extractNumber(text) {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "");
  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function extractRating(text) {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function extractDate(text) {
  if (!text) return "";
  const normalized = normalizeText(text);
  if (/\b(?:today|yesterday|ago)\b/i.test(normalized)) {
    return normalized;
  }
  const monthDateRegex = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i;
  if (monthDateRegex.test(normalized)) {
    return normalized;
  }
  if (/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(normalized)) {
    return normalized;
  }
  if (/\b\d{4}\b/.test(normalized)) {
    return normalized;
  }
  return normalized;
}

// 2. Listing/Product Name
function getAgodaProductName() {
  const primaryEl = document.querySelector("#title-section > div > div > div > div:nth-child(1) > h1");
  if (primaryEl) {
    const text = normalizeText(primaryEl.innerText || primaryEl.textContent || "");
    if (text) return text;
  }

  const secondaryEl = document.querySelector("#title-section h1, [data-element-name='property-header-name'] h1, h1");
  if (secondaryEl) {
    const text = normalizeText(secondaryEl.innerText || secondaryEl.textContent || "");
    if (text) return text;
  }

  return "";
}

// 3. Overall Rating
function getAgodaOverallRating() {
  const scoreEl = document.querySelector('[data-testid="review-score"]');
  if (scoreEl) {
    const text = normalizeText(scoreEl.innerText || scoreEl.textContent || "");
    const rating = extractRating(text);
    if (rating !== null) return rating;
  }

  const fallbackEl = document.querySelector('[class*="ReviewScore"] [class*="score"], [data-element-name="review-score"]');
  if (fallbackEl) {
    const text = normalizeText(fallbackEl.innerText || fallbackEl.textContent || "");
    const rating = extractRating(text);
    if (rating !== null) return rating;
  }

  return null;
}

// 4. Total Review Count
function getAgodaTotalReviewCount() {
  const primaryEl = document.querySelector('[data-testid="activities-see-review-textlink"]');
  if (primaryEl) {
    const text = normalizeText(primaryEl.innerText || primaryEl.textContent || "");
    const count = extractNumber(text);
    if (count !== null) return count;
  }

  const fallbackEl = document.querySelector('[data-element-name="review-caption"], [class*="review-count"], [data-testid*="review-count"]');
  if (fallbackEl) {
    const text = normalizeText(fallbackEl.innerText || fallbackEl.textContent || "");
    const count = extractNumber(text);
    if (count !== null) return count;
  }

  return null;
}

// 5. Category Handling
function getAgodaCategory(productName = "") {
  const breadcrumbEls = Array.from(document.querySelectorAll(
    '[data-testid*="breadcrumb"] li, [data-testid*="breadcrumb"] a, [class*="breadcrumb"] li, [class*="breadcrumb"] a, nav[aria-label="breadcrumb"] a'
  ))
    .map((el) => normalizeText(el.innerText || el.textContent || ""))
    .filter(Boolean);

  const categories = [
    { name: "Attraction", regex: /\b(?:attraction|attractions|ticket|tickets|theme park|zoo|aquarium|museum)\b/i },
    { name: "Activities", regex: /\b(?:activity|activities|tour|tours|excursion|experience|experiences)\b/i },
    { name: "Hotel", regex: /\b(?:hotel|hotels|resort|resorts|inn)\b/i },
    { name: "Accommodation", regex: /\b(?:accommodation|accommodations|apartment|apartments|villa|villas|homestay|guesthouse)\b/i },
    { name: "Flight", regex: /\b(?:flight|flights|airline|airlines|airfare)\b/i }
  ];

  for (const text of breadcrumbEls) {
    for (const cat of categories) {
      if (cat.regex.test(text)) {
        return cat.name;
      }
    }
  }

  const path = window.location.pathname.toLowerCase();
  if (/\/activity\/|\/activities\//.test(path)) {
    return "Attraction";
  }
  if (/\/hotel\/|\/hotels\//.test(path)) {
    return "Hotel";
  }
  if (/\/flight\/|\/flights\//.test(path)) {
    return "Flight";
  }
  if (/\/accommodation\/|\/apartment\/|\/villa\//.test(path)) {
    return "Accommodation";
  }

  if (productName) {
    if (/\b(?:ticket|tickets|aquarium|park|zoo|museum|pass)\b/i.test(productName)) {
      return "Attraction";
    }
    if (/\b(?:tour|tours|activity|activities|experience)\b/i.test(productName)) {
      return "Activities";
    }
    if (/\b(?:hotel|resort|inn)\b/i.test(productName)) {
      return "Hotel";
    }
    if (/\b(?:apartment|villa|guesthouse|homestay)\b/i.test(productName)) {
      return "Accommodation";
    }
    if (/\b(?:flight)\b/i.test(productName)) {
      return "Flight";
    }
  }

  return "Travel";
}

// 6. Image Extraction
function getAgodaProductImage() {
  const primaryEl = document.querySelector("#mosaic-gallery img");
  if (primaryEl) {
    const src = primaryEl.src || primaryEl.getAttribute("src") || primaryEl.getAttribute("data-src");
    if (src) return src;
  }

  const fallbackEl = document.querySelector('[data-testid*="mosaic-gallery"] img, [data-element-name="property-photo-gallery"] img');
  if (fallbackEl) {
    const src = fallbackEl.src || fallbackEl.getAttribute("src") || fallbackEl.getAttribute("data-src");
    if (src) return src;
  }

  return null;
}

function getAgodaProductMetadata() {
  const productName = getAgodaProductName();
  const rating = getAgodaOverallRating();
  const reviewCount = getAgodaTotalReviewCount();
  const productImage = getAgodaProductImage();
  const category = getAgodaCategory(productName);

  return {
    productName: productName,
    productTitle: productName,
    productImage: productImage,
    rating: rating,
    category: category,
    reviewCount: reviewCount,
    ratingFilter: "all",
    productUrl: window.location.href,
  };
}

// 7. Reviews Extraction
function cleanReviewText(text) {
  if (!text) return "";
  let cleaned = normalizeText(text);
  cleaned = cleaned.replace(/\s*(?:Show less|Show more|Read more|Read less|Translate|See original|Translated by Google)\s*$/i, "");
  cleaned = cleaned.replace(/^(?:Show less|Show more|Read more|Read less|Translate|See original|Translated by Google)\s*/i, "");
  return cleaned.trim();
}

function isPageNoiseOrFilter(text) {
  if (!text) return true;
  const t = normalizeText(text);
  if (t.length === 0) return true;

  if (/\b(?:Activities Home|Cebu Attractions|Attractions|Breadcrumb|Search activities|Similar activities|Recommended|Popular activities|You may also like|More about this activity|Cancellation policy|Frequently asked questions|More about)\b/i.test(t)) return true;
  if (/\b(?:5 Stars 4 Stars|4 Stars|3 Stars|2 Stars|1 Star|With photos only|Filter by|Sort by|Most relevant|Most recent|Review summary|Overall score|Showing \d+ reviews)\b/i.test(t)) return true;

  return false;
}

function isMetadataOrRatingText(text) {
  if (!text) return true;
  const t = text.trim();
  if (t.length === 0) return true;

  if (/\b\d+(?:\.\d+)?\s*(?:out of|\/)\s*\d+/i.test(t)) return true;
  if (/^\s*\d+(?:\.\d+)?\s*(?:out of|\/|stars?|score)?\s*(?:on\s+[\w\s]+)?\s*$/i.test(t)) return true;
  if (/^[★☆\s\d\.\/]+$/i.test(t)) return true;
  if (/^\s*(?:rating|rated|score|stars?)\s*:?\s*\d+(?:\.\d+)?/i.test(t)) return true;

  if (/^\s*(?:Reviewed|Collected|Posted|Submitted)\s+(?:on|by|at|in)\b/i.test(t)) return true;
  if (/\bCollected by\b/i.test(t)) return true;
  if (/\bReviewed on\b/i.test(t)) return true;
  if (/^\s*(?:Anonymous|Agoda User|Verified Traveler|Verified Purchaser|KKday|Klook)\s*$/i.test(t)) return true;

  if (/^\s*(?:Show less|Show more|Read more|Read less|Translate|See original|Helpful|Unhelpful|Report)\s*$/i.test(t)) return true;

  return false;
}

function getAgodaReviewCards() {
  const sectionSelectors = [
    '[data-testid*="review-section"]',
    '[data-element-name*="review"]',
    '#reviews-section',
    '#reviews-container',
    '#reviews',
    '[class*="ActivityReview"]',
    '[class*="ReviewSection"]',
    '[class*="reviews-section"]',
    '[class*="ReviewsList"]',
    '[class*="review-list"]',
  ];

  let scope = document;
  for (const sel of sectionSelectors) {
    const sec = document.querySelector(sel);
    if (sec && sec.querySelectorAll("div, article, li").length > 0) {
      scope = sec;
      break;
    }
  }

  const cardSelectors = [
    '[data-testid="activities-review-card"]',
    '[data-testid*="review-card"]',
    '[data-testid*="review-item"]',
    '[data-element-name="activity-review-card"]',
    '[data-element-name="review-item"]',
    '[data-selenium="review-item"]',
    '[class*="ReviewCard"]',
    '[class*="reviewCard"]',
    '[class*="review-card"]',
    '[class*="ReviewItem"]',
    '[class*="reviewItem"]',
    '[class*="review-item"]',
    '[class*="Review-comment"]',
    'article[class*="review"]',
    'li[class*="review"]',
  ];

  const candidateNodes = Array.from(scope.querySelectorAll(cardSelectors.join(",")))
    .filter((el) => el instanceof HTMLElement)
    .filter((el) => {
      if (el.matches('[class*="Filter"], [class*="filter"], [data-testid*="filter"], [class*="Header"], [class*="header"], [class*="Breadcrumb"], [class*="breadcrumb"], [class*="Similar"], [class*="similar"]')) {
        return false;
      }
      const text = normalizeText(el.innerText || el.textContent || "");
      if (text.length < 15) return false;
      if (isPageNoiseOrFilter(text)) return false;
      return true;
    });

  const topLevelCards = candidateNodes.filter(
    (el) => !candidateNodes.some((other) => other !== el && other.contains(el))
  );

  if (topLevelCards.length > 0) {
    return topLevelCards;
  }

  const fallback = Array.from(scope.querySelectorAll("div, article, li"))
    .filter((el) => el instanceof HTMLElement)
    .filter((el) => {
      if (el.matches('[class*="Filter"], [class*="filter"], [data-testid*="filter"], [class*="Header"], [class*="header"], [class*="Breadcrumb"], [class*="breadcrumb"], [class*="Similar"], [class*="similar"]')) {
        return false;
      }
      const text = normalizeText(el.innerText || el.textContent || "");
      if (text.length < 25 || text.length > 1500) return false;
      if (isPageNoiseOrFilter(text)) return false;
      if (isMetadataOrRatingText(text)) return false;
      return /\b(?:out of|stars?|Reviewed on|Collected by)\b/i.test(text);
    })
    .filter((el, idx, arr) => !arr.some((other, otherIdx) => otherIdx !== idx && other.contains(el)));

  return fallback;
}

function extractAgodaReviewFromCard(card, index) {
  const reviewerSelectors = [
    '[data-testid*="reviewer"]',
    '[data-testid*="author"]',
    '[data-testid*="user-name"]',
    '[data-testid*="name"]',
    '[class*="reviewer"]',
    '[class*="author"]',
    '[class*="user-name"]',
    '[class*="nickname"]',
    '[class*="name"]',
  ];
  let reviewerName = "";
  for (const sel of reviewerSelectors) {
    const el = card.querySelector(sel);
    if (el) {
      const val = normalizeText(el.innerText || el.textContent || "");
      if (val && val.length < 50 && !isMetadataOrRatingText(val) && !isPageNoiseOrFilter(val)) {
        reviewerName = val;
        break;
      }
    }
  }
  if (!reviewerName) {
    const text = card.innerText || card.textContent || "";
    if (/\bAnonymous\b/i.test(text)) {
      reviewerName = "Anonymous";
    }
  }

  const ratingSelectors = [
    '[data-testid*="rating"]',
    '[data-testid*="score"]',
    '[aria-label*="star"]',
    '[class*="star"]',
    '[class*="rating"]',
    '[class*="score"]',
  ];
  let rating = null;
  for (const sel of ratingSelectors) {
    const el = card.querySelector(sel);
    if (el) {
      const val = normalizeText(el.innerText || el.textContent || "");
      const matched = val.match(/(\d+(?:\.\d+)?)/);
      if (matched) {
        rating = parseFloat(matched[1]);
        break;
      }
    }
  }
  if (!rating) {
    const cardText = card.innerText || card.textContent || "";
    const matched = cardText.match(/(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*5/i);
    if (matched) {
      rating = parseFloat(matched[1]);
    }
  }

  const dateSelectors = [
    '[data-testid*="date"]',
    '[class*="date"]',
    '[class*="time"]',
    'time',
  ];
  let date = "";
  for (const sel of dateSelectors) {
    const el = card.querySelector(sel);
    if (el) {
      const val = normalizeText(el.innerText || el.textContent || "");
      if (val) {
        date = val;
        break;
      }
    }
  }
  if (!date) {
    const cardText = normalizeText(card.innerText || card.textContent || "");
    const dateMatch = cardText.match(/(?:Reviewed\s+on\s+)?([A-Za-z]+\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d+\s+days?\s+ago)/i);
    if (dateMatch) {
      date = dateMatch[1];
    }
  }

  const titleSelectors = [
    '[data-testid*="review-title"]',
    '[data-testid*="title"]',
    '[class*="review-title"]',
    '[class*="ReviewTitle"]',
    '[class*="review_title"]',
    'h3',
    'h4',
    'h5',
  ];
  let reviewTitle = "";
  for (const sel of titleSelectors) {
    const el = card.querySelector(sel);
    if (el) {
      const val = cleanReviewText(el.innerText || el.textContent || "");
      if (val && val.length < 100 && !isMetadataOrRatingText(val) && !isPageNoiseOrFilter(val) && val !== reviewerName) {
        reviewTitle = val;
        break;
      }
    }
  }

  const bodySelectors = [
    '[data-testid*="review-body"]',
    '[data-testid*="review-text"]',
    '[data-testid*="comment"]',
    '[class*="review-body"]',
    '[class*="ReviewBody"]',
    '[class*="review-content"]',
    '[class*="ReviewContent"]',
    '[class*="review-text"]',
    '[class*="ReviewText"]',
    '[class*="comment-text"]',
    '[class*="commentText"]',
    '[class*="comment-body"]',
    '[class*="comment"]',
    '[class*="description"]',
    'p',
  ];

  const candidateNodes = Array.from(card.querySelectorAll(bodySelectors.join(",")));
  const validCommentTexts = [];

  for (const node of candidateNodes) {
    const raw = node.innerText || node.textContent || "";
    const cleaned = cleanReviewText(raw);

    if (!cleaned || cleaned.length < 3) continue;
    if (isMetadataOrRatingText(cleaned) || isPageNoiseOrFilter(cleaned)) continue;
    if (cleaned === reviewerName || cleaned === date) continue;

    validCommentTexts.push(cleaned);
  }

  let reviewBody = "";
  if (validCommentTexts.length > 0) {
    const bodyCandidates = validCommentTexts.filter((b) => b !== reviewTitle);
    if (bodyCandidates.length > 0) {
      bodyCandidates.sort((a, b) => b.length - a.length);
      reviewBody = bodyCandidates[0];
    } else {
      reviewBody = validCommentTexts[0];
    }
  }

  if (!reviewBody) {
    let rawText = cleanReviewText(card.innerText || card.textContent || "");
    if (reviewTitle && rawText.includes(reviewTitle)) {
      rawText = rawText.replace(reviewTitle, "");
    }
    rawText = rawText
      .replace(/\b\d+(?:\.\d+)?\s*(?:out of|\/)\s*\d+(?:\s*on\s+[\w]+)?/gi, "")
      .replace(/\bReviewed on [^\n\r]+/gi, "")
      .replace(/\bCollected by [^\n\r]+/gi, "")
      .replace(/\bAnonymous\b/gi, "")
      .trim();

    reviewBody = cleanReviewText(rawText);
  }

  const comment = reviewBody || reviewTitle || "";

  const reviewId =
    card.dataset?.reviewId ||
    card.getAttribute("data-review-id") ||
    `agoda-review-${index}-${date}-${(comment || "").slice(0, 10)}`;

  return {
    id: reviewId,
    reviewTitle: reviewTitle || undefined,
    reviewBody: reviewBody || comment,
    reviewerName: reviewerName || undefined,
    reviewer: reviewerName || undefined,
    rating: rating || null,
    date: date || "",
    comment: comment,
    text: comment,
    platform: "agoda",
  };
}

function scrapeAgodaReviews() {
  const metadata = getAgodaProductMetadata();
  const cards = getAgodaReviewCards();

  const reviews = cards
    .map((card, index) => extractAgodaReviewFromCard(card, index))
    .filter((review) => review.comment && review.comment.length > 0);

  const uniqueReviews = [];
  const seenIds = new Set();
  reviews.forEach((r) => {
    if (!seenIds.has(r.id)) {
      seenIds.add(r.id);
      uniqueReviews.push(r);
    }
  });

  return {
    ...metadata,
    reviews: uniqueReviews,
  };
}
