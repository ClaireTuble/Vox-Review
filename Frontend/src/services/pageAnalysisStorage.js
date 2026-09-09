/**
 * pageAnalysisStorage.js
 *
 * Persistent Page-Specific Analysis Storage Service for VoxReview Browser Extension.
 * Keys analyses by stable platform + source page identifier (<platform>:<source_id_or_url>).
 */

export function getPageKey(platform, urlStr) {
  if (!urlStr || !platform) return null;
  const plat = String(platform).toLowerCase();
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
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['voxreview_page_analyses'], (result) => {
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

export async function saveAnalysisForPage(record) {
  if (!record || !record.platform || !record.page_url) return null;
  const pageKey = record.pageKey || getPageKey(record.platform, record.page_url);
  if (!pageKey) return null;

  const allAnalyses = await getPageAnalyses();
  const updatedRecord = {
    ...record,
    id: record.id || pageKey,
    pageKey: pageKey,
    updated_at: Date.now(),
    date: 'Just now',
    analysisStatus: 'completed'
  };

  allAnalyses[pageKey] = updatedRecord;

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await new Promise((resolve) => {
      chrome.storage.local.set({ voxreview_page_analyses: allAnalyses }, resolve);
    });
  } else {
    try {
      localStorage.setItem('voxreview_page_analyses', JSON.stringify(allAnalyses));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }

  return updatedRecord;
}

export async function deleteAnalysisForPage(identifier) {
  if (!identifier) return;
  const allAnalyses = await getPageAnalyses();
  
  // Find key directly or matching id/pageKey
  let keyToDelete = identifier;
  if (!allAnalyses[keyToDelete]) {
    const foundKey = Object.keys(allAnalyses).find(
      (k) => allAnalyses[k].id === identifier || allAnalyses[k].pageKey === identifier
    );
    if (foundKey) keyToDelete = foundKey;
  }

  if (allAnalyses[keyToDelete]) {
    delete allAnalyses[keyToDelete];
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ voxreview_page_analyses: allAnalyses }, resolve);
      });
    } else {
      try {
        localStorage.setItem('voxreview_page_analyses', JSON.stringify(allAnalyses));
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }
    }
  }
}
