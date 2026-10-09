/**
 * pageAnalysisStorage.js
 *
 * Persistent Page-Specific Analysis Storage Service for VoxReview Browser Extension.
 * Keys analyses by stable platform + source page identifier (<platform>:<source_id_or_url>).
 */

export function getPageKey(platform, urlStr) {
  if (!urlStr || !platform) return null;
  const normalizedPlatform = String(platform).trim().toLowerCase();
  const plat = normalizedPlatform === 'google reviews' || normalizedPlatform === 'google maps'
    ? 'google'
    : normalizedPlatform === 'google play' || normalizedPlatform === 'google play store'
      ? 'googleplay'
      : normalizedPlatform;
  try {
    const url = new URL(urlStr);
    const path = url.pathname.toLowerCase();

    if (plat === 'shopee') {
      const match = path.match(/i\.(\d+)\.(\d+)/i);
      if (match) return `shopee:i.${match[1]}.${match[2]}`;
      const prodMatch = path.match(/\/product\/(\d+)\/(\d+)/i);
      if (prodMatch) return `shopee:i.${prodMatch[1]}.${prodMatch[2]}`;
      const itemid = url.searchParams.get('itemid');
      const shopid = url.searchParams.get('shopid');
      if (itemid && shopid) return `shopee:i.${shopid}.${itemid}`;
    }

    if (plat === 'lazada') {
      const match = path.match(/i(\d+)(?:-s\d+)?\.html/i) || path.match(/i(\d+)/i);
      if (match) return `lazada:i${match[1]}`;
    }

    if (plat === 'google' || plat === 'google maps') {
      const placeMatch = path.match(/\/maps\/place\/([^/@]+)/i);
      if (placeMatch) {
        return `google:place:${decodeURIComponent(placeMatch[1]).trim().toLowerCase()}`;
      }
      const searchMatch = path.match(/\/maps\/search\/([^/@]+)/i);
      if (searchMatch) {
        return `google:search:${decodeURIComponent(searchMatch[1]).trim().toLowerCase()}`;
      }
    }

    if (plat === 'steam') {
      const match = path.match(/\/app\/(\d+)/i);
      if (match) return `steam:app/${match[1]}`;
    }

    if (plat === 'googleplay') {
      const id = url.searchParams.get('id');
      if (id) return `googleplay:${id.toLowerCase()}`;
    }

    const cleanPath = url.pathname.replace(/\/+$/, '');
    return `${plat}:${url.origin}${cleanPath}`.toLowerCase();
  } catch {
    return `${plat}:${String(urlStr).toLowerCase()}`;
  }
}

export async function getPageAnalyses() {
  if (globalThis.chrome?.storage?.local) {
    return new Promise((resolve, reject) => {
      globalThis.chrome.storage.local.get(['voxreview_page_analyses'], (result) => {
        if (globalThis.chrome.runtime?.lastError) {
          reject(new Error(globalThis.chrome.runtime.lastError.message));
          return;
        }
        resolve(result?.voxreview_page_analyses || {});
      });
    });
  }
  try {
    const raw = localStorage.getItem('voxreview_page_analyses');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function getAnalysisForPage(platform, urlStr) {
  const pageKey = getPageKey(platform, urlStr);
  if (!pageKey) return null;
  const allAnalyses = await getPageAnalyses();
  return allAnalyses[pageKey] || null;
}

export async function getSavedAnalysisCount() {
  return Object.keys(await getPageAnalyses()).length;
}

function getReviewIdentity(review) {
  if (typeof review === 'string') return review;
  if (!review || typeof review !== 'object') return '';
  const text = review.text ?? review.reviewText ?? review.comment ?? review.review ?? '';
  const id = review.id ?? review.reviewId ?? '';
  return JSON.stringify({ id, text });
}

function hasValidTopicResults(topicAnalysis, reviews) {
  return Array.isArray(reviews) && Array.isArray(topicAnalysis?.results) &&
    topicAnalysis.results.length === reviews.length &&
    topicAnalysis.results.every((result) => Array.isArray(result?.topics) && result.topics.every((topic) => (
      typeof topic?.label === 'string' && typeof topic?.score === 'number'
    )));
}

function reviewAnalysisMatchesBatch(reviewAnalysis, reviews) {
  return Array.isArray(reviewAnalysis) && Array.isArray(reviews) &&
    reviewAnalysis.length === reviews.length &&
    reviewAnalysis.every((analysis, index) => getReviewIdentity(analysis?.review) === getReviewIdentity(reviews[index]));
}

function writePageAnalyses(allAnalyses) {
  if (globalThis.chrome?.storage?.local) {
    return new Promise((resolve, reject) => {
      globalThis.chrome.storage.local.set({ voxreview_page_analyses: allAnalyses }, () => {
        if (globalThis.chrome.runtime?.lastError) reject(new Error(globalThis.chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }

  try {
    localStorage.setItem('voxreview_page_analyses', JSON.stringify(allAnalyses));
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function saveAnalysisForPage(record) {
  if (!record || !record.platform || !record.page_url) return null;
  const pageKey = getPageKey(record.platform, record.page_url) || record.pageKey;
  if (!pageKey) return null;

  const allAnalyses = await getPageAnalyses();
  const previousRecord = allAnalyses[pageKey] || {};
  const reviews = Array.isArray(record.reviews) ? record.reviews : previousRecord.reviews;
  const sameReviewBatch = Array.isArray(reviews) && Array.isArray(previousRecord.reviews) &&
    reviews.length === previousRecord.reviews.length &&
    reviews.every((review, index) => getReviewIdentity(review) === getReviewIdentity(previousRecord.reviews[index]));
  const incomingTopicsAreValid = hasValidTopicResults(record.topicAnalysis, reviews) && (
    sameReviewBatch || !previousRecord.reviews || reviewAnalysisMatchesBatch(record.reviewAnalysis, reviews)
  );
  const previousTopicsAreValid = sameReviewBatch && hasValidTopicResults(previousRecord.topicAnalysis, reviews);
  const mergedRecord = { ...previousRecord, ...record, reviews };

  if (!incomingTopicsAreValid && previousTopicsAreValid) {
    mergedRecord.topicAnalysis = previousRecord.topicAnalysis;
  } else if (!sameReviewBatch && !incomingTopicsAreValid) {
    mergedRecord.topicAnalysis = null;
    if (!reviewAnalysisMatchesBatch(record.reviewAnalysis, reviews)) {
      mergedRecord.reviewAnalysis = [];
      mergedRecord.emotionData = null;
      mergedRecord.dominantEmotion = null;
      mergedRecord.percentage = null;
    }
  }

  const updatedRecord = {
    ...mergedRecord,
    id: record.id || previousRecord.id || pageKey,
    pageKey: pageKey,
    updated_at: Date.now(),
    date: 'Just now',
    analysisStatus: 'completed'
  };

  Object.entries(allAnalyses).forEach(([existingKey, existingRecord]) => {
    if (existingKey !== pageKey && existingRecord?.platform && existingRecord?.page_url &&
      getPageKey(existingRecord.platform, existingRecord.page_url) === pageKey) {
      delete allAnalyses[existingKey];
    }
  });
  allAnalyses[pageKey] = updatedRecord;
  await writePageAnalyses(allAnalyses);

  return updatedRecord;
}

export async function deleteAnalysisForPage(identifier) {
  if (!identifier) return;
  const allAnalyses = await getPageAnalyses();

  const directlyMatchedRecord = allAnalyses[identifier] || Object.values(allAnalyses).find((record) => (
    record.id === identifier || record.pageKey === identifier
  ));
  if (!directlyMatchedRecord) return false;
  const pageKey = getPageKey(directlyMatchedRecord.platform, directlyMatchedRecord.page_url) ||
    directlyMatchedRecord.pageKey || identifier;
  const keysToDelete = Object.keys(allAnalyses).filter((key) => {
    const record = allAnalyses[key];
    return key === identifier || record.id === identifier || record.pageKey === identifier ||
      (record.platform && record.page_url && getPageKey(record.platform, record.page_url) === pageKey);
  });

  if (keysToDelete.length > 0) {
    keysToDelete.forEach((key) => delete allAnalyses[key]);
    await writePageAnalyses(allAnalyses);
    return true;
  }
  return false;
}

export async function clearAllPageAnalyses() {
  await writePageAnalyses({});
  return 0;
}
