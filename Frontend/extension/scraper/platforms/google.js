console.log("Google Maps scraper loaded");

function isGoogleMapsPlacePage() {
  const href = window.location.href;
  const path = window.location.pathname;

  const hasPlaceUrl = path.includes("/maps/place/") || path.includes("/place/") || href.includes("/data=");
  const hasPlaceDom = !!document.querySelector(
    "h1.DUwDvf, .jftiEf, .fontDisplayLarge, [jsaction*='pane']"
  );

  return hasPlaceUrl || hasPlaceDom;
}

function getGoogleProductMetadata() {
  const titleEl = document.querySelector("h1.DUwDvf.lfPIob, h1");
  let productTitle = titleEl ? titleEl.innerText?.trim() : "";
  if (!productTitle && document.title) {
    productTitle = document.title.split("|")[0].split("-")[0].trim();
  }

  let productImage = null;
  const imgCandidates = Array.from(
    document.querySelectorAll("button img, [class*='photo'] img, [class*='gallery'] img")
  );
  const placeImg = imgCandidates.find((img) => {
    const src = (img.src || img.getAttribute("src") || "").toLowerCase();
    const alt = (img.getAttribute("alt") || "").toLowerCase();
    const className = (img.className || "").toLowerCase();
    if (!src) return false;
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
    if (/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(text)) {
      return text;
    }
    if (/\d{4}/.test(text) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text)) {
      return text;
    }
  }
  return "";
}

function scrapeGoogleReviews() {
  const isPlace = isGoogleMapsPlacePage();
  if (!isPlace) {
    console.log("Google Maps: Not a place detail page.");
    return {
      isProductPage: false,
      productTitle: "",
      reviews: [],
    };
  }

  // Filter out cards that are place owner replies (.CDe7pd)
  const cards = Array.from(document.querySelectorAll(".jftiEf")).filter((card) => !card.querySelector(".CDe7pd"));

  console.log("Google: Found review cards:", cards.length);

  const reviews = [];
  const seenTexts = new Set();

  cards.forEach((card, index) => {
    const textEl = card.querySelector(".wiI7pd");
    const text = textEl ? normalizeGoogleReviewText(textEl.innerText || textEl.textContent || "") : "";

    if (!text || text.length < 2) return;

    const reviewerEl = card.querySelector(".reviewer") || card.querySelector("[class*='reviewer']") || card.querySelector("[class*='author']");
    const reviewer = reviewerEl
      ? normalizeGoogleReviewText(reviewerEl.innerText || reviewerEl.textContent || "")
      : "Google Maps User";

    const date = extractReviewDate(card);

    if (!seenTexts.has(text.toLowerCase())) {
      seenTexts.add(text.toLowerCase());
      reviews.push({
        id: reviewer && date ? `${reviewer}-${date}-${index}` : `google-review-${index}`,
        reviewer,
        rating: null,
        date,
        text,
        platform: "google",
      });
    }
  });

  const metadata = getGoogleProductMetadata();

  return {
    ...metadata,
    isProductPage: true,
    reviews,
  };
}
