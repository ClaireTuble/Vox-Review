console.log("Google Play scraper loaded");

let lastAppUrl = "";
const seenReviewKeys = new Set();
let allScrapedReviews = [];

function getGooglePlayProductMetadata() {
  // App Title: target the h1 element that contains only the app name.
  // Do NOT use 'h1 span' because category links can also match.
  // Strategy: prefer the h1 inside the app header block, then fallback to
  // the first h1 whose text is not a known category/nav link.
  let productTitle = "";

  // 1. Try h1 directly inside the app detail header
  const headerH1 = document.querySelector(".hnnXjf h1, [itemprop='name'] h1, h1[class]");
  if (headerH1) {
    // Use only the direct text nodes to avoid pulling in child element text
    const directText = Array.from(headerH1.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    productTitle = directText || headerH1.innerText?.trim() || "";
  }

  // 2. Fallback: first h1 on page
  if (!productTitle) {
    const allH1 = document.querySelectorAll("h1");
    for (const h1 of allH1) {
      const t = (h1.innerText || h1.textContent || "").trim();
      // Skip empty, very long, or category-looking values
      if (t && t.length < 120) {
        productTitle = t;
        break;
      }
    }
  }

  // 3. Fallback to page title (strip "- Google Play" suffix)
  if (!productTitle && document.title) {
    productTitle = document.title
      .replace(/[-–|].*$/g, "")
      .trim();
  }

  console.log("[Google Play] Product title found:", productTitle);

  // App Icon: .hnnXjf img — must NOT be a reviewer avatar
  const imgEl = document.querySelector(
    ".hnnXjf img[src*='play-lh.googleusercontent.com'], " +
    ".hnnXjf img[src*='googleusercontent'], " +
    "img[src*='play-lh.googleusercontent.com']"
  );
  const productImage = imgEl ? (imgEl.src || imgEl.getAttribute("src")) : null;

  console.log("[Google Play] Product image found:", productImage);

  // Overall App Rating ONLY from the summary header (.jILTFe or .TT9eCd scoped to header)
  // Do NOT pick up per-review star ratings.
  let rating = null;
  const summaryRatingEl = document.querySelector(".jILTFe, .hnnXjf .TT9eCd");
  if (summaryRatingEl) {
    const text = (summaryRatingEl.innerText || summaryRatingEl.textContent || "").trim();
    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (match) rating = match[1];
  }

  console.log("[Google Play] Product rating found:", rating);

  // Category: only from the category link, never used as product title
  const categoryEl = document.querySelector("a[href*='/store/apps/category/']");
  const category = categoryEl ? (categoryEl.innerText?.trim() || "") : "";

  return {
    platform: "googleplay",
    productTitle: productTitle || "Google Play App",
    productImage: productImage,
    rating: rating || null,
    category: category || "Google Play Apps",
    ratingFilter: "all",
    productUrl: window.location.href,
  };
}

function scrapeGooglePlayReviews() {
  const currentUrl = window.location.href;
  if (currentUrl !== lastAppUrl) {
    lastAppUrl = currentUrl;
    seenReviewKeys.clear();
    allScrapedReviews = [];
  }

  // Review Containers: header.c1bOId[data-review-id], [data-review-id], .c1bOId, .RHo1pe, .EGFGHd (including inside "More reviews" modal overlay)
  const rawCards = Array.from(
    document.querySelectorAll(
      "header.c1bOId[data-review-id], [data-review-id], .c1bOId, .RHo1pe, .EGFGHd, div[role='dialog'] [data-review-id], div[role='dialog'] .c1bOId, div[role='dialog'] .RHo1pe, div[role='dialog'] .EGFGHd"
    )
  );

  // Filter out nested sub-elements so each review card container is processed once
  const cards = rawCards.filter((card, idx, arr) => {
    return !arr.some((other, otherIdx) => otherIdx !== idx && other.contains(card));
  });

  console.log("[Google Play] Review cards detected:", cards.length);

  if (cards.length === 0) {
    console.log("[Google Play] New reviews added: 0");
    console.log("[Google Play] Total reviews scraped:", allScrapedReviews.length);
    return {
      ...getGooglePlayProductMetadata(),
      reviews: allScrapedReviews,
    };
  }

  let newCount = 0;

  cards.forEach((card, index) => {
    // Reviewer name: .X5PpBb, .gSGphe .X5PpBb
    const reviewerEl = card.querySelector(".X5PpBb, .gSGphe .X5PpBb, [class*='reviewer']");
    let reviewer = reviewerEl
      ? (reviewerEl.innerText || reviewerEl.textContent || "").replace(/\s+/g, " ").trim()
      : "";
    if (!reviewer) {
      reviewer = "Google Play Store Reviewer";
    }

    // Review date: .bp9Aid
    const dateEl = card.querySelector(".bp9Aid, [class*='date']");
    const date = dateEl
      ? (dateEl.innerText || dateEl.textContent || "").replace(/\s+/g, " ").trim()
      : "";

    // Review comment text: .h3YV2d
    const textEl = card.querySelector(".h3YV2d, [class*='review-text']");
    const text = textEl
      ? (textEl.innerText || textEl.textContent || "").replace(/\s+/g, " ").trim()
      : "";

    if (!text) return; // Ignore cards without review comment text

    // Per-review rating: .iXRFPc[aria-label^="Rated"]
    const reviewRatingEl = card.querySelector(".iXRFPc[aria-label^='Rated'], .iXRFPc, .Jx4nYe [role='img']");
    let reviewRating = null;
    if (reviewRatingEl) {
      const ariaLabel = reviewRatingEl.getAttribute("aria-label") || "";
      const match = ariaLabel.match(/Rated\s+(\d+(?:\.\d+)?)/i) || ariaLabel.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        reviewRating = match[1];
      }
    }

    // Deduplicate using data-review-id or reviewer + date + text
    const dataReviewId = card.getAttribute("data-review-id") || card.dataset?.reviewId || card.querySelector("[data-review-id]")?.getAttribute("data-review-id");
    const uniqueKey = dataReviewId
      ? `id:${dataReviewId}`
      : `${reviewer.toLowerCase()}|${date.toLowerCase()}|${text.toLowerCase()}`;

    if (!seenReviewKeys.has(uniqueKey)) {
      seenReviewKeys.add(uniqueKey);
      newCount++;
      allScrapedReviews.push({
        id: dataReviewId || (reviewer && date ? `${reviewer}-${date}-${index}` : `googleplay-review-${allScrapedReviews.length}`),
        reviewer,
        date,
        rating: reviewRating,
        text,
        review: text,
        platform: "googleplay",
      });
    }
  });

  console.log("[Google Play] New reviews added:", newCount);
  console.log("[Google Play] Total reviews scraped:", allScrapedReviews.length);

  const metadata = getGooglePlayProductMetadata();

  return {
    ...metadata,
    reviews: allScrapedReviews,
  };
}
