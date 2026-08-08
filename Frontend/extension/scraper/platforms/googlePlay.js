console.log("Google Play scraper loaded");

let lastAppUrl = "";
const seenReviewKeys = new Set();
let allScrapedReviews = [];

function isGooglePlayProductPage() {
  const href = window.location.href;
  const path = window.location.pathname;

  const hasAppUrl = path.includes("/store/apps/details") || path.includes("/store/books/details") || href.includes("id=");
  const hasAppDom = !!document.querySelector(
    ".hnnXjf, [itemprop='name'], header.c1bOId, [data-review-id], .RHo1pe, .EGFGHd"
  );

  if (path === "/store" || path === "/store/apps" || path.includes("/store/apps/category") || path.includes("/store/search")) {
    if (!hasAppDom) return false;
  }

  return hasAppUrl || hasAppDom;
}

function getGooglePlayProductMetadata() {
  let productTitle = "";

  const headerH1 = document.querySelector(".hnnXjf h1, [itemprop='name'] h1, h1[class]");
  if (headerH1) {
    const directText = Array.from(headerH1.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    productTitle = directText || headerH1.innerText?.trim() || "";
  }

  if (!productTitle) {
    const allH1 = document.querySelectorAll("h1");
    for (const h1 of allH1) {
      const t = (h1.innerText || h1.textContent || "").trim();
      if (t && t.length < 120 && !/categories|recommended|similar/i.test(t)) {
        productTitle = t;
        break;
      }
    }
  }

  if (!productTitle && document.title) {
    productTitle = document.title.replace(/[-–|].*$/g, "").trim();
  }

  const imgEl = document.querySelector(
    ".hnnXjf img[src*='play-lh.googleusercontent.com'], " +
    ".hnnXjf img[src*='googleusercontent'], " +
    "img[src*='play-lh.googleusercontent.com']"
  );
  const productImage = imgEl ? (imgEl.src || imgEl.getAttribute("src")) : null;

  let rating = null;
  const summaryRatingEl = document.querySelector(".jILTFe, .hnnXjf .TT9eCd");
  if (summaryRatingEl) {
    const text = (summaryRatingEl.innerText || summaryRatingEl.textContent || "").trim();
    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (match) rating = match[1];
  }

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
  const isProduct = isGooglePlayProductPage();
  if (!isProduct) {
    console.log("[Google Play] Not an app detail page.");
    return {
      isProductPage: false,
      productTitle: "",
      reviews: [],
    };
  }

  const currentUrl = window.location.href;
  if (currentUrl !== lastAppUrl) {
    lastAppUrl = currentUrl;
    seenReviewKeys.clear();
    allScrapedReviews = [];
  }

  const rawCards = Array.from(
    document.querySelectorAll(
      "header.c1bOId[data-review-id], [data-review-id], .c1bOId, .RHo1pe, .EGFGHd, div[role='dialog'] [data-review-id], div[role='dialog'] .c1bOId, div[role='dialog'] .RHo1pe, div[role='dialog'] .EGFGHd"
    )
  );

  const cards = rawCards.filter((card, idx, arr) => {
    return !arr.some((other, otherIdx) => otherIdx !== idx && other.contains(card));
  });

  console.log("[Google Play] Review cards detected:", cards.length);

  cards.forEach((card, index) => {
    const reviewerEl = card.querySelector(".X5PpBb, .gSGphe .X5PpBb, [class*='reviewer']");
    let reviewer = reviewerEl
      ? (reviewerEl.innerText || reviewerEl.textContent || "").replace(/\s+/g, " ").trim()
      : "Google Play Store Reviewer";

    const dateEl = card.querySelector(".bp9Aid, [class*='date']");
    const date = dateEl
      ? (dateEl.innerText || dateEl.textContent || "").replace(/\s+/g, " ").trim()
      : "";

    const textEl = card.querySelector(".h3YV2d, [class*='review-text']");
    const text = textEl
      ? (textEl.innerText || textEl.textContent || "").replace(/\s+/g, " ").trim()
      : "";

    if (!text || text.length < 2) return;

    // Filter out developer replies
    const devReplyEl = card.querySelector(".p29vdb, [class*='developer-reply']");
    let cleanText = text;
    if (devReplyEl) {
      const replyText = (devReplyEl.innerText || "").trim();
      if (replyText && cleanText.includes(replyText)) {
        cleanText = cleanText.replace(replyText, "").trim();
      }
    }

    if (!cleanText || cleanText.length < 2) return;

    const dataReviewId = card.getAttribute("data-review-id") || card.dataset?.reviewId || card.querySelector("[data-review-id]")?.getAttribute("data-review-id");
    const uniqueKey = dataReviewId
      ? `id:${dataReviewId}`
      : `${reviewer.toLowerCase()}|${date.toLowerCase()}|${cleanText.toLowerCase()}`;

    if (!seenReviewKeys.has(uniqueKey)) {
      seenReviewKeys.add(uniqueKey);
      allScrapedReviews.push({
        id: dataReviewId || (reviewer && date ? `${reviewer}-${date}-${index}` : `googleplay-review-${allScrapedReviews.length}`),
        reviewer,
        date,
        rating: null,
        text: cleanText,
        review: cleanText,
        platform: "googleplay",
      });
    }
  });

  const metadata = getGooglePlayProductMetadata();

  return {
    ...metadata,
    isProductPage: true,
    reviews: allScrapedReviews,
  };
}
