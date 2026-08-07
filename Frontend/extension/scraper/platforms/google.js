console.log("Google Maps scraper loaded");

function getGoogleProductMetadata() {
  const titleEl = document.querySelector("h1.DUwDvf.lfPIob, h1");
  let productTitle = titleEl ? titleEl.innerText?.trim() : "";
  if (!productTitle && document.title) {
    productTitle = document.title.split("|")[0].split("-")[0].trim();
  }

  // Product Image: first place preview image, prefer button img or gallery preview, ignoring reviewer profile pics
  let productImage = null;
  const imgCandidates = Array.from(
    document.querySelectorAll("button img, [class*='photo'] img, [class*='gallery'] img")
  );
  const placeImg = imgCandidates.find((img) => {
    const src = (img.src || img.getAttribute("src") || "").toLowerCase();
    const alt = (img.getAttribute("alt") || "").toLowerCase();
    const className = (img.className || "").toLowerCase();
    if (!src) return false;
    // Exclude reviewer avatars / profile pictures
    if (/avatar|profile|lh3\.googleusercontent\.com\/a\//i.test(src)) return false;
    if (/avatar|profile|person/i.test(alt) || /avatar|profile|person/i.test(className)) return false;
    return true;
  });

  if (placeImg) {
    productImage = placeImg.src || placeImg.getAttribute("src") || null;
  } else {
    const buttonImg = document.querySelector("button img");
    productImage = buttonImg ? (buttonImg.src || buttonImg.getAttribute("src") || null) : null;
  }

  // Overall Business Rating: using .fontDisplayLarge
  const ratingEl = document.querySelector(".fontDisplayLarge");
  const rating = ratingEl ? ratingEl.innerText?.trim() : null;

  const categoryEl = document.querySelector('button[jsaction*="category"], [class*="category"]');
  const category = categoryEl ? categoryEl.innerText?.trim() : null;

  return {
    productTitle: productTitle || "Google Place",
    productImage: productImage,
    rating: rating || null,
    category: category || "Google Maps",
    ratingFilter: "all",
    productUrl: window.location.href,
  };
}

function normalizeGoogleReviewText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function extractReviewDate(card) {
  const candidates = Array.from(card.querySelectorAll("span, div"));
  for (const el of candidates) {
    const text = normalizeGoogleReviewText(el.innerText || el.textContent || "");
    if (!text) continue;
    if (/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sep|Oct|Nov|Dec)\b/i.test(text)) {
      return text;
    }
    if (/\d{4}/.test(text) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text)) {
      return text;
    }
  }
  return "";
}

function scrapeGoogleReviews() {
  const cards = Array.from(document.querySelectorAll(".jftiEf")).filter((card) => !card.querySelector(".CDe7pd"));

  console.log("Google: Found review cards:", cards.length);

  const reviews = [];

  cards.forEach((card, index) => {
    const textEl = card.querySelector(".wiI7pd");
    const text = textEl ? normalizeGoogleReviewText(textEl.innerText || textEl.textContent || "") : "";

    if (!text) {
      return;
    }

    const reviewerEl = card.querySelector(".reviewer") || card.querySelector("[class*='reviewer']") || card.querySelector("[class*='author']");
    const reviewer = reviewerEl
      ? normalizeGoogleReviewText(reviewerEl.innerText || reviewerEl.textContent || "")
      : "Anonymous";

    const date = extractReviewDate(card);

    const ratingEl = card.querySelector("span.kvMYJc");
    let rating = null;
    if (ratingEl) {
      const ariaLabel = normalizeGoogleReviewText(ratingEl.getAttribute("aria-label") || "");
      const match = ariaLabel.match(/(\d+)\s+stars?/i);
      if (match) {
        rating = parseInt(match[1], 10);
      }
    }

    reviews.push({
      id: reviewer && date ? `${reviewer}-${date}-${index}` : `google-review-${index}`,
      reviewer,
      rating,
      date,
      text,
      platform: "google",
    });
  });

  console.log("Google: Scraped reviews:", reviews.length);

  const metadata = getGoogleProductMetadata();
  console.log("Google: Metadata:", metadata);

  return {
    ...metadata,
    reviews,
  };
}
