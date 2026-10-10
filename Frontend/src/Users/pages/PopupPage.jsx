import { useState, useEffect, useRef, useCallback } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import authService, { openWebAppAuth } from '../../services/authService.js';
import { shouldRefreshProfileForAuthChange } from '../../services/userProfileSync.js';
import { getAnalysisForPage, getSavedAnalysisCount, saveAnalysisForPage, getPageKey } from '../../services/pageAnalysisStorage.js';
import {
  ACTIVE_ANALYSIS_STORAGE_KEY,
  deleteActiveAnalysisForPage,
  getActiveAnalysisReviewSetSignature,
  getActiveAnalysisForPage,
  getMatchingSavedTopicResult,
  isMatchingActiveAnalysisIdentity,
  setActiveAnalysisState,
} from '../../services/activeAnalysisState.js';
import Header from '../components/Header.jsx';
import DetectedPageCard from '../components/DetectedPageCard.jsx';
import AnalysisResults from '../components/AnalysisResults.jsx';
import SavedAnalysesView from '../components/SavedAnalysesView.jsx';
import ProfileView from '../components/ProfileView.jsx';
import BottomNavBar from '../components/BottomNavBar.jsx';
import UnsupportedSiteView from '../components/UnsupportedSiteView.jsx';
import NoReviewsView from '../components/NoReviewsView.jsx';
import PlatformUnavailableView from '../components/PlatformUnavailableView.jsx';
import LogoutConfirmationModalExtension from '../components/LogoutConfirmationModalExtension.jsx';
import UnsavedChangesConfirmationModal from '../components/UnsavedChangesConfirmationModal.jsx';
import {
  aggregateTopicsForReviews,
  getReviewId,
  getReviewText,
  getTopicKeywordCandidates,
  getTopicKeywordDiagnostics,
} from '../utils/reviewTopics.js';
import { getNewReviews } from '../utils/savedAnalysisRefresh.js';
import { attachReviewPriorities } from '../utils/priorityEngine.js';
import { getSvmEmotionKeywords } from '../utils/emotionDrivers.js';
import { clearPopupAuthState } from '../utils/popupAuthSession.js';
import { isMatchingRescanScrape } from '../utils/analysisScrapeState.js';
import { requestSvmBatch } from '../utils/svmRequest.js';
import { createPlatformAvailabilityChecker } from '../utils/platformAvailability.js';
import {
  createTopicAnalysisRequestCoordinator,
  getTopicReviewSetSignature,
  createTopicRequestTimeout,
  requestTopicAnalysis as sendTopicAnalysisRequest,
} from '../utils/topicAnalysisRequest.js';
import { createUnsavedChangesGuard } from '../utils/unsavedChangesGuard.js';
import '../css/PopupPage.css';

const ENABLE_TOPIC_ANALYSIS = import.meta.env.VITE_ENABLE_TOPIC_ANALYSIS !== 'false';
const platformAvailabilityChecker = createPlatformAvailabilityChecker();
const VALID_CATEGORIES = new Set([1, 2, 3, 4, 5, 6]);
const popupTopicRequests = createTopicAnalysisRequestCoordinator({
  request: (reviews, platform, options) => sendTopicAnalysisRequest(reviews, platform, options),
});
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

function hasValidTopicKeywordScores(payload, expectedCandidateCount) {
  return Array.isArray(payload?.results) &&
    payload.results.length === expectedCandidateCount &&
    payload.results.every((result, index) => (
      result?.reviewIndex === index &&
      Array.isArray(result?.topicScores) &&
      result.topicScores.length === VALID_TOPIC_LABELS.size &&
      new Set(result.topicScores.map((topic) => topic?.label)).size === VALID_TOPIC_LABELS.size &&
      result.topicScores.every((topic) => (
        VALID_TOPIC_LABELS.has(topic?.label) &&
        typeof topic.score === 'number' &&
        Number.isFinite(topic.score)
      ))
    ));
}

async function requestTopicAnalysis(
  reviewTexts,
  signal,
  platform,
  requestContext,
  pageKey,
  force = false,
  operation = 'classify',
) {
  if (pageKey && globalThis.chrome?.runtime?.sendMessage && globalThis.chrome?.storage?.local) {
    const response = await new Promise((resolve, reject) => {
      globalThis.chrome.runtime.sendMessage({
        type: 'requestTopicAnalysis',
        request: {
          reviews: reviewTexts,
          platform,
          pageKey,
          requestContext,
          force,
          operation,
        },
      }, (result) => {
        if (globalThis.chrome.runtime.lastError) reject(new Error(globalThis.chrome.runtime.lastError.message));
        else resolve(result);
      });
    });
    if (!response?.ok) {
      const error = new Error(response?.error || 'Topic analysis failed.');
      error.httpStatus = response?.httpStatus ?? null;
      error.code = response?.code || null;
      throw error;
    }
    return response.result;
  }
  if (!pageKey) {
    return sendTopicAnalysisRequest(reviewTexts, platform, {
      signal,
      requestContext,
      operation,
    });
  }
  return popupTopicRequests.request(reviewTexts, platform, {
    pageKey,
    requestContext,
    operation,
    signal,
    force,
  });
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

function getAvailabilityPlatformKey(platform) {
  const normalized = String(platform || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return ({
    googlemaps: 'google',
    googlereviews: 'google',
    googleplaystore: 'googleplay',
    googleplay: 'googleplay',
    shopee: 'shopee',
    lazada: 'lazada',
    steam: 'steam',
  })[normalized] || null;
}

function getPlatformDisplayName(platform) {
  const names = {
    google: 'Google Maps',
    googleplay: 'Google Play Store',
    lazada: 'Lazada',
    shopee: 'Shopee',
    steam: 'Steam',
  };
  return names[getAvailabilityPlatformKey(platform)] || getPlatformLabel(platform);
}

function isPlatformDisabledError(error) {
  return error?.code === 'PLATFORM_DISABLED' ||
    /PLATFORM_DISABLED|analysis for this platform is currently disabled/i.test(error?.message || '');
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
    model: 'SVM',
    keywords: getSvmEmotionKeywords(explanationResults, Number(category), reviews),
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
      id: getReviewId(review, index),
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
      model: 'SVM',
    },
    emotions,
    topics,
    topicStatus,
    topicModel: topicResponse?.model || null,
    topicThreshold: topicResponse?.threshold ?? null,
    quotes: attachReviewPriorities(quotes, topicResponse),
  };
}

function buildActiveAnalysisView(activeState) {
  const reviews = Array.isArray(activeState?.reviews) ? activeState.reviews : [];
  const predictions = activeState?.svmResult?.predictions;
  if (!Array.isArray(predictions) || predictions.length !== reviews.length) {
    return { record: activeState, emotionData: null, topicAnalysis: null };
  }

  const explanationResults = Array.isArray(activeState.svmResult.results) &&
    activeState.svmResult.results.length === reviews.length
    ? activeState.svmResult.results.map((result, index) => ({
        category: result?.category === predictions[index] ? result.category : predictions[index],
        emotionDrivers: Array.isArray(result?.emotionDrivers)
          ? result.emotionDrivers.filter((driver) => typeof driver === 'string')
          : [],
        contextualResolution: typeof result?.contextualResolution?.explanation === 'string'
          ? result.contextualResolution
          : null,
      }))
    : predictions.map((category) => ({ category, emotionDrivers: [], contextualResolution: null }));
  const platform = getPlatformLabel(activeState.platform);
  const topicAnalysis = hasValidTopicAnalysis(activeState.topicResult, reviews.length)
    ? activeState.topicResult
    : null;
  const topicStatus = topicAnalysis
    ? 'ready'
    : activeState.topicError ? 'unavailable' : ENABLE_TOPIC_ANALYSIS ? 'pending' : 'disabled';
  const emotionData = buildEmotionData(reviews, predictions, platform, topicAnalysis, topicStatus, explanationResults);
  const reviewAnalysis = explanationResults.map((result, index) => ({
    review: reviews[index],
    category: result.category,
    emotionDrivers: result.emotionDrivers,
    contextualResolution: result.contextualResolution,
  }));
  const record = {
    ...activeState,
    platform,
    page_url: activeState.page_url,
    pageKey: activeState.pageKey || getPageKey(activeState.platform, activeState.page_url),
    productTitle: activeState.productTitle || activeState.targetTitle || 'Product Review',
    targetTitle: activeState.targetTitle || activeState.productTitle || 'Product Review',
    reviewAnalysis,
    topicAnalysis,
    emotionData,
  };
  return { record, emotionData, topicAnalysis };
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
  const [savedProfile, setSavedProfile] = useState(() => authService.getCurrentUser());
  const setAuthenticatedUser = (user) => {
    setCurrentUser(user);
    setSavedProfile(user);
  };
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const [showUnsavedChangesConfirmation, setShowUnsavedChangesConfirmation] = useState(false);
  const isLoggedIn = !!currentUser;

  const [theme, setTheme] = useState(() => localStorage.getItem('voxreview-theme') || 'light');
  const [authToastMessage, setAuthToastMessage] = useState('');
  const [activeTab, setActiveTab] = useState('analyze');
  const [platformAvailability, setPlatformAvailability] = useState({
    platform: null,
    name: '',
    status: 'checking',
  });
  const [isPlatformAvailabilityChecking, setIsPlatformAvailabilityChecking] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [emotionData, setEmotionData] = useState(null);
  const [topicAnalysis, setTopicAnalysis] = useState(null);
  const [currentAnalysisRecord, setCurrentAnalysisRecord] = useState(null);
  const emotionDataRef = useRef(emotionData);
  const topicAnalysisRef = useRef(topicAnalysis);
  const currentAnalysisRecordRef = useRef(currentAnalysisRecord);
  emotionDataRef.current = emotionData;
  topicAnalysisRef.current = topicAnalysis;
  currentAnalysisRecordRef.current = currentAnalysisRecord;
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
  const topicKeywordScoringRef = useRef(0);

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
  const lastAuthUserIdRef = useRef(null);
  const profileRefreshRef = useRef({ userId: null, promise: null });
  const availabilityRequestRef = useRef(0);
  const topicRetryKeysRef = useRef(new Set());
  const previousNonAnalyzeTabRef = useRef('saved');
  const discardProfileDraftRef = useRef(null);
  const isProfileDirtyRef = useRef(false);
  const leaveGuardRef = useRef(null);
  if (!leaveGuardRef.current) leaveGuardRef.current = createUnsavedChangesGuard();
  const blocker = useBlocker(isProfileDirty && activeTab === 'profile');
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  useEffect(() => {
    if (!ENABLE_TOPIC_ANALYSIS ||
      !hasValidTopicAnalysis(topicAnalysis, scrapedReviews.length) ||
      topicAnalysis.keywordScores) return undefined;

    const reviewEntries = scrapedReviews.map((review, topicResultIndex) => ({
      review,
      topicResultIndex,
    }));
    const candidateTerms = getTopicKeywordCandidates(reviewEntries, topicAnalysis);
    const requestId = ++topicKeywordScoringRef.current;
    const controller = new AbortController();
    let isCurrent = true;
    console.info('VoxReview: topic keyword scoring candidates prepared.', {
      pageKey: activeContextRef.current.pageKey || currentAnalysisRecord?.pageKey || null,
      reviewCount: scrapedReviews.length,
      uniqueCandidateCount: candidateTerms.length,
      requestBatchCount: Math.ceil(candidateTerms.length / 500),
      requestContext: 'topic-keyword-scoring',
    });

    const applyKeywordScores = (keywordScores) => {
      if (!isCurrent || topicKeywordScoringRef.current !== requestId) return;
      const enrichedTopicAnalysis = { ...topicAnalysis, keywordScores };
      const entriesByTopic = new Map();
      topicAnalysis.results.forEach((result, topicResultIndex) => {
        new Set((result?.topics || []).map(({ label }) => label)).forEach((label) => {
          if (!entriesByTopic.has(label)) entriesByTopic.set(label, []);
          entriesByTopic.get(label).push({
            review: scrapedReviews[topicResultIndex],
            topicResultIndex,
          });
        });
      });
      console.info('VoxReview: topic keyword selection diagnostics.', {
        pageKey: activeContextRef.current.pageKey || currentAnalysisRecord?.pageKey || null,
        uniqueScoredCandidateCount: Object.keys(keywordScores).length,
        topics: [...entriesByTopic.entries()].map(([label, entries]) => (
          getTopicKeywordDiagnostics(entries, label, enrichedTopicAnalysis)
        )),
      });
      const enrichEmotionData = (currentData) => {
        if (!currentData) return currentData;
        const topicEntries = (currentData.quotes || []).map((quote, topicResultIndex) => ({
          review: scrapedReviews[topicResultIndex] ?? quote,
          category: quote.category ?? CATEGORY_BY_EMOTION_ID.get(quote.emotion?.toLowerCase()),
          topicResultIndex,
        }));
        return {
          ...currentData,
          topics: aggregateTopicsForReviews(topicEntries, enrichedTopicAnalysis),
        };
      };

      setTopicAnalysis((current) => (
        current === topicAnalysis ? enrichedTopicAnalysis : current
      ));
      setEmotionData((current) => enrichEmotionData(current));
      setCurrentAnalysisRecord((current) => {
        if (!current || (
          current.topicAnalysis &&
          current.topicAnalysis !== topicAnalysis
        )) return current;
        return {
          ...current,
          topicAnalysis: enrichedTopicAnalysis,
          emotionData: enrichEmotionData(current.emotionData),
        };
      });
    };

    if (candidateTerms.length === 0) {
      applyKeywordScores({});
      return () => {
        isCurrent = false;
        controller.abort(new DOMException('Topic keyword scoring was superseded.', 'AbortError'));
      };
    }

    let timeout;
    const scoreCandidates = async () => {
      const keywordScores = {};
      for (let start = 0; start < candidateTerms.length; start += 500) {
        const batch = candidateTerms.slice(start, start + 500);
        timeout = createTopicRequestTimeout(controller, batch.length);
        const payload = await requestTopicAnalysis(
          batch,
          controller.signal,
          getPlatformLabel(detectedPlatform),
          'topic-keyword-scoring',
          activeContextRef.current.pageKey || currentAnalysisRecord?.pageKey,
          false,
          'keyword-scores',
        );
        timeout.clear();
        timeout = null;
        if (!hasValidTopicKeywordScores(payload, batch.length)) {
          throw new Error('E5 topic keyword scores were missing or invalid.');
        }
        payload.results.forEach((result, index) => {
          const key = batch[index].toLocaleLowerCase();
          keywordScores[key] = Object.fromEntries(
            result.topicScores.map(({ label, score }) => [label, score]),
          );
        });
      }
      applyKeywordScores(keywordScores);
    };

    scoreCandidates().catch((error) => {
      if (isCurrent && topicKeywordScoringRef.current === requestId) {
        console.warn('VoxReview: topic-specific keyword scoring unavailable.', {
          pageKey: activeContextRef.current.pageKey || currentAnalysisRecord?.pageKey || null,
          requestContext: 'topic-keyword-scoring',
          candidateCount: candidateTerms.length,
          httpStatus: error?.httpStatus ?? null,
          code: typeof error?.code === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(error.code)
            ? error.code
            : null,
          errorType: ['AbortError', 'TimeoutError', 'TypeError'].includes(error?.name)
            ? error.name
            : 'Error',
          outcome: 'failure',
        });
      }
    });

    return () => {
      isCurrent = false;
      if (timeout) timeout.clear();
      controller.abort(new DOMException('Topic keyword scoring was superseded.', 'AbortError'));
    };
  }, [detectedPlatform, scrapedReviews, topicAnalysis]);

  const checkCurrentPlatformAvailability = useCallback(async ({ force = false } = {}) => {
    const platformKey = getAvailabilityPlatformKey(activeContextRef.current.platform)
      || getAvailabilityPlatformKey(detectedPlatformRef.current)
      || getAvailabilityPlatformKey(detectedPlatform)
      || getAvailabilityPlatformKey(detectPlatformFromUrl(activeTabUrl));
    if (!platformKey) {
      availabilityRequestRef.current += 1;
      setIsPlatformAvailabilityChecking(false);
      setPlatformAvailability({ platform: null, name: '', status: 'available' });
      return;
    }

    const checker = platformAvailabilityChecker;
    const cachedResult = force ? null : checker.get(platformKey);
    const requestId = ++availabilityRequestRef.current;
    if (cachedResult) {
      setPlatformAvailability({
        platform: platformKey,
        name: cachedResult.name,
        status: cachedResult.isActive ? 'available' : 'disabled',
      });
      setIsPlatformAvailabilityChecking(false);
      return;
    }

    setPlatformAvailability((current) => {
      const hasResolvedStatus = current.platform === platformKey &&
        ['available', 'disabled', 'unverified'].includes(current.status);
      return hasResolvedStatus ? current : {
        platform: platformKey,
        name: current.platform === platformKey ? current.name : getPlatformDisplayName(platformKey),
        status: 'checking',
      };
    });
    setIsPlatformAvailabilityChecking(true);
    try {
      const result = await checker.check(platformKey, { force });
      if (requestId !== availabilityRequestRef.current) return;
      setPlatformAvailability({
        platform: platformKey,
        name: result.name,
        status: result.isActive ? 'available' : 'disabled',
      });
    } catch (error) {
      if (requestId !== availabilityRequestRef.current) return;
      setPlatformAvailability({
        platform: platformKey,
        name: getPlatformDisplayName(platformKey),
        status: 'unverified',
      });
      if (import.meta.env.DEV) console.error('VoxReview: Platform availability check failed:', error);
    } finally {
      if (requestId === availabilityRequestRef.current) {
        setIsPlatformAvailabilityChecking(false);
      }
    }
  }, [activeTabUrl, detectedPlatform]);

  const performTabChange = (nextTab) => {
    if (nextTab !== 'analyze') {
      previousNonAnalyzeTabRef.current = nextTab;
    } else if (activeTab !== 'analyze') {
      previousNonAnalyzeTabRef.current = activeTab;
    }
    setActiveTab(nextTab);
  };

  const handleProfileDirtyChange = useCallback((isDirty) => {
    isProfileDirtyRef.current = isDirty;
    setIsProfileDirty(isDirty);
  }, []);

  const requestProfileLeave = useCallback((action) => {
    const shouldConfirm = isProfileDirtyRef.current && activeTab === 'profile';
    if (!shouldConfirm) {
      if (activeTab === 'profile') discardProfileDraftRef.current?.();
      action();
      return;
    }

    leaveGuardRef.current.request(
      action,
      true,
      () => setShowUnsavedChangesConfirmation(true),
    );
  }, [activeTab]);

  const handleTabChange = (nextTab) => {
    if (nextTab === activeTab) return;
    requestProfileLeave(() => performTabChange(nextTab));
  };

  const handleStayOnProfile = () => {
    leaveGuardRef.current.cancel();
    setShowUnsavedChangesConfirmation(false);
    if (blockerRef.current.state === 'blocked') blockerRef.current.reset();
  };

  const handleLeaveWithoutSaving = () => {
    setShowUnsavedChangesConfirmation(false);
    leaveGuardRef.current.confirm(() => {
      discardProfileDraftRef.current?.();
      isProfileDirtyRef.current = false;
      setIsProfileDirty(false);
    });
  };

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    leaveGuardRef.current.request(
      () => blocker.proceed(),
      true,
      () => setShowUnsavedChangesConfirmation(true),
    );
  }, [blocker]);

  useEffect(() => {
    if (!isProfileDirty || activeTab !== 'profile') return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeTab, isProfileDirty]);

  const applyActiveAnalysisState = (activeState) => {
    if (!activeState?.pageKey || activeState.pageKey !== activeContextRef.current.pageKey) return;
    const incomingReviews = Array.isArray(activeState.reviews) ? activeState.reviews : [];
    const currentRecord = currentAnalysisRecordRef.current;
    const currentTopics = topicAnalysisRef.current;
    const currentEmotionData = emotionDataRef.current;
    const currentReviews = Array.isArray(currentRecord?.reviews) ? currentRecord.reviews : [];
    const sameReviewSet = currentRecord?.pageKey === activeState.pageKey &&
      getTopicReviewSetSignature(currentReviews.map(getReviewText)) ===
        getTopicReviewSetSignature(incomingReviews.map(getReviewText));
    const preservedTopics = sameReviewSet &&
      hasValidTopicAnalysis(currentTopics, incomingReviews.length)
      ? currentTopics
      : null;
    if (sameReviewSet && preservedTopics &&
      !Array.isArray(activeState.svmResult?.predictions) &&
      currentEmotionData) return;
    const stateForView = preservedTopics &&
      !hasValidTopicAnalysis(activeState.topicResult, incomingReviews.length)
      ? { ...activeState, topicResult: preservedTopics, topicError: null }
      : activeState;
    const { record, emotionData: restoredEmotionData, topicAnalysis: restoredTopics } = buildActiveAnalysisView(stateForView);
    analysisResolvedPageKeyRef.current = activeState.pageKey;
    setCurrentAnalysisRecord(record);
    setHasResolvedActiveTab(true);
    setDetectedPlatform(activeState.platform || activeContextRef.current.platform);
    setScrapedIsProductPage(Array.isArray(activeState.reviews) && activeState.reviews.length > 0);
    setScrapedProductTitle(activeState.productTitle || activeState.targetTitle || null);
    setScrapedCategory(activeState.category ?? null);
    setScrapedRating(activeState.rating ?? null);
    setScrapedProductImage(activeState.productImage ?? null);
    setScrapedReviews(Array.isArray(activeState.reviews) ? activeState.reviews : []);
    lastScrapedReviewsRef.current = Array.isArray(activeState.reviews) ? activeState.reviews : [];
    setScrapedHasError(false);
    setScrapedErrorMessage('');
    setEmotionData(restoredEmotionData);
    setTopicAnalysis(restoredTopics);
    setHasSavedAnalysis(false);
    setSaveAnalysisError('');
    setAnalysisError(activeState.error || '');
    setAnalysisStatus(activeState.status === 'error'
      ? 'idle'
      : restoredEmotionData ? 'completed' : activeState.status === 'analyzing' ? 'analyzing' : 'idle');

    if (ENABLE_TOPIC_ANALYSIS &&
      activeState.status === 'completed' &&
      !activeState.topicResult &&
      activeState.topicError &&
      Array.isArray(activeState.reviews) &&
      activeState.reviews.length > 0) {
      const retryKey = `${activeState.pageKey}:${activeState.runId || activeState.completedAt || ''}`;
      if (!topicRetryKeysRef.current.has(retryKey)) {
        topicRetryKeysRef.current.add(retryKey);
        const reviewTexts = activeState.reviews.map(getReviewText);
        const retryIdentity = {
          pageKey: activeState.pageKey,
          runId: activeState.runId,
          reviewSetSignature: activeState.reviewSetSignature ||
            getTopicReviewSetSignature(reviewTexts),
        };
        const retryGeneration = activeContextRef.current.generation;
        const applyRetriedTopicResult = async (topicResult) => {
          if (activeContextRef.current.pageKey !== retryIdentity.pageKey ||
            activeContextRef.current.generation !== retryGeneration) {
            console.info('VoxReview: Stale topic retry result was not applied.', {
              ...retryIdentity,
              reviewCount: reviewTexts.length,
              operation: 'classify',
              outcome: 'stale',
              preservedSuccessfulResult: hasValidTopicAnalysis(topicAnalysisRef.current, reviewTexts.length),
            });
            return;
          }
          const latestState = await getActiveAnalysisForPage(retryIdentity.pageKey);
          if (!isMatchingActiveAnalysisIdentity(latestState, retryIdentity) ||
            hasValidTopicAnalysis(latestState?.topicResult, reviewTexts.length)) {
            console.info('VoxReview: Stale topic retry result was not applied.', {
              ...retryIdentity,
              reviewCount: reviewTexts.length,
              operation: 'classify',
              outcome: 'stale',
              preservedSuccessfulResult: hasValidTopicAnalysis(latestState?.topicResult, reviewTexts.length),
            });
            return;
          }
          const updatedState = await setActiveAnalysisState({
            ...latestState,
            topicResult,
            topicError: null,
          });
          if (updatedState && activeContextRef.current.pageKey === retryIdentity.pageKey &&
            activeContextRef.current.generation === retryGeneration) {
            applyActiveAnalysisState(updatedState);
          }
        };
        const reportRetryFailure = (error) => {
          console.warn('VoxReview: Topic retry failed during active-state restoration.', {
            ...retryIdentity,
            reviewCount: reviewTexts.length,
            operation: 'classify',
            outcome: 'failure',
            errorType: ['AbortError', 'TimeoutError', 'TypeError'].includes(error?.name)
              ? error.name
              : 'Error',
            preservedSuccessfulResult: hasValidTopicAnalysis(topicAnalysisRef.current, reviewTexts.length),
          });
          topicRetryKeysRef.current.delete(retryKey);
        };
        if (globalThis.chrome?.runtime?.sendMessage && globalThis.chrome?.storage?.local) {
          globalThis.chrome.runtime.sendMessage({
            type: 'startAnalysis',
            analysis: {
              ...activeState,
              pageKey: activeState.pageKey,
              requestContext: 'active-analysis-retry',
              force: false,
            },
          }, (response) => {
            if (globalThis.chrome.runtime.lastError || !response?.ok) {
              reportRetryFailure(new Error(
                globalThis.chrome.runtime.lastError?.message ||
                response?.error ||
                'Background topic retry could not be started.',
              ));
              return;
            }
            const retriedTopicResult = response.state?.topicResult;
            if (hasValidTopicAnalysis(retriedTopicResult, reviewTexts.length)) {
              console.info('VoxReview: Topic retry result persisted by background analysis.', {
                pageKey: retryIdentity.pageKey,
                reviewCount: reviewTexts.length,
                reviewSetSignature: retryIdentity.reviewSetSignature,
                operation: 'classify',
                outcome: 'persisted',
                preservedSuccessfulResult: true,
              });
            }
          });
        } else {
          const controller = new AbortController();
          const timeout = createTopicRequestTimeout(controller, reviewTexts.length);
          void requestTopicAnalysis(
            reviewTexts,
            controller.signal,
            getPlatformLabel(activeState.platform),
            'active-analysis-retry',
            activeState.pageKey,
          ).then(applyRetriedTopicResult)
            .catch(reportRetryFailure)
            .finally(() => timeout.clear());
        }
      }
    }
  };

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

  useEffect(() => {
    if (activeTab !== 'analyze' || !hasResolvedActiveTab || isSiteUnsupported) {
      availabilityRequestRef.current += 1;
      return undefined;
    }

    void checkCurrentPlatformAvailability();
    return () => {
      availabilityRequestRef.current += 1;
    };
  }, [activeTab, checkCurrentPlatformAvailability, hasResolvedActiveTab, isSiteUnsupported]);

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
    let isMounted = true;
    const updateActiveTabContext = async () => {
      if (!activeContextRef.current.isResolved) setHasResolvedActiveTab(false);
      const activeTabObj = await resolveCurrentActiveTab();
      if (!isMounted) return;
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

      console.log('[POPUP] current tab:', { tabId: context.tabId, url: activeUrl, platform: urlBasedPlatform });
      console.log('[POPUP] page key:', newPageKey);

      if (urlBasedPlatform === 'unknown') {
        setHasResolvedActiveTab(true);
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
        setHasResolvedActiveTab(false);
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

      const activeAnalysis = await getActiveAnalysisForPage(context.pageKey);
      if (activeContextRef.current.generation !== context.generation || analysisRevisionRef.current !== restoreRevision) return;
      if (activeAnalysis) {
        const savedTopicResult = getMatchingSavedTopicResult(activeAnalysis, existingAnalysis);
        const activeReviewCount = Array.isArray(activeAnalysis.reviews) ? activeAnalysis.reviews.length : 0;
        const shouldRestoreSavedTopics = activeAnalysis.status === 'completed' &&
          !hasValidTopicAnalysis(activeAnalysis.topicResult, activeReviewCount) &&
          hasValidTopicAnalysis(savedTopicResult, activeReviewCount);
        const stateToRestore = shouldRestoreSavedTopics
          ? { ...activeAnalysis, topicResult: savedTopicResult, topicError: null }
          : activeAnalysis;
        if (shouldRestoreSavedTopics) {
          console.info('VoxReview: Topic analysis restored from saved page results.', {
            pageKey: context.pageKey,
            reviewCount: activeReviewCount,
            reviewSetSignature: getActiveAnalysisReviewSetSignature(activeAnalysis),
            operation: 'classify',
            outcome: 'restored',
            preservedSuccessfulResult: true,
          });
          try {
            await setActiveAnalysisState(stateToRestore);
          } catch (error) {
            console.warn('VoxReview: Could not persist restored topic results.', {
              pageKey: context.pageKey,
              reviewCount: activeReviewCount,
              reviewSetSignature: getActiveAnalysisReviewSetSignature(activeAnalysis),
              operation: 'classify',
              errorType: error?.name === 'QuotaExceededError' ? 'storage_quota' : 'storage_error',
              outcome: 'failure',
              preservedSuccessfulResult: true,
            });
          }
        } else {
          console.info('VoxReview: Topic analysis restored from active page state.', {
            pageKey: context.pageKey,
            reviewCount: activeReviewCount,
            reviewSetSignature: getActiveAnalysisReviewSetSignature(activeAnalysis),
            operation: 'classify',
            outcome: 'restored',
            preservedSuccessfulResult: hasValidTopicAnalysis(stateToRestore.topicResult, activeReviewCount),
          });
        }
        if (activeContextRef.current.generation !== context.generation ||
          analysisRevisionRef.current !== restoreRevision) return;
        applyActiveAnalysisState(stateToRestore);
        return;
      }

      if (existingAnalysis) {
        setHasResolvedActiveTab(true);
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
          const savedEmotions = (existingAnalysis.emotionData.emotions || []).map((emotion) => {
            const category = emotion.category ?? CATEGORY_BY_EMOTION_ID.get(emotion.id);
            return {
              ...emotion,
              category,
              ...(savedReviewAnalysis.length === savedReviews.length && category != null
                ? { keywords: getSvmEmotionKeywords(savedReviewAnalysis, Number(category), savedReviews) }
                : {}),
            };
          });
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
            const topicTimeout = createTopicRequestTimeout(topicAbortController, savedReviewTexts.length);
            void requestTopicAnalysis(
              savedReviewTexts,
              topicAbortController.signal,
              getPlatformLabel(existingAnalysis.platform || urlBasedPlatform),
              'saved-analysis-restore',
              context.pageKey,
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
                const currentRecord = currentAnalysisRecordRef.current;
                const currentRecordReviews = Array.isArray(currentRecord?.reviews)
                  ? currentRecord.reviews.map(getReviewText)
                  : [];
                if (currentRecord?.pageKey === context.pageKey &&
                  getTopicReviewSetSignature(currentRecordReviews) ===
                    getTopicReviewSetSignature(savedReviewTexts) &&
                  hasValidTopicAnalysis(topicAnalysisRef.current, savedReviewTexts.length)) return;
                console.warn('VoxReview: legacy topic analysis unavailable:', topicError);
                analysisRevisionRef.current += 1;
                setEmotionData((currentData) => currentData
                  ? { ...currentData, topicStatus: 'unavailable' }
                  : currentData);
              })
              .finally(() => topicTimeout.clear());
          }
        } else {
          setEmotionData(null);
          setTopicAnalysis(null);
        }
        setScrapedHasError(false);
        setScrapedErrorMessage('');
        setAnalysisStatus('completed');
      } else {
        setHasResolvedActiveTab(true);
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
        const refreshProfileOnce = (userId) => {
          if (!userId) return Promise.resolve(null);
          if (profileRefreshRef.current.userId === userId && profileRefreshRef.current.promise) {
            return profileRefreshRef.current.promise;
          }

          const refreshPromise = authService.refreshCurrentUserProfile()
            .then((liveUser) => {
              if (isMounted && liveUser?.id === userId) {
                setAuthenticatedUser(liveUser);
              }
              return liveUser;
            })
            .catch((error) => {
              console.error('VoxReview: Could not refresh the signed-in profile:', error);
              return null;
            })
            .finally(() => {
              if (profileRefreshRef.current.promise === refreshPromise) {
                profileRefreshRef.current = { userId: null, promise: null };
              }
            });
          profileRefreshRef.current = { userId, promise: refreshPromise };
          return refreshPromise;
        };

        chrome.storage.local.get(['voxreviewLastScrape', 'voxreview_auth_session'], async (result) => {
          syncScrapeData(result?.voxreviewLastScrape);

          const extSession = result?.voxreview_auth_session;
          if (extSession?.user && extSession?.token) {
            const validation = await authService.validateExtensionSession(extSession);
            const latestStorage = await chrome.storage.local.get(['voxreview_auth_session']);
            const latestSession = latestStorage?.voxreview_auth_session;
            if (
              validation.status === 'invalid' ||
              latestSession?.user?.id !== extSession.user.id
            ) {
              lastAuthUserIdRef.current = null;
              authService.cacheSessionLocally(null);
              setAuthenticatedUser(null);
              return;
            }

            lastAuthUserIdRef.current = extSession.user.id || null;
            const restoredUser = validation.status === 'valid'
              ? validation.user
              : extSession.user;
            authService.cacheSessionLocally({
              ...extSession,
              user: restoredUser,
            });
            setAuthenticatedUser(restoredUser);

            if (validation.status === 'valid') {
              await refreshProfileOnce(extSession.user.id);
            }
          } else {
            lastAuthUserIdRef.current = null;
            authService.cacheSessionLocally(null);
            setAuthenticatedUser(null);
          }
        });

        handleStorageChange = (changes, areaName) => {
          if (areaName !== 'local') return;

          if (changes[ACTIVE_ANALYSIS_STORAGE_KEY]) {
            const activeState = changes[ACTIVE_ANALYSIS_STORAGE_KEY].newValue?.[activeContextRef.current.pageKey];
            if (activeState) applyActiveAnalysisState(activeState);
          }

          if (changes.voxreview_auth_session) {
            const newSession = changes.voxreview_auth_session.newValue;
            if (newSession && newSession.user) {
              authService.cacheSessionLocally(newSession);
              const authChanged = shouldRefreshProfileForAuthChange(
                { user: { id: lastAuthUserIdRef.current } },
                newSession,
              );
              lastAuthUserIdRef.current = newSession.user.id || null;
              if (authChanged) {
                setAuthenticatedUser(newSession.user);
                refreshProfileOnce(newSession.user.id);
                setAuthToastMessage("You're now signed in.");
                setTimeout(() => setAuthToastMessage(''), 4000);
              }
            } else {
              clearPopupAuthState({
                authService,
                lastAuthUserIdRef,
                profileRefreshRef,
                setAuthenticatedUser,
                setAuthToastMessage,
              });
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
        isMounted = false;
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
  const availabilityPlatformKey = getAvailabilityPlatformKey(activeContextRef.current.platform)
    || getAvailabilityPlatformKey(detectedPlatform)
    || getAvailabilityPlatformKey(detectPlatformFromUrl(activeTabUrl));
  const availabilityStatus = availabilityPlatformKey
    ? platformAvailability.platform === availabilityPlatformKey
      ? platformAvailability.status
      : 'checking'
    : 'available';
  const availabilityPlatformName = platformAvailability.platform === availabilityPlatformKey
    ? platformAvailability.name
    : getPlatformDisplayName(availabilityPlatformKey);

  const handleAnalyzeClick = async (reviewsToAnalyze = scrapedReviews, scrapeMetadata = null) => {
    if (analysisStatus === 'analyzing' || availabilityStatus !== 'available') return;
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
    const analysisPlatform = scrapeMetadata?.platform
      || activeContextRef.current.platform
      || detectedPlatform;
    const analysisPageUrl = scrapeMetadata?.url || activeTabUrlRef.current || window.location.href;
    const analysisPageKey = getPageKey(analysisPlatform, analysisPageUrl);
    const priorRecordPageKey = currentAnalysisRecord?.pageKey ||
      getPageKey(currentAnalysisRecord?.platform, currentAnalysisRecord?.page_url);
    const priorReviewTexts = Array.isArray(currentAnalysisRecord?.reviews)
      ? currentAnalysisRecord.reviews.map(getReviewText)
      : [];
    const nextReviewTexts = analysisReviews.map(getReviewText);
    const preserveCurrentTopics = priorRecordPageKey === analysisPageKey &&
      getTopicReviewSetSignature(priorReviewTexts) === getTopicReviewSetSignature(nextReviewTexts) &&
      hasValidTopicAnalysis(topicAnalysis, analysisReviews.length);
    if (!preserveCurrentTopics) setCurrentAnalysisRecord(null);
    setHasSavedAnalysis(false);
    setSaveAnalysisError('');
    setAnalysisError('');
    setIsSavingAnalysis(false);
    setScrapedReviews(analysisReviews);
    if (!preserveCurrentTopics) {
      setTopicAnalysis(null);
      setEmotionData(null);
    }
    setAnalysisStatus('analyzing');

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage && chrome.storage?.local) {
      const pageUrl = analysisPageUrl;
      const platform = analysisPlatform;
      const pageKey = getPageKey(platform, pageUrl);
      const analysis = {
        platform,
        page_url: pageUrl,
        pageKey,
        requestContext: scrapeMetadata?.rescanRequestId ? 'manual-rescan' : 'popup-analyze',
        productTitle: scrapeMetadata?.productTitle || scrapedProductTitle || 'Product Review',
        targetTitle: scrapeMetadata?.productTitle || scrapedProductTitle || 'Product Review',
        rating: scrapeMetadata?.rating ?? scrapedRating,
        category: scrapeMetadata?.category ?? scrapedCategory,
        productImage: scrapeMetadata?.productImage ?? scrapedProductImage,
        reviews: analysisReviews,
        force: Boolean(scrapeMetadata?.rescanRequestId),
      };

      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'startAnalysis', analysis }, (result) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(result);
          });
        });
        if (!response?.ok) {
          const startError = new Error(
            (typeof response?.error === 'string' ? response.error : response?.error?.message)
              || response?.message
              || 'Analysis could not be started.',
          );
          startError.code = response?.code || response?.error?.code || null;
          throw startError;
        }
        if (response.state) applyActiveAnalysisState(response.state);
      } catch (error) {
        if (analysisRevisionRef.current !== analysisRevision) return;
        if (isPlatformDisabledError(error)) {
          setPlatformAvailability({
            platform: getAvailabilityPlatformKey(analysisPlatform) || availabilityPlatformKey,
            name: getPlatformDisplayName(analysisPlatform),
            status: 'disabled',
          });
          setCurrentAnalysisRecord(null);
          setEmotionData(null);
          setTopicAnalysis(null);
        }
        setAnalysisStatus('idle');
        setAnalysisError(error.message || 'Emotion analysis failed. Please retry.');
      }
      return;
    }

    try {
      const reviewTexts = analysisReviews.map(getReviewText);
      if (reviewTexts.length === 0 || reviewTexts.some((review) => !review.trim())) {
        throw new Error('No usable review text was available for SVM analysis.');
      }

      const svmStartedAt = performance.now();
      console.log('[Analyze] SVM request start');
      const payload = await requestSvmBatch(reviewTexts, {
        platform: analysisPlatform,
        onFailure: (error) => {
          if (analysisRevisionRef.current !== analysisRevision) return;
          if (isPlatformDisabledError(error)) {
            setPlatformAvailability({
              platform: getAvailabilityPlatformKey(analysisPlatform) || availabilityPlatformKey,
              name: getPlatformDisplayName(analysisPlatform),
              status: 'disabled',
            });
          }
          setAnalysisStatus('idle');
          setAnalysisError(error.message || 'SVM analysis failed. Please retry.');
        },
      });
      console.log(`[Analyze] SVM: ${Math.round(performance.now() - svmStartedAt)} ms`);
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
            contextualResolution: typeof result?.contextualResolution?.explanation === 'string'
              ? result.contextualResolution
              : null,
          }))
        : payload.predictions.map((category) => ({
            category,
            emotionDrivers: [],
            contextualResolution: null,
          }));
      const nextEmotionData = buildEmotionData(
        analysisReviews,
        payload.predictions,
        analysisPlatformLabel,
        preserveCurrentTopics ? topicAnalysis : null,
        preserveCurrentTopics ? 'ready' : ENABLE_TOPIC_ANALYSIS ? 'pending' : 'disabled',
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
          contextualResolution: result.contextualResolution,
        })),
        topicAnalysis: preserveCurrentTopics ? topicAnalysis : null,
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
      const topicTimeout = createTopicRequestTimeout(topicAbortController, reviewTexts.length);
      try {
        const topicPayload = await requestTopicAnalysis(
          reviewTexts,
          topicAbortController.signal,
          analysisPlatformLabel,
          'popup-analysis',
          record.pageKey,
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
        if (isPlatformDisabledError(topicError)) {
          setPlatformAvailability({
            platform: getAvailabilityPlatformKey(analysisPlatform) || availabilityPlatformKey,
            name: getPlatformDisplayName(analysisPlatform),
            status: 'disabled',
          });
          setCurrentAnalysisRecord(null);
          setEmotionData(null);
          setTopicAnalysis(null);
          setAnalysisStatus('idle');
          return;
        }
        console.warn('VoxReview: review topic analysis unavailable:', topicError);
        if (preserveCurrentTopics) {
          const retainedTopicData = buildEmotionData(
            analysisReviews,
            payload.predictions,
            analysisPlatformLabel,
            topicAnalysis,
            'ready',
            explanationResults,
          );
          analysisRevisionRef.current += 1;
          setTopicAnalysis(topicAnalysis);
          setEmotionData(retainedTopicData);
          setCurrentAnalysisRecord({
            ...record,
            topicAnalysis,
            emotionData: retainedTopicData,
          });
          setHasSavedAnalysis(false);
          return;
        }
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
        topicTimeout.clear();
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
      setAnalysisError(error.message || 'Emotion analysis failed. Please retry.');
    }
  };

  const handleSavedAnalysisRefresh = async (savedItem, scrapeData) => {
    const savedReviews = Array.isArray(savedItem.reviews) ? savedItem.reviews : [];
    const fetchedReviews = Array.isArray(scrapeData.reviews) ? scrapeData.reviews : [];
    const newReviews = getNewReviews(savedReviews, fetchedReviews);
    const refreshedAt = Date.now();
    const updatedRecord = await saveAnalysisForPage({
      ...savedItem,
      last_refreshed_at: refreshedAt,
    });
    if (!updatedRecord) throw new Error('Unable to update the saved refresh timestamp.');
    return {
      success: true,
      newReviewCount: newReviews.length,
      newReviews,
      message: newReviews.length ? `${newReviews.length} new reviews detected` : 'No new reviews found',
      record: updatedRecord,
      lastRefreshedAt: refreshedAt,
    };
  };

  const handleAnalyzeNewSavedReviews = async (savedItem, newReviews) => {
    if (!Array.isArray(newReviews) || newReviews.length === 0) {
      throw new Error('No new reviews are waiting to be analyzed.');
    }
    const savedReviews = Array.isArray(savedItem.reviews) ? savedItem.reviews : [];
    const refreshedAt = Date.now();
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

    const svmPayload = await requestSvmBatch(newReviewTexts, { platform: savedItem.platform });
    if (!Array.isArray(svmPayload.predictions) ||
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
          contextualResolution: typeof result?.contextualResolution?.explanation === 'string'
            ? result.contextualResolution
            : null,
        }))
      : svmPayload.predictions.map((category) => ({
          category,
          emotionDrivers: [],
          contextualResolution: null,
        }));

    let newTopicPayload = null;
    if (ENABLE_TOPIC_ANALYSIS) {
      const controller = new AbortController();
      const timeout = createTopicRequestTimeout(controller, newReviewTexts.length);
      try {
        newTopicPayload = await requestTopicAnalysis(
          newReviewTexts,
          controller.signal,
          getPlatformLabel(savedItem.platform),
          'saved-analysis-refresh',
          getPageKey(savedItem.platform, savedItem.page_url) || savedItem.pageKey,
          true,
        );
      } finally {
        timeout.clear();
      }
    }

    const newEmotionData = buildEmotionData(
      newReviews,
      svmPayload.predictions,
      getPlatformLabel(savedItem.platform),
      newTopicPayload,
      ENABLE_TOPIC_ANALYSIS ? 'ready' : 'disabled',
      newExplanationResults,
    );
    const combinedReviews = [...savedReviews, ...newReviews];
    const combinedReviewAnalysis = [...savedReviewAnalysis, ...newExplanationResults.map((result, index) => ({
      review: newReviews[index],
      category: result.category,
      emotionDrivers: result.emotionDrivers,
      contextualResolution: result.contextualResolution,
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
      model: 'SVM',
      keywords: getSvmEmotionKeywords(combinedReviewAnalysis, Number(category), combinedReviews),
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
        model: 'SVM',
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
      last_refreshed_at: savedItem.last_refreshed_at || refreshedAt,
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
    setAnalysisError('');
    setIsSavingAnalysis(false);
    void deleteActiveAnalysisForPage(activeContextRef.current.pageKey);
    setScrapedReviews([]);
    // Keep the last same-page scrape only as an in-memory source for Analyze Again.
    setScrapedHasError(false);
    setScrapedErrorMessage('');
    setAnalysisStatus('idle');
    setAnalysisViewRevision((revision) => revision + 1);
  };

  // Log in / Sign up redirects to the existing Web Application authentication routes
  const handleOpenLogin = () => requestProfileLeave(() => openWebAppAuth('/login'));
  const handleOpenRegister = () => requestProfileLeave(() => openWebAppAuth('/register'));

  // Logout clears session and notifies extension to return to Guest Mode
  const handleLogout = () => {
    requestProfileLeave(() => {
      setShowLogoutConfirmation(true);
    });
  };

  const confirmLogout = async () => {
    await authService.logout();
    setAuthenticatedUser(null);
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
          ...(savedReviewAnalysis.length === savedReviews.length
            ? {
                emotions: (item.emotionData.emotions || []).map((emotion) => {
                  const category = emotion.category ?? CATEGORY_BY_EMOTION_ID.get(emotion.id);
                  return {
                    ...emotion,
                    category,
                    ...(category != null
                      ? { keywords: getSvmEmotionKeywords(savedReviewAnalysis, Number(category), savedReviews) }
                      : {}),
                  };
                }),
              }
            : {}),
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
        const timeout = createTopicRequestTimeout(controller, reviewTexts.length);
        void requestTopicAnalysis(
          reviewTexts,
          controller.signal,
          getPlatformLabel(restoredPlatform),
          'saved-page-topic-restore',
          pageKey,
        )
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
            const currentRecord = currentAnalysisRecordRef.current;
            const currentRecordReviews = Array.isArray(currentRecord?.reviews)
              ? currentRecord.reviews.map(getReviewText)
              : [];
            if (currentRecord?.pageKey === pageKey &&
              getTopicReviewSetSignature(currentRecordReviews) ===
                getTopicReviewSetSignature(reviewTexts) &&
              hasValidTopicAnalysis(topicAnalysisRef.current, reviewTexts.length)) return;
            if (import.meta.env.DEV) console.error('VoxReview: Could not restore missing topic results:', error);
            setEmotionData((currentData) => currentData ? { ...currentData, topicStatus: 'unavailable' } : currentData);
          })
          .finally(() => timeout.clear());
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
          return { success: false, needsOpen: true };
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

  const handleOpenSavedPage = async (savedItem) => {
    const extensionApi = globalThis.chrome;
    if (!savedItem?.page_url || !extensionApi?.tabs?.create) {
      throw new Error('Unable to open the original product page.');
    }

    const openedTab = await new Promise((resolve, reject) => {
      extensionApi.tabs.create({ url: savedItem.page_url, active: true }, (tab) => {
        if (extensionApi.runtime?.lastError || !tab?.id) {
          reject(new Error(extensionApi.runtime?.lastError?.message || 'Unable to open the original product page.'));
          return;
        }
        resolve(tab);
      });
    });

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        extensionApi.tabs.onUpdated.removeListener(onUpdated);
        if (error) reject(error);
        else resolve();
      };
      const onUpdated = (tabId, changeInfo) => {
        if (tabId === openedTab.id && changeInfo.status === 'complete') finish();
      };
      const timeout = setTimeout(() => finish(new Error('The original product page did not finish opening.')), 30000);
      extensionApi.tabs.onUpdated.addListener(onUpdated);
      extensionApi.tabs.get(openedTab.id, (tab) => {
        if (extensionApi.runtime?.lastError) {
          finish(new Error(extensionApi.runtime.lastError.message));
        } else if (tab?.status === 'complete') {
          finish();
        }
      });
    });

    const result = await handleRescanPage(savedItem);
    if (!result?.success) {
      throw new Error(result?.error || 'Unable to refresh this analysis. Please check that the original page is available.');
    }
    return result;
  };

  const handleAnalyzeNewReviews = async (savedItem, reviews) => {
    const latestSavedItem = await getAnalysisForPage(savedItem.platform, savedItem.page_url) || savedItem;
    return handleAnalyzeNewSavedReviews(latestSavedItem, reviews);
  };

  const availableReviewCount = scrapedReviews.length || lastScrapedReviewsRef.current.length;
  const hasReviewsForAnalysis = scrapedReviews.length > 0 || lastScrapedReviewsRef.current.length > 0;

  return (
    <div className="popup-standalone-page">
      <div className="popup-root">
        {/* Extension Header */}
        <Header
          isLoggedIn={isLoggedIn}
          userName={savedProfile?.username || savedProfile?.name}
          avatarUrl={savedProfile?.avatarUrl}
          userInitial={savedProfile?.firstName || savedProfile?.username || savedProfile?.email}
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
              {!hasResolvedActiveTab ? (
                <div className="analysis-section" role="status" aria-live="polite">
                  <div className="analysis-glass-card">Restoring current page analysis…</div>
                </div>
              ) : (
                <>
                  {/* ── 1. Website Not Supported (FIRST CHECK) ── */}
                  {isSiteUnsupported ? (
                <UnsupportedSiteView
                  onRescan={handleRescanPage}
                  isRescanning={isRescanning}
                />
              ) : availabilityStatus !== 'available' ? (
                <PlatformUnavailableView
                  platformName={availabilityPlatformName}
                  status={availabilityStatus}
                  isChecking={isPlatformAvailabilityChecking}
                  onCheckAgain={() => { void checkCurrentPlatformAvailability({ force: true }); }}
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
                    analysisError={analysisError}
                    isLoggedIn={isLoggedIn}
                    onSaveAnalysis={handleSaveAnalysis}
                    isSaving={isSavingAnalysis}
                    hasSavedAnalysis={hasSavedAnalysis}
                    saveError={saveAnalysisError}
                    emotionData={emotionData}
                    topicAnalysis={topicAnalysis}
                    scrapedReviews={scrapedReviews}
                    onSaveRedirect={handleOpenLogin}
                    onOpenLogin={handleOpenLogin}
                    onClearAnalysis={handleClearAnalysis}
                    platform={detectedPlatform}
                  />
                </>
                  )}
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
              onOpenSavedPage={handleOpenSavedPage}
              onAnalyzeNewReviews={handleAnalyzeNewReviews}
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
              onSavedProfileUpdated={setAuthenticatedUser}
              theme={theme}
              onThemeToggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              onDirtyChange={handleProfileDirtyChange}
              onRequestLeave={requestProfileLeave}
              registerDiscardDraft={(fn) => { discardProfileDraftRef.current = fn; }}
            />
          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNavBar activeTab={activeTab} onTabChange={handleTabChange} savedCount={savedAnalysisCount} isLoggedIn={isLoggedIn} />
      </div>
      {showLogoutConfirmation && (
        <LogoutConfirmationModalExtension
          onCancel={() => setShowLogoutConfirmation(false)}
          onConfirm={confirmLogout}
        />
      )}
      {showUnsavedChangesConfirmation && (
        <UnsavedChangesConfirmationModal
          onStay={handleStayOnProfile}
          onLeave={handleLeaveWithoutSaving}
        />
      )}
    </div>
  );
}
