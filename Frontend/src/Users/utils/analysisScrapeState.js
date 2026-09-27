import { getPageKey } from '../../services/pageAnalysisStorage.js';

export function isMatchingRescanScrape(scrape, pendingRescan) {
  if (!scrape || !pendingRescan) return false;
  const samePage = getPageKey(scrape.platform, scrape.url) === pendingRescan.pageKey;
  const sameTab = pendingRescan.tabId == null || scrape.tabId == null ||
    Number(scrape.tabId) === Number(pendingRescan.tabId);
  const fresh = Number(scrape.timestamp || 0) >= pendingRescan.startedAt;
  return samePage && sameTab && fresh && scrape.rescanRequestId === pendingRescan.requestId;
}
