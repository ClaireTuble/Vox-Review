import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authService, { openWebAppAuth } from '../../services/authService.js';
import Header from '../components/Header.jsx';
import DetectedPageCard from '../components/DetectedPageCard.jsx';
import AnalysisResults from '../components/AnalysisResults.jsx';
import SavedAnalysesView from '../components/SavedAnalysesView.jsx';
import ProfileView from '../components/ProfileView.jsx';
import BottomNavBar from '../components/BottomNavBar.jsx';
import UnsupportedSiteView from '../components/UnsupportedSiteView.jsx';
import NoReviewsView from '../components/NoReviewsView.jsx';
import '../css/PopupPage.css';

/**
 * General URL rule for website support detection.
 * Evaluates the hostname/URL of the active tab.
 * If the hostname is NOT in the supported list -> returns 'unknown'.
 */
function detectPlatformFromUrl(urlStr) {
  if (!urlStr) return 'unknown';
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    // Steam Store product pages only
    if (host === 'store.steampowered.com' || host.endsWith('.steampowered.com')) {
      const steamAppMatch = url.pathname.match(/^\/app\/(\d+)(?:\/|$)/i);
      if (steamAppMatch) {
        return 'steam';
      }
    }

    // Google Play Store
    if (host === 'play.google.com' || host.startsWith('play.google.')) {
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
      (host === 'www.google.com' || host === 'maps.google.com' || host.endsWith('.google.com') || host.endsWith('.google.com.ph')) &&
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
  const isLoggedIn = !!currentUser;

  const [theme, setTheme] = useState(() => localStorage.getItem('voxreview-theme') || 'light');
  const [authToastMessage, setAuthToastMessage] = useState('');
  const [activeTab, setActiveTab] = useState('analyze');
  const [isSiteUnsupported, setIsSiteUnsupported] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('idle');

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

  const [currentSessionId, setCurrentSessionId] = useState(null);

  const syncScrapeData = (data) => {
    if (!data) return;
    if (data.sessionId && data.sessionId !== currentSessionId) {
      // New session detected: clear all old product data first
      setCurrentSessionId(data.sessionId);
      setAnalysisStatus('idle');
      setDetectedPlatform('');
      setScrapedIsProductPage(false);
      setScrapedProductTitle(null);
      setScrapedCategory(null);
      setScrapedRating(null);
      setScrapedProductImage(null);
      setScrapedReviews([]);
      setScrapedHasError(false);
      setScrapedErrorMessage('');
    }
    if (data.platform) setDetectedPlatform(data.platform);
    if (data.isProductPage !== undefined) setScrapedIsProductPage(data.isProductPage);
    if (data.productTitle) setScrapedProductTitle(data.productTitle);
    if (data.category) setScrapedCategory(data.category);
    if (data.rating) setScrapedRating(data.rating);
    if (data.productImage) setScrapedProductImage(data.productImage);
    if (Array.isArray(data.reviews)) setScrapedReviews(data.reviews);
    if (data.hasError !== undefined) setScrapedHasError(!!data.hasError);
    if (data.errorMessage) setScrapedErrorMessage(data.errorMessage);
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
    // 1. Check active tab URL directly — this is the AUTHORITATIVE source
    //    for whether the current site is supported. Storage-based status is
    //    secondary and must not override a positive URL detection.
    let urlBasedPlatform = 'unknown';

    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabObj = tabs?.[0];
        const activeUrl = activeTabObj?.url || '';
        urlBasedPlatform = detectPlatformFromUrl(activeUrl);

        if (urlBasedPlatform === 'unknown') {
          setIsSiteUnsupported(true);
        } else {
          // URL says this is a supported platform — trust it unconditionally
          setIsSiteUnsupported(false);
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      // 2. Initial load from storage on popup mount
      chrome.storage.local.get(['voxreviewLastScrape', 'voxreviewSiteStatus', 'voxreview_auth_session'], (result) => {
        console.log('Popup loaded storage:', result?.voxreviewLastScrape);
        syncScrapeData(result?.voxreviewLastScrape);

        const siteStatus = result?.voxreviewSiteStatus;
        // Only apply the stored unsupported flag if the URL-based check
        // didn't already determine this is a supported site.
        // Since chrome.tabs.query is async, urlBasedPlatform may still be
        // 'unknown' at this point if the tabs callback hasn't fired yet.
        // In that case, we defer to the storage value — but it will be
        // corrected when the tabs callback fires (which sets the
        // authoritative value).
        if (siteStatus?.unsupported === true) {
          setIsSiteUnsupported((prev) => {
            // If the URL check has already set it to false, keep it false
            return prev;
          });
        } else if (siteStatus?.unsupported === false) {
          setIsSiteUnsupported(false);
        }

        // Synchronize auth session from chrome.storage.local
        if (result?.voxreview_auth_session) {
          const authSession = result.voxreview_auth_session;
          if (authSession?.user) {
            authService.setSession(authSession);
            setCurrentUser(authSession.user);
          }
        } else if (result?.voxreview_auth_session === null) {
          authService.logout();
          setCurrentUser(null);
        }
      });

      // 3. Real-time listener: sync UI automatically when background.js or web app updates storage
      const handleStorageChange = (changes, areaName) => {
        if (areaName !== 'local') return;

        // Synchronize auth session state automatically in real-time
        if (changes.voxreview_auth_session) {
          const newSession = changes.voxreview_auth_session.newValue;
          if (newSession && newSession.user) {
            authService.setSession(newSession);
            setCurrentUser(newSession.user);
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
          // If we just received valid scrape data for a known platform,
          // this is a supported site — clear the unsupported flag.
          if (newScrape?.platform && newScrape.platform !== 'unknown') {
            setIsSiteUnsupported(false);
          }
        }

        if (changes.voxreviewSiteStatus) {
          const newStatus = changes.voxreviewSiteStatus.newValue;
          if (newStatus?.unsupported === true) {
            setIsSiteUnsupported(true);
          } else if (newStatus?.unsupported === false) {
            setIsSiteUnsupported(false);
          }
        }
      };

      if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    }
  }, [currentSessionId]);

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

  const handleAnalyzeClick = () => {
    if (analysisStatus === 'analyzing') return;
    setAnalysisStatus('analyzing');
    setTimeout(() => setAnalysisStatus('completed'), 1800);
  };

  const handleClearAnalysis = () => setAnalysisStatus('idle');

  // Log in / Sign up redirects to the existing Web Application authentication routes
  const handleOpenLogin = () => openWebAppAuth('/login');
  const handleOpenRegister = () => openWebAppAuth('/register');

  // Logout clears session and notifies extension to return to Guest Mode
  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setAuthToastMessage('');
  };

  const handleSelectSavedItem = () => {
    setActiveTab('analyze');
    setAnalysisStatus('completed');
  };

  // Manual rescan — tells the content script to re-run the scraper
  const [isRescanning, setIsRescanning] = useState(false);
  const handleRescanPage = () => {
    if (isRescanning) return;
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    setIsRescanning(true);
    chrome.runtime.sendMessage({ type: 'rescanPage' }, () => {
      // Ignore lastError — popup auto-updates via storage.onChanged
      setTimeout(() => setIsRescanning(false), 1200);
    });
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
                <UnsupportedSiteView />
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
              theme={theme}
              onThemeToggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            />
          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}
