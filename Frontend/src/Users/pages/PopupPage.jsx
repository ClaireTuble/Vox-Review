import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import authService, { openWebAppAuth } from '../../services/authService.js';
import { getAnalysisForPage, getSavedAnalysisCount, saveAnalysisForPage, getPageKey } from '../../services/pageAnalysisStorage.js';
import Header from '../components/Header.jsx';
import DetectedPageCard from '../components/DetectedPageCard.jsx';
import AnalysisResults from '../components/AnalysisResults.jsx';
import SavedAnalysesView from '../components/SavedAnalysesView.jsx';
import ProfileView from '../components/ProfileView.jsx';
import BottomNavBar from '../components/BottomNavBar.jsx';
import UnsupportedSiteView from '../components/UnsupportedSiteView.jsx';
import NoReviewsView from '../components/NoReviewsView.jsx';
import LogoutConfirmationModalExtension from '../components/LogoutConfirmationModalExtension.jsx';
import { aggregateTopicsForReviews, getReviewText } from '../utils/reviewTopics.js';
import { getNewReviews } from '../utils/savedAnalysisRefresh.js';
import { attachReviewPriorities } from '../utils/priorityEngine.js';
import { isMatchingRescanScrape } from '../utils/analysisScrapeState.js';
import '../css/PopupPage.css';

const SVM_API_URL = 'http://localhost:5000/api/nlp/svm/predict';
const TOPIC_API_URL = 'http://localhost:5000/api/nlp/topics/predict';
const ENABLE_TOPIC_ANALYSIS = import.meta.env.VITE_ENABLE_TOPIC_ANALYSIS !== 'false';
const TOPIC_REQUEST_TIMEOUT_BASE_MS = 75000;
const TOPIC_REQUEST_TIMEOUT_PER_REVIEW_MS = 12000;
const VALID_CATEGORIES = new Set([1, 2, 3, 4, 5, 6]);
const CATEGORY_DISPLAY = {
  1: { label: 'Happy', emoji: '😊', color: '#EAB308' },
  2: { label: 'Sad', emoji: '😢', color: '#3B82F6' },
  3: { label: 'Anger', emoji: '😠', color: '#EF4444' },
  4: { label: 'Disgust', emoji: '🤢', color: '#16A34A' },
  5: { label: 'Fear', emoji: '😨', color: '#F97316' },
  6: { label: 'Sarcastic', emoji: '😒', color: '#A855F7' },
};
const VALID_TOPIC_LABELS = new Set([
  'Quality', 'Performance / Functionality', 'Features / Content', 'Service / Support',
  'Delivery / Transaction', 'Price / Value', 'Usability / Experience',
  'Accuracy / Expectations', 'Availability / Accessibility', 'Environment / Location', 'Other / General',
]);
const CATEGORY_BY_EMOTION_ID = new Map(
  Object.entries(CATEGORY_DISPLAY).map(([category, display]) => [display.label.toLowerCase(), Number(category)]),
);

function hasValidTopicAnalysis(topicAnalysis, expectedReviewCount) {
  return Array.isArray(topicAnalysis?.results) &&
    topicAnalysis.results.length === expectedReviewCount &&
    topicAnalysis.results.every((result) => Array.isArray(result?.topics) && result.topics.every((topic) => (
      VALID_TOPIC_LABELS.has(topic?.label) && typeof topic.score === 'number'
    )));
}

function getTopicRequestTimeoutMs(reviewCount) {
  return TOPIC_REQUEST_TIMEOUT_BASE_MS + reviewCount * TOPIC_REQUEST_TIMEOUT_PER_REVIEW_MS;
}

async function requestTopicAnalysis(reviewTexts, signal, platform) {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const platformKey = ({
    'google reviews': 'google',
    'google play': 'googleplay',
  })[normalizedPlatform] || normalizedPlatform;
  const response = await fetch(TOPIC_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviews: reviewTexts, platform: platformKey }),
    signal,
  });
  const payload = await response.json();
  if (!response.ok || !payload?.success || !hasValidTopicAnalysis(payload, reviewTexts.length)) {
    throw new Error(payload?.error || 'Review topic response was invalid.');
  }
  return payload;
}

function getReviewerName(review, platform) {
  if (review && typeof review === 'object') {
    return review.reviewer || review.author || review.userName || review.reviewerName || `${platform || 'Current Source'} Reviewer`;
  }
  return `${platform || 'Current Source'} Reviewer`;
}

function getPlatformLabel(platform) {
  const labels = {
    googleplay: 'Google Play',
    google: 'Google Reviews',
    lazada: 'Lazada',
    shopee: 'Shopee',
    steam: 'Steam',
    agoda: 'Agoda',
  };
  return labels[String(platform || '').toLowerCase()] || 'Current Source';
}

function getSvmEmotionKeywords(explanationResults, category) {
  const frequencies = new Map();
  const surfaces = new Map();

  explanationResults.forEach((result) => {
    if (result?.category !== category || !Array.isArray(result.emotionDrivers)) return;
    new Set(result.emotionDrivers).forEach((driver) => {
      const key = driver.toLocaleLowerCase();
      frequencies.set(key, (frequencies.get(key) || 0) + 1);
      if (!surfaces.has(key)) surfaces.set(key, driver);
    });
  });

  return [...frequencies.entries()]
    .sort(([leftTerm, leftCount], [rightTerm, rightCount]) => rightCount - leftCount || leftTerm.localeCompare(rightTerm))
    .slice(0, 5)
    .map(([term]) => surfaces.get(term));
}

function buildEmotionData(reviews, predictions, platform, topicResponse = null, topicStatus = 'pending', explanationResults = []) {
  const counts = predictions.reduce((summary, category) => {
    summary[category] += 1;
    return summary;
  }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
  const totalReviews = predictions.length;
  const dominantCategory = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]);
  const dominantDisplay = CATEGORY_DISPLAY[dominantCategory];

  const emotions = Object.entries(CATEGORY_DISPLAY).map(([category, display]) => ({
    id: display.label.toLowerCase(),
    category: Number(category),
    label: display.label,
    emoji: display.emoji,
    percentage: totalReviews ? Math.round((counts[category] / totalReviews) * 100) : 0,
    count: counts[category],
    confidence: 'SVM',
    keywords: getSvmEmotionKeywords(explanationResults, Number(category)),
    color: display.color,
  }));

  const topics = aggregateTopicsForReviews(
    reviews.map((review, topicResultIndex) => ({ review, topicResultIndex })),
    topicResponse,
  );
  const quotes = reviews.map((review, index) => {
    const category = predictions[index];
    const display = CATEGORY_DISPLAY[category];
    return {
      id: index + 1,
      topicResultIndex: index,
      category,
      emotion: display.label,
      emoji: display.emoji,
      driver: `${platform || 'Current Source'} Review`,
      text: getReviewText(review),
      author: getReviewerName(review, platform),
      date: review?.date || review?.reviewDate || '',
      rating: review?.rating ?? null,
      helpfulCount: review?.helpfulCount ?? null,
    };
  });

  return {
    totalReviews,
    dominantEmotion: {
      label: dominantDisplay.label,
      emoji: dominantDisplay.emoji,
      percentage: totalReviews ? Math.round((counts[dominantCategory] / totalReviews) * 100) : 0,
      confidence: 'SVM',
    },
    emotions,
    topics,
    topicStatus,
    topicModel: topicResponse?.model || null,
    topicThreshold: topicResponse?.threshold ?? null,
    quotes: attachReviewPriorities(quotes, topicResponse),
  };
}

/**
 * Resolves the currently active tab at the exact moment of execution.
 * Prioritizes lastFocusedWindow (accurate for Side Panel & multi-window setups)
 * with a fallback to currentWindow.
 */
async function resolveCurrentActiveTab() {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0 && tabs[0]?.id) {
        resolve(tabs[0]);
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (fallbackTabs) => {
        resolve(fallbackTabs?.[0] || null);
      });
    });
  });
}

/**
 * General URL rule for website support detection.
 * Evaluates the hostname/URL of the active tab.
 * If the hostname is NOT in the supported list -> returns 'unknown'.
 * Platform support is determined SOLELY by this detector.
 */
function detectPlatformFromUrl(urlStr) {
  if (!urlStr) return 'unknown';
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    // Steam Store (store.steampowered.com)
    if (host === 'store.steampowered.com' || host.endsWith('.steampowered.com') || host.includes('steampowered.com')) {
      return 'steam';
    }

    // Google Play Store
    if (host === 'play.google.com' || host.startsWith('play.google.') || host.includes('play.google')) {
      return 'googleplay';
    }

    // Shopee
    if (host.includes('shopee')) {
      return 'shopee';
    }

    // Lazada
    if (host.includes('lazada')) {
      return 'lazada';
    }

    // Google Maps
    if (
      (host === 'www.google.com' || host === 'maps.google.com' || host.endsWith('.google.com') || host.endsWith('.google.com.ph') || host.includes('google.')) &&
      (path.startsWith('/maps') || host.startsWith('maps.'))
    ) {
      return 'google';
    }

    return 'unknown';
  } catch (err) {
    return 'unknown';
  }
}

export default function PopupPage() {
  const navigate = useNavigate();

  // Synchronized authenticated user state
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser());
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const isLoggedIn = !!currentUser;

  const [theme, setTheme] = useState(() => localStorage.getItem('voxreview-theme') || 'light');
  const [authToastMessage, setAuthToastMessage] = useState('');
  const [activeTab, setActiveTab] = useState('analyze');
  const [analysisStatus, setAnalysisStatus] = useState('idle');
  const [emotionData, setEmotionData] = useState(null);
  const [topicAnalysis, setTopicAnalysis] = useState(null);
  const [currentAnalysisRecord, setCurrentAnalysisRecord] = useState(null);
  const [isSavingAnalysis, setIsSavingAnalysis] = useState(false);
  const [hasSavedAnalysis, setHasSavedAnalysis] = useState(false);
  const [saveAnalysisError, setSaveAnalysisError] = useState('');
  const [savedAnalysisCount, setSavedAnalysisCount] = useState(0);
  const [analysisViewRevision, setAnalysisViewRevision] = useState(0);
  const [isRescanning, setIsRescanning] = useState(false);
  const [activeTabUrl, setActiveTabUrl] = useState('');
  const [hasResolvedActiveTab, setHasResolvedActiveTab] = useState(false);
  const isSiteUnsupported = hasResolvedActiveTab && detectPlatformFromUrl(activeTabUrl) === 'unknown';

  // Scrape data read from chrome.storage.local (set by background.js)
  const [detectedPlatform, setDetectedPlatform] = useState('');
  const [scrapedIsProductPage, setScrapedIsProductPage] = useState(false);
  const [scrapedProductTitle, setScrapedProductTitle] = useState(null);
  const [scrapedCategory, setScrapedCategory] = useState(null);
  const [scrapedRating, setScrapedRating] = useState(null);
  const [scrapedProductImage, setScrapedProductImage] = useState(null);
  const [scrapedReviews, setScrapedReviews] = useState([]);
  const [scrapedHasError, setScrapedHasError] = useState(false);
  const [scrapedErrorMessage, setScrapedErrorMessage] = useState('');

  // Real-time refs to avoid closure staleness during async events
  const activeTabUrlRef = useRef(activeTabUrl);
  const detectedPlatformRef = useRef(detectedPlatform);
  const activeContextRef = useRef({ tabId: null, url: '', platform: 'unknown', pageKey: null, generation: 0, isResolved: false });
  const pendingScrapeDataRef = useRef(null);
  const lastScrapedReviewsRef = useRef([]);
  const rescanAnalysisPendingRef = useRef(null);
  const rescanTimeoutRef = useRef(null);
  const rescanRequestCounterRef = useRef(0);
  const ignoreAutomaticScrapesRef = useRef(false);
  const analysisRevisionRef = useRef(0);
  const analysisResolvedPageKeyRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const refreshCount = () => {
      getSavedAnalysisCount().then((count) => {
        if (isMounted) setSavedAnalysisCount(count);
      }).catch((error) => {
        if (import.meta.env.DEV) console.error('VoxReview: Could not count saved analyses:', error);
      });
    };

    refreshCount();
    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'local' || !changes.voxreview_page_analyses) return;
      setSavedAnalysisCount(Object.keys(changes.voxreview_page_analyses.newValue || {}).length);
    };
    globalThis.chrome?.storage?.onChanged?.addListener(handleStorageChange);

    return () => {
      isMounted = false;
      globalThis.chrome?.storage?.onChanged?.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'saved') return;
    getSavedAnalysisCount().then(setSavedAnalysisCount).catch((error) => {
      if (import.meta.env.DEV) console.error('VoxReview: Could not refresh saved count:', error);
    });
  }, [activeTab]);

  useEffect(() => {
    activeTabUrlRef.current = activeTabUrl;
  }, [activeTabUrl]);

  useEffect(() => {
    detectedPlatformRef.current = detectedPlatform;
  }, [detectedPlatform]);

  const syncScrapeData = (data) => {
    if (!data) return;
    const scrapeStartedAt = performance.now();
    console.log('[Analyze] scrape start');

    console.log('[POPUP] storage payload received:', {
      platform: data.platform,
      reviewCount: Array.isArray(data.reviews) ? data.reviews.length : 0,
      tabId: data.tabId ?? null,
      url: data.url || ''
    });

    const currentContext = activeContextRef.current;
    if (!currentContext.isResolved) {
      console.log('[POPUP] active context not resolved yet, queuing scrape data');
      pendingScrapeDataRef.current = data;
      return;
    }

    const scrapeUrl = data.url || '';
    const scrapePlatform = String(data.platform || '').toLowerCase();
    const currentActiveUrl = currentContext.url || activeTabUrlRef.current;
    const currentActivePlat = String(currentContext.platform || detectedPlatformRef.current || '').toLowerCase();

    // Check if data belongs to the currently active tab / page.
    const isForCurrentTab = (() => {
      if (scrapePlatform && currentActivePlat && currentActivePlat !== 'unknown' && scrapePlatform !== currentActivePlat) {
        return false;
      }

      // A. Normalized page identity must win over tab ID for SPA navigation races.
      if (scrapeUrl && currentActiveUrl) {
        if (scrapeUrl === currentActiveUrl) return true;
        const currentKey = currentContext.pageKey || getPageKey(currentActivePlat, currentActiveUrl);
        const scrapeKey = getPageKey(scrapePlatform, scrapeUrl);
        console.log('[POPUP] page key comparison:', { currentKey, scrapeKey });
        if (currentKey && scrapeKey && currentKey === scrapeKey) return true;
        if (currentKey && scrapeKey && currentKey !== scrapeKey) return false;
      }

      // B. Same tab ID, only after confirming there is no page-key conflict.
      if (data.tabId != null && currentContext.tabId != null && Number(data.tabId) === Number(currentContext.tabId)) {
        return true;
      }

      // C. Relaxed URL origin + pathname comparison
      if (scrapeUrl && currentActiveUrl) {
        try {
          const u1 = new URL(scrapeUrl);
          const u2 = new URL(currentActiveUrl);
          if (u1.origin === u2.origin && u1.pathname.replace(/\/+$/, '') === u2.pathname.replace(/\/+$/, '')) {
            return true;
          }
        } catch {}
      }

      // D. Matching platform with active tab
      if (currentActivePlat && currentActivePlat === scrapePlatform && !currentActiveUrl) {
        return true;
      }

      return false;
    })();

    if (!isForCurrentTab) {
      console.log('[POPUP] scrape data is for another tab/page, preserving current view');
      return;
    }

    const pendingRescan = rescanAnalysisPendingRef.current;
    if (!pendingRescan && ignoreAutomaticScrapesRef.current) {
      console.log('[POPUP] ignoring ambient scrape after Clear Analysis');
      return;
    }
    if (!pendingRescan && currentContext.pageKey &&
      analysisResolvedPageKeyRef.current === currentContext.pageKey) {
      console.log('[POPUP] ignoring automatic scrape update for an already resolved analysis');
      return;
    }
    if (pendingRescan) {
      if (!isMatchingRescanScrape(data, pendingRescan)) {
        console.log('[RESCAN] ignoring stale or unrelated scrape update', {
          platform: scrapePlatform,
          tabId: data.tabId ?? null,
          pageKey: getPageKey(scrapePlatform, scrapeUrl),
          timestamp: data.timestamp ?? null,
          requestMatches: data.rescanRequestId === pendingRescan.requestId,
        });
        return;
      }
    }

    console.log('[POPUP] applying reviews:', Array.isArray(data.reviews) ? data.reviews.length : 0);
    if (data.platform) setDetectedPlatform(data.platform);
    if (data.isProductPage !== undefined) setScrapedIsProductPage(data.isProductPage);
    if (data.productTitle !== undefined) setScrapedProductTitle(data.productTitle);
    if (data.category !== undefined) setScrapedCategory(data.category);
    if (data.rating !== undefined) setScrapedRating(data.rating);
    if (data.productImage !== undefined) setScrapedProductImage(data.productImage);
    if (Array.isArray(data.reviews)) {
      setScrapedReviews(data.reviews);
      lastScrapedReviewsRef.current = data.reviews;
    }
    if (data.hasError !== undefined) setScrapedHasError(!!data.hasError);
    if (data.errorMessage !== undefined) setScrapedErrorMessage(data.errorMessage);
    console.log('[POPUP] final review count:', Array.isArray(data.reviews) ? data.reviews.length : 0);
    console.log(`[Analyze] scrape: ${Math.round(performance.now() - scrapeStartedAt)} ms`);

    if (pendingRescan) {
      rescanAnalysisPendingRef.current = null;
      if (rescanTimeoutRef.current) clearTimeout(rescanTimeoutRef.current);
      rescanTimeoutRef.current = null;
      setIsRescanning(false);
      if (pendingRescan.savedItem) {
        if (data.hasError || data.isProductPage === false || !Array.isArray(data.reviews)) {
          pendingRescan.resolveRefresh?.({
            success: false,
            error: data.errorMessage || 'Unable to retrieve reviews from the saved source page.',
          });
          return;
        }
        void handleSavedAnalysisRefresh(pendingRescan.savedItem, data)
          .then((result) => pendingRescan.resolveRefresh?.(result))
          .catch((error) => pendingRescan.resolveRefresh?.({
            success: false,
            error: error.message || 'Unable to refresh this saved analysis.',
          }));
        return;
      }
      if (data.hasError) {
        setEmotionData(null);
        setTopicAnalysis(null);
        setCurrentAnalysisRecord(null);
        setHasSavedAnalysis(false);
        setIsSavingAnalysis(false);
        setSaveAnalysisError('');
        setAnalysisStatus('idle');
      } else if (data.isProductPage !== false && Array.isArray(data.reviews) && data.reviews.length > 0) {
        void handleAnalyzeClick(data.reviews, data);
      } else {
        setEmotionData(null);
        setTopicAnalysis(null);
        setCurrentAnalysisRecord(null);
        setHasSavedAnalysis(false);
        setIsSavingAnalysis(false);
        setSaveAnalysisError('');
        setAnalysisStatus('idle');
      }
    }
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('voxreview-theme', theme);
  }, [theme]);

  useEffect(() => {
    const updateActiveTabContext = async () => {
      const activeTabObj = await resolveCurrentActiveTab();
      const activeUrl = activeTabObj?.url || '';
      if (!activeUrl) return;

      const urlBasedPlatform = detectPlatformFromUrl(activeUrl);
      const newPageKey = getPageKey(urlBasedPlatform, activeUrl);
      const previousContext = activeContextRef.current;

      const pageGenuinelyChanged = previousContext.isResolved && (
        (previousContext.pageKey && newPageKey && previousContext.pageKey !== newPageKey) ||
        (previousContext.platform !== urlBasedPlatform)
      );
      if (pageGenuinelyChanged) {
        analysisRevisionRef.current += 1;
        analysisResolvedPageKeyRef.current = null;
      }
      const restoreRevision = analysisRevisionRef.current;

      const context = {
        tabId: activeTabObj.id,
        url: activeUrl,
        platform: urlBasedPlatform,
        pageKey: newPageKey,
        generation: pageGenuinelyChanged ? previousContext.generation + 1 : previousContext.generation,
        isResolved: true,
      };
      activeContextRef.current = context;
      setActiveTabUrl(activeUrl);
      setHasResolvedActiveTab(true);

      console.log('[POPUP] current tab:', { tabId: context.tabId, url: activeUrl, platform: urlBasedPlatform });
      console.log('[POPUP] page key:', newPageKey);

      if (urlBasedPlatform === 'unknown') {
        ignoreAutomaticScrapesRef.current = false;
        rescanAnalysisPendingRef.current = null;
        if (rescanTimeoutRef.current) clearTimeout(rescanTimeoutRef.current);
        rescanTimeoutRef.current = null;
        setIsRescanning(false);
        setDetectedPlatform('');
        setScrapedIsProductPage(false);
        setScrapedProductTitle(null);
        setScrapedCategory(null);
        setScrapedRating(null);
        setScrapedProductImage(null);
        setScrapedReviews([]);
        lastScrapedReviewsRef.current = [];
        setScrapedHasError(false);
        setScrapedErrorMessage('');
        setEmotionData(null);
        setTopicAnalysis(null);
        setCurrentAnalysisRecord(null);
        setHasSavedAnalysis(false);
        analysisResolvedPageKeyRef.current = null;
        setAnalysisStatus('idle');
        return;
      }

      setDetectedPlatform(urlBasedPlatform);

      if (pageGenuinelyChanged) {
        ignoreAutomaticScrapesRef.current = false;
        rescanAnalysisPendingRef.current = null;
        if (rescanTimeoutRef.current) clearTimeout(rescanTimeoutRef.current);
        rescanTimeoutRef.current = null;
        setIsRescanning(false);
        setScrapedIsProductPage(false);
        setScrapedProductTitle(null);
        setScrapedCategory(null);
        setScrapedRating(null);
        setScrapedProductImage(null);
        setScrapedReviews([]);
        lastScrapedReviewsRef.current = [];
        setScrapedHasError(false);
        setScrapedErrorMessage('');
        setEmotionData(null);
        setTopicAnalysis(null);
        setCurrentAnalysisRecord(null);
        setHasSavedAnalysis(false);
        setAnalysisStatus('idle');
      }

      const existingAnalysis = await getAnalysisForPage(urlBasedPlatform, activeUrl);
      if (activeContextRef.current.generation !== context.generation || analysisRevisionRef.current !== restoreRevision) return;
      if (analysisResolvedPageKeyRef.current === context.pageKey) return;

      if (existingAnalysis) {
        analysisResolvedPageKeyRef.current = context.pageKey;
        setCurrentAnalysisRecord(existingAnalysis);
        setHasSavedAnalysis(hasValidTopicAnalysis(existingAnalysis.topicAnalysis, existingAnalysis.reviews || []) || !ENABLE_TOPIC_ANALYSIS);
        setSaveAnalysisError('');
        if (existingAnalysis.productTitle) setScrapedProductTitle(existingAnalysis.productTitle);
        if (existingAnalysis.reviews) {
          setScrapedReviews(existingAnalysis.reviews);
          lastScrapedReviewsRef.current = existingAnalysis.reviews;
          setScrapedIsProductPage(existingAnalysis.reviews.length > 0);
        }
        if (existingAnalysis.rating) setScrapedRating(existingAnalysis.rating);
        if (existingAnalysis.category) setScrapedCategory(existingAnalysis.category);
        if (existingAnalysis.productImage) setScrapedProductImage(existingAnalysis.productImage);
        if (existingAnalysis.emotionData) {
          const savedReviews = Array.isArray(existingAnalysis.reviews) ? existingAnalysis.reviews : [];
          const savedReviewAnalysis = Array.isArray(existingAnalysis.reviewAnalysis) ? existingAnalysis.reviewAnalysis : [];
          const savedTopics = existingAnalysis.topicAnalysis;
          const hasSavedTopicResults = hasValidTopicAnalysis(savedTopics, savedReviews.length);
          const restoredQuotes = attachReviewPriorities(savedReviewAnalysis.length === savedReviews.length
            ? savedReviewAnalysis.map((analysis, index) => {
                const review = savedReviews[index] ?? analysis.review;
                const category = analysis.category;
                const display = CATEGORY_DISPLAY[category];
                return {
                  id: review?.id ?? review?.reviewId ?? index + 1,
                  topicResultIndex: index,
                  category,
                  emotion: display?.label || 'Pending',
                  emoji: display?.emoji || '💬',
                  driver: `${existingAnalysis.platform || 'Current Source'} Review`,
                  text: getReviewText(review),
                  author: getReviewerName(review, existingAnalysis.platform),
                  rating: review?.rating ?? null,
                  helpfulCount: review?.helpfulCount ?? null,
                };
              })
            : (existingAnalysis.emotionData.quotes || []).map((quote, index) => ({
                ...quote,
                id: quote.id ?? index + 1,
                topicResultIndex: index,
                category: quote.category ?? CATEGORY_BY_EMOTION_ID.get(quote.emotion?.toLowerCase()),
                rating: savedReviews[index]?.rating ?? quote.rating ?? null,
                helpfulCount: savedReviews[index]?.helpfulCount ?? quote.helpfulCount ?? null,
              })), savedTopics);
          const savedEmotions = (existingAnalysis.emotionData.emotions || []).map((emotion) => ({
            ...emotion,
            category: emotion.category ?? CATEGORY_BY_EMOTION_ID.get(emotion.id),
          }));
          const restoredEmotionData = {
            ...existingAnalysis.emotionData,
            emotions: savedEmotions,
            quotes: restoredQuotes,
            ...(hasSavedTopicResults
              ? {
                  topics: aggregateTopicsForReviews(
                    savedReviews.map((review, topicResultIndex) => ({ review, topicResultIndex })),
                    savedTopics,
                  ),
                  topicStatus: 'ready',
                  topicModel: savedTopics.model || null,
                  topicThreshold: savedTopics.threshold ?? null,
                }
                : {
                    topicStatus: !ENABLE_TOPIC_ANALYSIS
                      ? 'disabled'
                      : savedReviews.length > 0 ? 'pending' : 'not-analyzed',
                  }),
          };
          setEmotionData(restoredEmotionData);
          setTopicAnalysis(hasSavedTopicResults ? savedTopics : null);
          const savedReviewTexts = savedReviews.map(getReviewText);
          if (ENABLE_TOPIC_ANALYSIS && !hasSavedTopicResults && savedReviewTexts.length > 0 && savedReviewTexts.every((text) => text.trim())) {
            analysisResolvedPageKeyRef.current = context.pageKey;
            const topicRevision = ++analysisRevisionRef.current;
            const topicAbortController = new AbortController();
            const topicTimeout = setTimeout(
              () => topicAbortController.abort(),
              getTopicRequestTimeoutMs(savedReviewTexts.length),
            );
            void requestTopicAnalysis(
              savedReviewTexts,
              topicAbortController.signal,
              getPlatformLabel(existingAnalysis.platform || urlBasedPlatform),
            )
              .then(async (topicPayload) => {
                if (analysisRevisionRef.current !== topicRevision) return;
                const topicData = {
                  ...restoredEmotionData,
                  quotes: attachReviewPriorities(restoredEmotionData.quotes, topicPayload),
                  topics: aggregateTopicsForReviews(
                    savedReviews.map((review, topicResultIndex) => ({ review, topicResultIndex })),
                    topicPayload,
                  ),
                  topicStatus: 'ready',
                  topicModel: topicPayload.model || null,
                  topicThreshold: topicPayload.threshold ?? null,
                };
                analysisRevisionRef.current += 1;
                setTopicAnalysis(topicPayload);
                setEmotionData(topicData);
                setCurrentAnalysisRecord((currentRecord) => currentRecord
                  ? { ...currentRecord, topicAnalysis: topicPayload, emotionData: topicData }
                  : currentRecord);
                setHasSavedAnalysis(false);
              })
              .catch((topicError) => {
                if (analysisRevisionRef.current !== topicRevision) return;
                console.warn('VoxReview: legacy topic analysis unavailable:', topicError);
                analysisRevisionRef.current += 1;
                setEmotionData((currentData) => currentData
                  ? { ...currentData, topicStatus: 'unavailable' }
                  : currentData);
              })
              .finally(() => clearTimeout(topicTimeout));
          }
        } else {
          setEmotionData(null);
          setTopicAnalysis(null);
        }
        setScrapedHasError(false);
        setScrapedErrorMessage('');
        setAnalysisStatus('completed');
      } else {
        setEmotionData(null);
        setTopicAnalysis(null);
        setCurrentAnalysisRecord(null);
        setHasSavedAnalysis(false);
        if (pendingScrapeDataRef.current) {
          const pending = pendingScrapeDataRef.current;
          pendingScrapeDataRef.current = null;
          syncScrapeData(pending);
        } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get(['voxreviewLastScrape'], (res) => {
            const lastScrape = res?.voxreviewLastScrape;
            if (
              activeContextRef.current.generation === context.generation &&
              lastScrape &&
              Array.isArray(lastScrape.reviews)
            ) {
              syncScrapeData(lastScrape);
            }
          });
        }
      }
    };

    updateActiveTabContext();

    if (typeof chrome !== 'undefined') {
      const handleTabActivated = () => updateActiveTabContext();
      const handleTabUpdated = (tabId, changeInfo) => {
        if (changeInfo.status === 'complete' || changeInfo.url) {
          updateActiveTabContext();
        }
      };
      const handleWindowFocusChanged = (windowId) => {
        if (windowId !== chrome.windows?.WINDOW_ID_NONE) {
          updateActiveTabContext();
        }
      };

      chrome.tabs?.onActivated?.addListener(handleTabActivated);
      chrome.tabs?.onUpdated?.addListener(handleTabUpdated);
      chrome.windows?.onFocusChanged?.addListener(handleWindowFocusChanged);

      let handleStorageChange;
      if (chrome.storage?.local) {
        chrome.storage.local.get(['voxreviewLastScrape', 'voxreview_auth_session'], async (result) => {
          syncScrapeData(result?.voxreviewLastScrape);

          const extSession = result?.voxreview_auth_session;
          if (extSession?.user && extSession?.token) {
            authService.setSession(extSession);
            setCurrentUser(extSession.user);

            const liveUser = await authService.refreshCurrentUserProfile();
            if (liveUser) {
              setCurrentUser(liveUser);
            }
          } else {
            setCurrentUser(null);
          }
        });

        handleStorageChange = (changes, areaName) => {
          if (areaName !== 'local') return;

          if (changes.voxreview_auth_session) {
            const newSession = changes.voxreview_auth_session.newValue;
            if (newSession && newSession.user) {
              authService.setSession(newSession);
              setCurrentUser(newSession.user);

              authService.refreshCurrentUserProfile().then((liveUser) => {
                if (liveUser) {
                  setCurrentUser(liveUser);
                }
              }).catch(() => {});

              setAuthToastMessage("You're now signed in.");
              setTimeout(() => setAuthToastMessage(''), 4000);
            } else {
              authService.logout();
              setCurrentUser(null);
              setAuthToastMessage('');
            }
          }

          if (changes.voxreviewLastScrape) {
            const newScrape = changes.voxreviewLastScrape.newValue;
            syncScrapeData(newScrape);
          }
        };

        if (chrome.storage.onChanged) {
          chrome.storage.onChanged.addListener(handleStorageChange);
        }
      }

      return () => {
        chrome.tabs?.onActivated?.removeListener(handleTabActivated);
        chrome.tabs?.onUpdated?.removeListener(handleTabUpdated);
        chrome.windows?.onFocusChanged?.removeListener(handleWindowFocusChanged);
        if (handleStorageChange && chrome.storage?.onChanged) {
          chrome.storage.onChanged.removeListener(handleStorageChange);
        }
      };
    }
  }, []);

  const platformLabel = getPlatformLabel(detectedPlatform);

  const handleAnalyzeClick = async (reviewsToAnalyze = scrapedReviews, scrapeMetadata = null) => {
    if (analysisStatus === 'analyzing') return;
    const analyzeStartedAt = performance.now();
    const analysisRevision = ++analysisRevisionRef.current;
    analysisResolvedPageKeyRef.current = activeContextRef.current.pageKey || getPageKey(
      detectedPlatform,
      scrapeMetadata?.url || activeTabUrlRef.current,
    );
    const analysisReviews = Array.isArray(reviewsToAnalyze) && reviewsToAnalyze.length > 0
      ? reviewsToAnalyze
      : scrapedReviews.length > 0 ? scrapedReviews : lastScrapedReviewsRef.current;
    const analysisPlatformLabel = scrapeMetadata?.platform
      ? getPlatformLabel(scrapeMetadata.platform)
      : platformLabel;
    setCurrentAnalysisRecord(null);
    setHasSavedAnalysis(false);
    setSaveAnalysisError('');
    setIsSavingAnalysis(false);
    setScrapedReviews(analysisReviews);
    setTopicAnalysis(null);
    setAnalysisStatus('analyzing');

    try {
      const reviewTexts = analysisReviews.map(getReviewText);
      if (reviewTexts.length === 0 || reviewTexts.some((review) => !review.trim())) {
        throw new Error('No usable review text was available for SVM analysis.');
      }

      const svmStartedAt = performance.now();
      console.log('[Analyze] SVM request start');
      const response = await fetch(SVM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviews: reviewTexts }),
      });
      const payload = await response.json();
      console.log(`[Analyze] SVM: ${Math.round(performance.now() - svmStartedAt)} ms`);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'SVM analysis failed.');
      }
      if (!Array.isArray(payload.predictions) ||
        payload.predictions.length !== analysisReviews.length ||
        payload.predictions.some((category) => !VALID_CATEGORIES.has(category))) {
        throw new Error('SVM returned an invalid Category prediction payload.');
      }
      if (analysisRevisionRef.current !== analysisRevision) return;

      const explanationResults = Array.isArray(payload.results) && payload.results.length === analysisReviews.length
        ? payload.results.map((result, index) => ({
            category: result?.category === payload.predictions[index]
              ? result.category
              : payload.predictions[index],
            emotionDrivers: Array.isArray(result?.emotionDrivers)
              ? result.emotionDrivers.filter((driver) => typeof driver === 'string')
              : [],
          }))
        : payload.predictions.map((category) => ({ category, emotionDrivers: [] }));
      const nextEmotionData = buildEmotionData(
        analysisReviews,
        payload.predictions,
        analysisPlatformLabel,
        null,
        ENABLE_TOPIC_ANALYSIS ? 'pending' : 'disabled',
        explanationResults,
      );
      setEmotionData(nextEmotionData);
      setAnalysisStatus('completed');
      setTimeout(() => {
        console.log(`[Analyze] UI render: ${Math.round(performance.now() - analyzeStartedAt)} ms`);
      }, 0);
      const record = {
        platform: analysisPlatformLabel,
        page_url: scrapeMetadata?.url || activeTabUrl || window.location.href,
        pageKey: getPageKey(
          scrapeMetadata?.platform || detectedPlatform || activeContextRef.current.platform,
          scrapeMetadata?.url || activeTabUrl || window.location.href,
        ),
        targetTitle: scrapeMetadata?.productTitle || scrapedProductTitle || 'Product Review',
        productTitle: scrapeMetadata?.productTitle || scrapedProductTitle || 'Product Review',
        dominantEmotion: nextEmotionData.dominantEmotion.label,
        percentage: `${nextEmotionData.dominantEmotion.percentage}%`,
        reviews: analysisReviews,
        reviewAnalysis: explanationResults.map((result, index) => ({
          review: analysisReviews[index],
          category: result.category,
          emotionDrivers: result.emotionDrivers,
        })),
        topicAnalysis: null,
        emotionData: nextEmotionData,
        rating: scrapeMetadata?.rating ?? scrapedRating,
        category: scrapeMetadata?.category ?? scrapedCategory,
        productImage: scrapeMetadata?.productImage ?? scrapedProductImage,
        timestamp: Date.now()
      };
      setCurrentAnalysisRecord(record);
      analysisResolvedPageKeyRef.current = record.pageKey;

      if (!ENABLE_TOPIC_ANALYSIS) {
        console.log('[Analyze] topics disabled by VITE_ENABLE_TOPIC_ANALYSIS=false');
        return;
      }

      const topicStartedAt = performance.now();
      console.log('[Analyze] topic request start');
      const topicAbortController = new AbortController();
      const topicTimeout = setTimeout(
        () => topicAbortController.abort(),
        getTopicRequestTimeoutMs(reviewTexts.length),
      );
      try {
        const topicPayload = await requestTopicAnalysis(
          reviewTexts,
          topicAbortController.signal,
          analysisPlatformLabel,
        );
        console.log(`[Analyze] Topics: ${Math.round(performance.now() - topicStartedAt)} ms`);
        if (analysisRevisionRef.current !== analysisRevision) return;

        const topicData = buildEmotionData(
          analysisReviews,
          payload.predictions,
          analysisPlatformLabel,
          topicPayload,
          'ready',
          explanationResults,
        );
        if (analysisRevisionRef.current !== analysisRevision) return;
        analysisRevisionRef.current += 1;
        analysisResolvedPageKeyRef.current = getPageKey(record.platform, record.page_url);
        setEmotionData(topicData);
        setTopicAnalysis(topicPayload);
        setCurrentAnalysisRecord({ ...record, topicAnalysis: topicPayload, emotionData: topicData });
        setHasSavedAnalysis(false);
      } catch (topicError) {
        if (analysisRevisionRef.current !== analysisRevision) return;
        console.warn('VoxReview: review topic analysis unavailable:', topicError);
        analysisRevisionRef.current += 1;
        analysisResolvedPageKeyRef.current = getPageKey(record.platform, record.page_url);
        setTopicAnalysis(null);
        const unavailableData = buildEmotionData(
          analysisReviews,
          payload.predictions,
          analysisPlatformLabel,
          null,
          'unavailable',
          explanationResults,
        );
        setEmotionData(unavailableData);
        setCurrentAnalysisRecord({ ...record, topicAnalysis: null, emotionData: unavailableData });
        setHasSavedAnalysis(false);
      } finally {
        clearTimeout(topicTimeout);
      }
    } catch (error) {
      if (analysisRevisionRef.current !== analysisRevision) return;
      console.error('VoxReview: SVM analysis failed:', error);
      analysisRevisionRef.current += 1;
      analysisResolvedPageKeyRef.current = null;
      setEmotionData(null);
      setTopicAnalysis(null);
      setCurrentAnalysisRecord(null);
      setHasSavedAnalysis(false);
      setAnalysisStatus('idle');
    }
  };

  const handleSavedAnalysisRefresh = async (savedItem, scrapeData) => {
    const savedReviews = Array.isArray(savedItem.reviews) ? savedItem.reviews : [];
    const fetchedReviews = Array.isArray(scrapeData.reviews) ? scrapeData.reviews : [];
    const newReviews = getNewReviews(savedReviews, fetchedReviews);
    const refreshedAt = Date.now();

    if (newReviews.length === 0) {
      const updatedRecord = await saveAnalysisForPage({
        ...savedItem,
        last_refreshed_at: refreshedAt,
      });
      if (!updatedRecord) throw new Error('Unable to update the saved refresh timestamp.');
      return {
        success: true,
        newReviewCount: 0,
        message: 'No new reviews found',
        record: updatedRecord,
      };
    }

    const savedQuotes = Array.isArray(savedItem.emotionData?.quotes)
      ? savedItem.emotionData.quotes
      : [];
    const storedReviewAnalysis = Array.isArray(savedItem.reviewAnalysis) &&
      savedItem.reviewAnalysis.length === savedReviews.length
      ? savedItem.reviewAnalysis
      : savedQuotes.length === savedReviews.length
        ? savedQuotes.map((quote, index) => ({
            review: savedReviews[index],
            category: quote.category ?? CATEGORY_BY_EMOTION_ID.get(quote.emotion?.toLowerCase()),
            emotionDrivers: [],
          }))
        : [];
    const savedReviewAnalysis = storedReviewAnalysis.map((analysis, index) => ({
      ...analysis,
      review: savedReviews[index],
      category: Number(analysis.category),
      emotionDrivers: Array.isArray(analysis.emotionDrivers) ? analysis.emotionDrivers : [],
    }));
    if (savedReviewAnalysis.length !== savedReviews.length ||
      savedReviewAnalysis.some((analysis) => !VALID_CATEGORIES.has(analysis.category))) {
      throw new Error('This saved analysis is missing per-review emotion results and cannot be incrementally refreshed.');
    }

    const hasSavedTopicResults = hasValidTopicAnalysis(savedItem.topicAnalysis, savedReviews);
    if (ENABLE_TOPIC_ANALYSIS && savedReviews.length > 0 && !hasSavedTopicResults) {
      throw new Error('This saved analysis is missing per-review topic results and cannot be incrementally refreshed.');
    }

    const newReviewTexts = newReviews.map(getReviewText);
    if (newReviewTexts.some((text) => !text.trim())) {
      throw new Error('A newly fetched review did not contain usable review text.');
    }

    const svmResponse = await fetch(SVM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviews: newReviewTexts }),
    });
    const svmPayload = await svmResponse.json();
    if (!svmResponse.ok || !svmPayload.success || !Array.isArray(svmPayload.predictions) ||
      svmPayload.predictions.length !== newReviews.length ||
      svmPayload.predictions.some((category) => !VALID_CATEGORIES.has(category))) {
      throw new Error(svmPayload.error || 'SVM analysis failed for new reviews.');
    }

    const newExplanationResults = Array.isArray(svmPayload.results) &&
      svmPayload.results.length === newReviews.length
      ? svmPayload.results.map((result, index) => ({
          category: result?.category === svmPayload.predictions[index]
            ? result.category
            : svmPayload.predictions[index],
          emotionDrivers: Array.isArray(result?.emotionDrivers)
            ? result.emotionDrivers.filter((driver) => typeof driver === 'string')
            : [],
        }))
      : svmPayload.predictions.map((category) => ({ category, emotionDrivers: [] }));

    let newTopicPayload = null;
    if (ENABLE_TOPIC_ANALYSIS) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        getTopicRequestTimeoutMs(newReviewTexts.length),
      );
      try {
        newTopicPayload = await requestTopicAnalysis(
          newReviewTexts,
          controller.signal,
          getPlatformLabel(savedItem.platform || scrapeData.platform),
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    const newEmotionData = buildEmotionData(
      newReviews,
      svmPayload.predictions,
      getPlatformLabel(savedItem.platform || scrapeData.platform),
      newTopicPayload,
      ENABLE_TOPIC_ANALYSIS ? 'ready' : 'disabled',
      newExplanationResults,
    );
    const combinedReviews = [...savedReviews, ...newReviews];
    const combinedReviewAnalysis = [...savedReviewAnalysis, ...newExplanationResults.map((result, index) => ({
      review: newReviews[index],
      category: result.category,
      emotionDrivers: result.emotionDrivers,
    }))];
    const combinedPredictions = combinedReviewAnalysis.map((result) => result.category);
    const combinedTopicResults = [
      ...(hasSavedTopicResults
        ? savedItem.topicAnalysis.results.map((result, index) => ({ ...result, reviewIndex: index }))
        : savedReviews.map((_, index) => ({ reviewIndex: index, topics: [] }))),
      ...(newTopicPayload?.results || newReviews.map((_, index) => ({
        reviewIndex: savedReviews.length + index,
        topics: [],
      }))).map((result, index) => ({ ...result, reviewIndex: savedReviews.length + index })),
    ];
    const combinedTopicAnalysis = ENABLE_TOPIC_ANALYSIS || hasSavedTopicResults
      ? {
          ...(savedItem.topicAnalysis || {}),
          ...(newTopicPayload || {}),
          model: newTopicPayload?.model || savedItem.topicAnalysis?.model || null,
          threshold: newTopicPayload?.threshold ?? savedItem.topicAnalysis?.threshold ?? null,
          results: combinedTopicResults,
        }
      : null;
    const counts = combinedPredictions.reduce((result, category) => {
      result[category] += 1;
      return result;
    }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
    const totalReviews = combinedReviews.length;
    const dominantCategory = Number(Object.keys(counts).sort((first, second) => counts[second] - counts[first])[0]);
    const dominantDisplay = CATEGORY_DISPLAY[dominantCategory];
    const emotions = Object.entries(CATEGORY_DISPLAY).map(([category, display]) => ({
      id: display.label.toLowerCase(),
      category: Number(category),
      label: display.label,
      emoji: display.emoji,
      percentage: totalReviews ? Math.round((counts[category] / totalReviews) * 100) : 0,
      count: counts[category],
      confidence: 'SVM',
      keywords: getSvmEmotionKeywords(combinedReviewAnalysis, Number(category)),
      color: display.color,
    }));
    const combinedTopicReviews = combinedReviews.map((review, topicResultIndex) => ({
      review,
      category: combinedPredictions[topicResultIndex],
      topicResultIndex,
    }));
    const combinedQuotes = [
      ...savedReviews.map((review, index) => {
        const existingQuote = savedQuotes[index] || {};
        const category = combinedPredictions[index];
        const display = CATEGORY_DISPLAY[category];
        return {
          ...existingQuote,
          id: existingQuote.id ?? review?.id ?? index + 1,
          topicResultIndex: index,
          category,
          emotion: display.label,
          emoji: display.emoji,
          driver: existingQuote.driver || `${savedItem.platform || 'Current Source'} Review`,
          text: getReviewText(review),
          author: existingQuote.author || getReviewerName(review, savedItem.platform),
          date: existingQuote.date || review?.date || review?.reviewDate || '',
          rating: review?.rating ?? existingQuote.rating ?? null,
          helpfulCount: review?.helpfulCount ?? existingQuote.helpfulCount ?? null,
          priority: existingQuote.priority ?? savedItem.priorityResults?.[index] ?? null,
        };
      }),
      ...newEmotionData.quotes.map((quote, index) => ({
        ...quote,
        id: savedReviews.length + index + 1,
        topicResultIndex: savedReviews.length + index,
      })),
    ];
    const mergedEmotionData = {
      totalReviews,
      dominantEmotion: {
        label: dominantDisplay.label,
        emoji: dominantDisplay.emoji,
        percentage: totalReviews ? Math.round((counts[dominantCategory] / totalReviews) * 100) : 0,
        confidence: 'SVM',
      },
      emotions,
      topics: combinedTopicAnalysis
        ? aggregateTopicsForReviews(combinedTopicReviews, combinedTopicAnalysis)
        : [],
      topicStatus: ENABLE_TOPIC_ANALYSIS
        ? 'ready'
        : combinedTopicAnalysis ? (savedItem.emotionData?.topicStatus || 'ready') : 'disabled',
      topicModel: combinedTopicAnalysis?.model || null,
      topicThreshold: combinedTopicAnalysis?.threshold ?? null,
      quotes: combinedQuotes,
    };
    const pageKey = getPageKey(savedItem.platform, savedItem.page_url) || savedItem.pageKey;
    const mergedRecord = await saveAnalysisForPage({
      ...savedItem,
      id: savedItem.id,
      pageKey,
      reviews: combinedReviews,
      reviewCount: combinedReviews.length,
      reviewAnalysis: combinedReviewAnalysis,
      topicAnalysis: combinedTopicAnalysis,
      emotionData: mergedEmotionData,
      dominantEmotion: mergedEmotionData.dominantEmotion.label,
      percentage: `${mergedEmotionData.dominantEmotion.percentage}%`,
      priorityResults: combinedQuotes.map((quote) => quote.priority).filter(Boolean),
      timestamp: refreshedAt,
      last_refreshed_at: refreshedAt,
    });
    if (!mergedRecord) throw new Error('Unable to update the existing saved analysis.');

    if (activeContextRef.current.pageKey === pageKey) {
      analysisResolvedPageKeyRef.current = pageKey;
      setCurrentAnalysisRecord(mergedRecord);
      setEmotionData(mergedEmotionData);
      setTopicAnalysis(combinedTopicAnalysis);
      setScrapedReviews(combinedReviews);
      lastScrapedReviewsRef.current = combinedReviews;
      setAnalysisStatus('completed');
      setHasSavedAnalysis(true);
    }

    return {
      success: true,
      newReviewCount: newReviews.length,
      message: `${newReviews.length} new reviews added`,
      record: mergedRecord,
    };
  };

  const handleSaveAnalysis = async () => {
    if (!currentAnalysisRecord || isSavingAnalysis || hasSavedAnalysis) return false;
    setIsSavingAnalysis(true);
    setSaveAnalysisError('');
    const saveRevision = analysisRevisionRef.current;
    try {
      const pageKey = getPageKey(
        activeContextRef.current.platform || detectedPlatform,
        currentAnalysisRecord.page_url,
      ) || currentAnalysisRecord.pageKey;
      if (!pageKey) throw new Error('Unable to identify this page for saving.');
      const recordToSave = {
        ...currentAnalysisRecord,
        pageKey,
        reviews: currentAnalysisRecord.reviews || scrapedReviews,
        emotionData: emotionData || currentAnalysisRecord.emotionData,
        topicAnalysis,
        priorityResults: (emotionData?.quotes || currentAnalysisRecord.emotionData?.quotes || [])
          .map((quote) => quote.priority)
          .filter(Boolean),
      };
      const savedRecord = await saveAnalysisForPage(recordToSave);
      if (!savedRecord) throw new Error('The current analysis could not be saved.');
      if (analysisRevisionRef.current === saveRevision) {
        setCurrentAnalysisRecord(savedRecord);
        setHasSavedAnalysis(true);
      }
      getSavedAnalysisCount().then(setSavedAnalysisCount).catch((error) => {
        if (import.meta.env.DEV) console.error('VoxReview: Could not refresh saved count after save:', error);
      });
      return true;
    } catch (error) {
      if (import.meta.env.DEV) console.error('VoxReview: Could not save analysis:', error);
      if (analysisRevisionRef.current === saveRevision) {
        setSaveAnalysisError('Unable to save this analysis. Please try again.');
      }
      return false;
    } finally {
      if (analysisRevisionRef.current === saveRevision) setIsSavingAnalysis(false);
    }
  };

  const handleClearAnalysis = () => {
    analysisRevisionRef.current += 1;
    analysisResolvedPageKeyRef.current = null;
    rescanAnalysisPendingRef.current = null;
    ignoreAutomaticScrapesRef.current = true;
    if (rescanTimeoutRef.current) clearTimeout(rescanTimeoutRef.current);
    rescanTimeoutRef.current = null;
    pendingScrapeDataRef.current = null;
    setIsRescanning(false);
    setEmotionData(null);
    setTopicAnalysis(null);
    setCurrentAnalysisRecord(null);
    setHasSavedAnalysis(false);
    setSaveAnalysisError('');
    setIsSavingAnalysis(false);
    setScrapedReviews([]);
    // Keep the last same-page scrape only as an in-memory source for Analyze Again.
    setScrapedHasError(false);
    setScrapedErrorMessage('');
    setAnalysisStatus('idle');
    setAnalysisViewRevision((revision) => revision + 1);
  };

  // Log in / Sign up redirects to the existing Web Application authentication routes
  const handleOpenLogin = () => openWebAppAuth('/login');
  const handleOpenRegister = () => openWebAppAuth('/register');

  // Logout clears session and notifies extension to return to Guest Mode
  const handleLogout = () => {
    setShowLogoutConfirmation(true);
  };

  const confirmLogout = async () => {
    await authService.logout();
    setCurrentUser(null);
    setAuthToastMessage('');
    setShowLogoutConfirmation(false);
  };

  const handleSelectSavedItem = (item) => {
    if (!item) return;
    analysisRevisionRef.current += 1;
    const platformFromUrl = detectPlatformFromUrl(item.page_url || '');
    const restoredPlatform = platformFromUrl !== 'unknown'
      ? platformFromUrl
      : String(item.platform || '').toLowerCase().replace('google reviews', 'google').replace('google maps', 'google').replace('google play', 'googleplay');
    const pageKey = getPageKey(restoredPlatform, item.page_url) || item.pageKey;
    const savedReviews = Array.isArray(item.reviews) ? item.reviews : [];
    const savedTopics = item.topicAnalysis;
    const hasSavedTopicResults = hasValidTopicAnalysis(savedTopics, savedReviews.length);
    const savedReviewAnalysis = Array.isArray(item.reviewAnalysis) ? item.reviewAnalysis : [];
    const quotes = savedReviewAnalysis.length === savedReviews.length
      ? savedReviewAnalysis.map((analysis, index) => {
          const review = savedReviews[index] ?? analysis.review;
          const category = analysis.category;
          const display = CATEGORY_DISPLAY[category];
          return {
            id: review?.id ?? review?.reviewId ?? index + 1,
            topicResultIndex: index,
            category,
            emotion: display?.label || 'Pending',
            emoji: display?.emoji || '💬',
            driver: `${item.platform || 'Current Source'} Review`,
            text: getReviewText(review),
            author: getReviewerName(review, item.platform),
            rating: review?.rating ?? null,
          };
        })
      : (item.emotionData?.quotes || []).map((quote, index) => ({
          ...quote,
          id: quote.id ?? index + 1,
          topicResultIndex: index,
          category: quote.category ?? CATEGORY_BY_EMOTION_ID.get(quote.emotion?.toLowerCase()),
          rating: savedReviews[index]?.rating ?? quote.rating ?? null,
        }));
    const restoredEmotionData = item.emotionData
      ? {
          ...item.emotionData,
          quotes: attachReviewPriorities(quotes, hasSavedTopicResults ? savedTopics : null),
          topicStatus: hasSavedTopicResults
            ? 'ready'
            : !ENABLE_TOPIC_ANALYSIS ? 'disabled' : savedReviews.length > 0 ? 'pending' : 'not-analyzed',
        }
      : null;

    setActiveTab('analyze');
    activeContextRef.current = {
      tabId: item.tabId ?? null,
      url: item.page_url || '',
      platform: restoredPlatform,
      pageKey,
      generation: activeContextRef.current.generation + 1,
      isResolved: true,
    };
    activeTabUrlRef.current = item.page_url || '';
    setActiveTabUrl(item.page_url || '');
    setHasResolvedActiveTab(true);
    setDetectedPlatform(restoredPlatform);
    setScrapedIsProductPage(savedReviews.length > 0);
    setScrapedReviews(savedReviews);
    lastScrapedReviewsRef.current = savedReviews;
    setScrapedProductTitle(item.productTitle || item.targetTitle || null);
    setScrapedCategory(item.category ?? null);
    setScrapedRating(item.rating ?? null);
    setScrapedProductImage(item.productImage ?? null);
    setScrapedHasError(false);
    setScrapedErrorMessage('');
    setEmotionData(restoredEmotionData);
    setTopicAnalysis(hasSavedTopicResults ? savedTopics : null);
    setCurrentAnalysisRecord({ ...item, pageKey, emotionData: restoredEmotionData });
    setHasSavedAnalysis(hasSavedTopicResults || !ENABLE_TOPIC_ANALYSIS);
    setSaveAnalysisError('');
    setIsSavingAnalysis(false);
    setAnalysisStatus(restoredEmotionData ? 'completed' : 'idle');
    analysisResolvedPageKeyRef.current = pageKey;
    setAnalysisViewRevision((revision) => revision + 1);

    if (ENABLE_TOPIC_ANALYSIS && !hasSavedTopicResults && savedReviews.length > 0) {
      const reviewTexts = savedReviews.map(getReviewText);
      if (reviewTexts.every((text) => text.trim())) {
        const topicRevision = analysisRevisionRef.current;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), getTopicRequestTimeoutMs(reviewTexts.length));
        void requestTopicAnalysis(reviewTexts, controller.signal, getPlatformLabel(restoredPlatform))
          .then((topicPayload) => {
            if (analysisRevisionRef.current !== topicRevision) return;
            const updatedEmotionData = {
              ...restoredEmotionData,
              quotes: attachReviewPriorities(restoredEmotionData.quotes, topicPayload),
              topics: aggregateTopicsForReviews(
                savedReviews.map((review, topicResultIndex) => ({ review, topicResultIndex })),
                topicPayload,
              ),
              topicStatus: 'ready',
              topicModel: topicPayload.model || null,
              topicThreshold: topicPayload.threshold ?? null,
            };
            setEmotionData(updatedEmotionData);
            setTopicAnalysis(topicPayload);
            setCurrentAnalysisRecord((currentRecord) => currentRecord
              ? { ...currentRecord, topicAnalysis: topicPayload, emotionData: updatedEmotionData }
              : currentRecord);
          })
          .catch((error) => {
            if (analysisRevisionRef.current !== topicRevision) return;
            if (import.meta.env.DEV) console.error('VoxReview: Could not restore missing topic results:', error);
            setEmotionData((currentData) => currentData ? { ...currentData, topicStatus: 'unavailable' } : currentData);
          })
          .finally(() => clearTimeout(timeout));
      }
    }
  };

  const handleRescanPage = async (savedItem = null) => {
    if (isRescanning) return false;
    setIsRescanning(true);
    let resolveRefresh;
    const refreshCompletion = savedItem
      ? new Promise((resolve) => { resolveRefresh = resolve; })
      : null;

    try {
      let activeTabObj;
      if (savedItem?.page_url && typeof chrome !== 'undefined' && chrome.tabs?.query) {
        const tabs = await new Promise((resolve) => chrome.tabs.query({}, (result) => resolve(result || [])));
        const savedPageKey = getPageKey(savedItem.platform, savedItem.page_url) || savedItem.pageKey;
        activeTabObj = tabs.find((tab) => tab.id != null && tab.url &&
          getPageKey(detectPlatformFromUrl(tab.url), tab.url) === savedPageKey);
        if (!activeTabObj) {
          setIsRescanning(false);
          return false;
        }
      } else {
        activeTabObj = await resolveCurrentActiveTab();
      }

      if (!activeTabObj?.id) throw new Error('No active browser tab found.');
      const currentUrl = activeTabObj.url || activeTabUrlRef.current;
      if (!currentUrl) throw new Error('Unable to determine the current browser page.');

      const platform = detectPlatformFromUrl(currentUrl);
      const pageKey = getPageKey(platform, currentUrl);
      const requestId = `rescan-${Date.now()}-${++rescanRequestCounterRef.current}`;
      const previousContext = activeContextRef.current;
      const generation = previousContext.generation + 1;
      console.log('[RESCAN] clicked', { tabId: activeTabObj.id, url: currentUrl, platform });

      analysisRevisionRef.current += 1;
      analysisResolvedPageKeyRef.current = null;
      pendingScrapeDataRef.current = null;
      rescanAnalysisPendingRef.current = null;
      if (rescanTimeoutRef.current) clearTimeout(rescanTimeoutRef.current);
      activeContextRef.current = {
        tabId: activeTabObj.id,
        url: currentUrl,
        platform,
        pageKey,
        generation,
        isResolved: true,
      };
      activeTabUrlRef.current = currentUrl;
      setActiveTabUrl(currentUrl);
      setHasResolvedActiveTab(true);
      if (!savedItem) {
        setAnalysisStatus('idle');
        setEmotionData(null);
        setTopicAnalysis(null);
        setCurrentAnalysisRecord(null);
        setHasSavedAnalysis(false);
        setSaveAnalysisError('');
        setIsSavingAnalysis(false);
        setScrapedReviews([]);
        lastScrapedReviewsRef.current = [];
        setScrapedProductTitle(null);
        setScrapedCategory(null);
        setScrapedRating(null);
        setScrapedProductImage(null);
        setScrapedHasError(false);
        setScrapedErrorMessage('');
        setAnalysisViewRevision((revision) => revision + 1);
      }

      if (platform === 'unknown') {
        ignoreAutomaticScrapesRef.current = false;
        setDetectedPlatform('');
        setScrapedIsProductPage(false);
        setIsRescanning(false);
        return savedItem ? false : true;
      }

      setDetectedPlatform(platform);
      setScrapedIsProductPage(true);
      ignoreAutomaticScrapesRef.current = false;
      rescanAnalysisPendingRef.current = {
        pageKey,
        tabId: activeTabObj.id,
        requestId,
        startedAt: Date.now(),
        savedItem,
        resolveRefresh,
      };
      rescanTimeoutRef.current = setTimeout(() => {
        const pending = rescanAnalysisPendingRef.current;
        if (pending?.pageKey !== pageKey) return;
        rescanAnalysisPendingRef.current = null;
        rescanTimeoutRef.current = null;
        ignoreAutomaticScrapesRef.current = true;
        setIsRescanning(false);
        setScrapedHasError(true);
        setScrapedErrorMessage('Rescan did not return fresh data from this page. Try again.');
        pending.resolveRefresh?.({ success: false, error: 'Rescan did not return fresh data from this page. Try again.' });
      }, 30000);

      chrome.runtime.sendMessage(
        { type: 'rescanPage', tabId: activeTabObj.id, url: currentUrl, platform, requestId },
        (response) => {
          if (chrome.runtime?.lastError || response?.ok === false) {
            const reason = chrome.runtime?.lastError?.message || response?.reason || 'Unable to rescan this page.';
            const pending = rescanAnalysisPendingRef.current;
            if (pending?.pageKey === pageKey) {
              rescanAnalysisPendingRef.current = null;
              ignoreAutomaticScrapesRef.current = true;
              if (rescanTimeoutRef.current) clearTimeout(rescanTimeoutRef.current);
              rescanTimeoutRef.current = null;
              setIsRescanning(false);
              setScrapedHasError(true);
              setScrapedErrorMessage(reason);
              pending.resolveRefresh?.({ success: false, error: reason });
            }
          }
        },
      );
      return refreshCompletion || true;
    } catch (error) {
      if (import.meta.env.DEV) console.error('VoxReview: Error during rescan:', error);
      rescanAnalysisPendingRef.current = null;
      ignoreAutomaticScrapesRef.current = true;
      if (rescanTimeoutRef.current) clearTimeout(rescanTimeoutRef.current);
      rescanTimeoutRef.current = null;
      setIsRescanning(false);
      setScrapedHasError(true);
      setScrapedErrorMessage(error.message || 'Unable to rescan this page.');
      return false;
    }
  };

  const availableReviewCount = scrapedReviews.length || lastScrapedReviewsRef.current.length;
  const hasReviewsForAnalysis = scrapedReviews.length > 0 || lastScrapedReviewsRef.current.length > 0;

  return (
    <div className="popup-standalone-page">
      <div className="popup-root">
        {/* Extension Header */}
        <Header
          isLoggedIn={isLoggedIn}
          userName={currentUser?.username || currentUser?.name}
          onLogout={handleLogout}
          onLoginClick={handleOpenLogin}
        />

        {/* Guest Notice Bar */}
        {!isLoggedIn && (
          <div className="popup-guest-bar">
            <span>Guest Mode — AI Analysis Active</span>
            <button onClick={handleOpenLogin}>Sign In to Save</button>
          </div>
        )}

        {/* Signed In Success Notification Toast */}
        {authToastMessage && (
          <div className="popup-auth-toast">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{authToastMessage}</span>
          </div>
        )}

        {/* Main Scroll Area */}
        <div className="popup-stage">
          {activeTab === 'analyze' && (
            <>
              {/* ── 1. Website Not Supported (FIRST CHECK) ── */}
              {isSiteUnsupported ? (
                <UnsupportedSiteView
                  onRescan={handleRescanPage}
                  isRescanning={isRescanning}
                />
              ) : scrapedHasError ? (
                /* ── 2. Scraper Error / Exception ── */
                <div className="no-reviews-view">
                  <div className="no-reviews-icon-ring" style={{ background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.3)' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <h2 className="no-reviews-title" style={{ color: '#EF4444' }}>Extraction Warning / Error</h2>
                  <p className="no-reviews-body">
                    {scrapedErrorMessage || 'An error occurred while attempting to extract reviews from this page.'}
                  </p>
                  <button
                    className={`no-reviews-rescan-btn ${isRescanning ? 'rescanning' : ''}`}
                    onClick={handleRescanPage}
                    disabled={isRescanning}
                  >
                    <span>{isRescanning ? 'Scanning Page…' : 'Retry Extraction'}</span>
                  </button>
                </div>
              ) : /* ── 3. Supported site, but No Product Reviews / Non-product page ── */
              !scrapedIsProductPage || !hasReviewsForAnalysis ? (
                <NoReviewsView
                  platform={detectedPlatform}
                  isProductPage={scrapedIsProductPage}
                  productTitle={scrapedProductTitle}
                  onRescan={handleRescanPage}
                  isRescanning={isRescanning}
                />
              ) : (
                /* ── 3. Supported site + Product Page with customer reviews ── */
                <>
                  <DetectedPageCard
                    platform={detectedPlatform}
                    pageTitle={scrapedProductTitle || 'Detecting Product...'}
                    category={scrapedCategory || 'Product Reviews'}
                    rating={scrapedRating ? String(scrapedRating) : null}
                    productImage={scrapedProductImage}
                    reviewsCount={String(availableReviewCount)}
                    status={analysisStatus}
                  />

                  <div className="action-controls-container">
                    <button
                      className="analyze-main-btn"
                      onClick={handleAnalyzeClick}
                      disabled={analysisStatus === 'analyzing'}
                    >
                      {analysisStatus === 'analyzing' ? (
                        <>
                          <svg className="analyze-btn-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="2" x2="12" y2="6" />
                            <line x1="12" y1="18" x2="12" y2="22" />
                            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                            <line x1="2" y1="12" x2="6" y2="12" />
                            <line x1="18" y1="12" x2="22" y2="12" />
                            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                          </svg>
                          <span>Evaluating Reviews...</span>
                        </>
                      ) : analysisStatus === 'completed' ? (
                        <>
                          <svg className="analyze-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Analyze Again</span>
                        </>
                      ) : (
                        <>
                          <svg className="analyze-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <span>Analyze Reviews</span>
                        </>
                      )}
                    </button>

                    <div className="secondary-toolbar">
                      <div className="detected-platform-pill">
                        <span className="platform-active-dot">●</span>
                        <span>Detected: <strong>{platformLabel}</strong></span>
                      </div>
                      <button
                        className={`rescan-btn${isRescanning ? ' rescan-btn--scanning' : ''}`}
                        onClick={handleRescanPage}
                        disabled={isRescanning}
                        title="Re-run the scraper on this page without reloading"
                      >
                        <svg className={`rescan-icon${isRescanning ? ' spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" />
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                        <span>{isRescanning ? 'Scanning…' : 'Rescan'}</span>
                      </button>
                    </div>
                  </div>

                  <AnalysisResults
                    key={analysisViewRevision}
                    status={analysisStatus}
                    isLoggedIn={isLoggedIn}
                    onSaveAnalysis={handleSaveAnalysis}
                    isSaving={isSavingAnalysis}
                    hasSavedAnalysis={hasSavedAnalysis}
                    saveError={saveAnalysisError}
                    emotionData={emotionData}
                    topicAnalysis={topicAnalysis}
                    scrapedReviews={scrapedReviews}
                    onSaveRedirect={handleOpenLogin}
                    onClearAnalysis={handleClearAnalysis}
                    platform={detectedPlatform}
                  />
                </>
              )}
            </>
          )}

          {activeTab === 'saved' && (
            <SavedAnalysesView
              isLoggedIn={isLoggedIn}
              onLoginClick={handleOpenLogin}
              onSelectSaved={handleSelectSavedItem}
              onRefreshSaved={handleRescanPage}
              onSavedCountChange={setSavedAnalysisCount}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              isLoggedIn={isLoggedIn}
              currentUser={currentUser}
              onLoginClick={handleOpenLogin}
              onRegisterClick={handleOpenRegister}
              onLogout={handleLogout}
              onProfileUpdated={setCurrentUser}
              theme={theme}
              onThemeToggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            />
          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} savedCount={savedAnalysisCount} />
      </div>
      {showLogoutConfirmation && (
        <LogoutConfirmationModalExtension
          onCancel={() => setShowLogoutConfirmation(false)}
          onConfirm={confirmLogout}
        />
      )}
    </div>
  );
}
