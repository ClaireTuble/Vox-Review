import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import authService, { openWebAppAuth } from '../../services/authService.js';
import { getAnalysisForPage, saveAnalysisForPage, getPageKey } from '../../services/pageAnalysisStorage.js';
import Header from '../components/Header.jsx';
import DetectedPageCard from '../components/DetectedPageCard.jsx';
import AnalysisResults from '../components/AnalysisResults.jsx';
import SavedAnalysesView from '../components/SavedAnalysesView.jsx';
import ProfileView from '../components/ProfileView.jsx';
import BottomNavBar from '../components/BottomNavBar.jsx';
import UnsupportedSiteView from '../components/UnsupportedSiteView.jsx';
import NoReviewsView from '../components/NoReviewsView.jsx';
import LogoutConfirmationModalExtension from '../components/LogoutConfirmationModalExtension.jsx';
import '../css/PopupPage.css';

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

  useEffect(() => {
    activeTabUrlRef.current = activeTabUrl;
  }, [activeTabUrl]);

  useEffect(() => {
    detectedPlatformRef.current = detectedPlatform;
  }, [detectedPlatform]);

  const syncScrapeData = async (data) => {
    if (!data) return;

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

    // 1. Always update page-specific persistent storage record with fresh reviews & timestamp
    if (scrapePlatform && scrapeUrl && Array.isArray(data.reviews) && data.reviews.length > 0) {
      try {
        const existingRecord = await getAnalysisForPage(scrapePlatform, scrapeUrl);
        if (existingRecord) {
          await saveAnalysisForPage({
            ...existingRecord,
            reviews: data.reviews,
            productTitle: data.productTitle || existingRecord.productTitle,
            rating: data.rating || existingRecord.rating,
            category: data.category || existingRecord.category,
            productImage: data.productImage || existingRecord.productImage,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        console.warn('VoxReview: Error updating page analysis storage:', err);
      }
    }

    // 2. Check if data belongs to the currently active tab / page
    const isForCurrentTab = (() => {
      if (scrapePlatform && currentActivePlat && currentActivePlat !== 'unknown' && scrapePlatform !== currentActivePlat) {
        return false;
      }

      // A. Same tab ID
      if (data.tabId != null && currentContext.tabId != null && Number(data.tabId) === Number(currentContext.tabId)) {
        return true;
      }

      // B. Normalized page key match
      if (scrapeUrl && currentActiveUrl) {
        if (scrapeUrl === currentActiveUrl) return true;
        const currentKey = currentContext.pageKey || getPageKey(currentActivePlat, currentActiveUrl);
        const scrapeKey = getPageKey(scrapePlatform, scrapeUrl);
        console.log('[POPUP] page key comparison:', { currentKey, scrapeKey });
        if (currentKey && scrapeKey && currentKey === scrapeKey) return true;
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

    console.log('[POPUP] applying reviews:', Array.isArray(data.reviews) ? data.reviews.length : 0);
    if (data.platform) setDetectedPlatform(data.platform);
    if (data.isProductPage !== undefined) setScrapedIsProductPage(data.isProductPage);
    if (data.productTitle !== undefined) setScrapedProductTitle(data.productTitle);
    if (data.category !== undefined) setScrapedCategory(data.category);
    if (data.rating !== undefined) setScrapedRating(data.rating);
    if (data.productImage !== undefined) setScrapedProductImage(data.productImage);
    if (Array.isArray(data.reviews)) setScrapedReviews(data.reviews);
    if (data.hasError !== undefined) setScrapedHasError(!!data.hasError);
    if (data.errorMessage !== undefined) setScrapedErrorMessage(data.errorMessage);
    console.log('[POPUP] final review count:', Array.isArray(data.reviews) ? data.reviews.length : 0);
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
        previousContext.tabId !== activeTabObj.id ||
        (previousContext.pageKey && newPageKey && previousContext.pageKey !== newPageKey) ||
        (previousContext.platform !== urlBasedPlatform)
      );

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
        setDetectedPlatform('');
        setScrapedIsProductPage(false);
        setScrapedProductTitle(null);
        setScrapedCategory(null);
        setScrapedRating(null);
        setScrapedProductImage(null);
        setScrapedReviews([]);
        setScrapedHasError(false);
        setScrapedErrorMessage('');
        setAnalysisStatus('idle');
        return;
      }

      setDetectedPlatform(urlBasedPlatform);

      if (pageGenuinelyChanged) {
        setScrapedIsProductPage(false);
        setScrapedProductTitle(null);
        setScrapedCategory(null);
        setScrapedRating(null);
        setScrapedProductImage(null);
        setScrapedReviews([]);
        setScrapedHasError(false);
        setScrapedErrorMessage('');
        setAnalysisStatus('idle');
      }

      const existingAnalysis = await getAnalysisForPage(urlBasedPlatform, activeUrl);
      if (activeContextRef.current.generation !== context.generation) return;

      if (existingAnalysis) {
        if (existingAnalysis.productTitle) setScrapedProductTitle(existingAnalysis.productTitle);
        if (existingAnalysis.reviews) setScrapedReviews(existingAnalysis.reviews);
        if (existingAnalysis.rating) setScrapedRating(existingAnalysis.rating);
        if (existingAnalysis.category) setScrapedCategory(existingAnalysis.category);
        if (existingAnalysis.productImage) setScrapedProductImage(existingAnalysis.productImage);
        setScrapedHasError(false);
        setScrapedErrorMessage('');
        setAnalysisStatus('completed');
      } else {
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

  const platformLabel = (() => {
    const value = String(detectedPlatform || '').toLowerCase();
    if (value === 'googleplay') return 'Google Play';
    if (value === 'google') return 'Google Reviews';
    if (value === 'lazada') return 'Lazada';
    if (value === 'shopee') return 'Shopee';
    if (value === 'steam') return 'Steam';
    if (value === 'agoda') return 'Agoda';
    return 'Current Source';
  })();

  const handleAnalyzeClick = async () => {
    if (analysisStatus === 'analyzing') return;
    setAnalysisStatus('analyzing');

    setTimeout(async () => {
      const record = {
        platform: platformLabel,
        page_url: activeTabUrl || window.location.href,
        targetTitle: scrapedProductTitle || 'Product Review',
        productTitle: scrapedProductTitle || 'Product Review',
        dominantEmotion: 'Happy',
        percentage: '65%',
        reviews: scrapedReviews,
        rating: scrapedRating,
        category: scrapedCategory,
        productImage: scrapedProductImage,
        timestamp: Date.now()
      };
      await saveAnalysisForPage(record);
      setAnalysisStatus('completed');
    }, 1800);
  };

  const handleClearAnalysis = () => setAnalysisStatus('idle');

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

  const handleSelectSavedItem = () => {
    setActiveTab('analyze');
    setAnalysisStatus('completed');
  };

  // Manual rescan — ALWAYS targets the currently active browser tab resolved at click time
  const [isRescanning, setIsRescanning] = useState(false);
  const handleRescanPage = async () => {
    if (isRescanning) return;
    setIsRescanning(true);

    try {
      // 1. Resolve the CURRENT active tab at the exact time of clicking
      const activeTabObj = await resolveCurrentActiveTab();
      if (!activeTabObj || !activeTabObj.id) {
        console.warn('VoxReview: No active tab found to rescan.');
        setIsRescanning(false);
        setScrapedHasError(true);
        setScrapedErrorMessage('No active browser tab found.');
        return;
      }

      const currentUrl = activeTabObj.url || activeTabUrlRef.current;
      if (!currentUrl) {
        setIsRescanning(false);
        setScrapedHasError(true);
        setScrapedErrorMessage('Unable to determine the current browser page.');
        return;
      }
      const plat = detectPlatformFromUrl(currentUrl);
      console.log('[RESCAN] clicked', { tabId: activeTabObj.id, url: currentUrl, platform: plat });
      const newPageKey = getPageKey(plat, currentUrl);
      const previousContext = activeContextRef.current;
      const contextChanged = previousContext.tabId !== activeTabObj.id || previousContext.pageKey !== newPageKey;
      activeContextRef.current = {
        tabId: activeTabObj.id,
        url: currentUrl,
        platform: plat,
        pageKey: newPageKey,
        generation: contextChanged ? previousContext.generation + 1 : previousContext.generation,
        isResolved: true,
      };

      // 2. If the current tab URL remains unsupported after re-detection:
      if (plat === 'unknown') {
        setActiveTabUrl(currentUrl);
        setHasResolvedActiveTab(true);
        setDetectedPlatform('');
        setTimeout(() => setIsRescanning(false), 600);
        return;
      }

      // 3. Tab is supported: update active state and clear unsupported flag
      setActiveTabUrl(currentUrl);
      setHasResolvedActiveTab(true);
      setDetectedPlatform(plat);
      setScrapedHasError(false);
      setScrapedErrorMessage('');

      // 4. Use the established background-to-content-script forwarding path.
      chrome.runtime.sendMessage(
        { type: 'rescanPage', tabId: activeTabObj.id, url: currentUrl, platform: plat },
        (response) => {
          if (chrome.runtime?.lastError) {
            console.warn('VoxReview rescan error:', chrome.runtime.lastError.message);
            setIsRescanning(false);
            setScrapedHasError(true);
            setScrapedErrorMessage('VoxReview cannot access this page. Please refresh the page and try again.');
          } else if (response && response.ok === false) {
            console.warn('VoxReview rescan failed:', response.reason);
            setIsRescanning(false);
            setScrapedHasError(true);
            setScrapedErrorMessage(response.reason || 'Failed to rescan current page.');
          } else {
            setTimeout(() => setIsRescanning(false), 800);
          }
        }
      );
    } catch (err) {
      console.error('VoxReview: Error during handleRescanPage:', err);
      setIsRescanning(false);
    }
  };

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
              !scrapedIsProductPage || scrapedReviews.length === 0 ? (
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
                    reviewsCount={scrapedReviews.length > 0 ? String(scrapedReviews.length) : '0'}
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
                    status={analysisStatus}
                    isLoggedIn={isLoggedIn}
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
        <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} />
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
