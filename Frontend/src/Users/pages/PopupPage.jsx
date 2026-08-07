import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../../services/authService.js';
import Header from '../components/Header.jsx';
import DetectedPageCard from '../components/DetectedPageCard.jsx';
import AnalysisResults from '../components/AnalysisResults.jsx';
import SavedAnalysesView from '../components/SavedAnalysesView.jsx';
import ProfileView from '../components/ProfileView.jsx';
import BottomNavBar from '../components/BottomNavBar.jsx';
import '../css/PopupPage.css';

export default function PopupPage() {
  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();
  const isLoggedIn = !!currentUser;

  const [activeTab, setActiveTab]         = useState('analyze');
  const [analysisStatus, setAnalysisStatus] = useState('idle');

  // Scrape data read from chrome.storage.local (set by background.js)
  const [detectedPlatform, setDetectedPlatform]       = useState('shopee');
  const [scrapedProductTitle, setScrapedProductTitle] = useState(null);
  const [scrapedCategory, setScrapedCategory]         = useState(null);
  const [scrapedRating, setScrapedRating]             = useState(null);
  const [scrapedProductImage, setScrapedProductImage] = useState(null);
  const [scrapedReviews, setScrapedReviews]           = useState([]);

  const [currentSessionId, setCurrentSessionId]     = useState(null);

  const syncScrapeData = (data) => {
    if (!data) return;
    if (data.sessionId && data.sessionId !== currentSessionId) {
      setCurrentSessionId(data.sessionId);
      setAnalysisStatus('idle'); // reset analysis state on new session
    }
    if (data.platform)     setDetectedPlatform(data.platform);
    if (data.productTitle) setScrapedProductTitle(data.productTitle);
    if (data.category)     setScrapedCategory(data.category);
    if (data.rating)       setScrapedRating(data.rating);
    if (data.productImage) setScrapedProductImage(data.productImage);
    if (Array.isArray(data.reviews)) setScrapedReviews(data.reviews);
  };

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      // 1. Initial load from storage on popup mount
      chrome.storage.local.get(['voxreviewLastScrape'], (result) => {
        console.log('Popup loaded storage:', result?.voxreviewLastScrape);
        syncScrapeData(result?.voxreviewLastScrape);
      });

      // 2. Real-time listener: sync UI automatically when background.js updates storage
      const handleStorageChange = (changes, areaName) => {
        if (areaName === 'local' && changes.voxreviewLastScrape) {
          console.log('Popup storage changed:', changes.voxreviewLastScrape.newValue);
          syncScrapeData(changes.voxreviewLastScrape.newValue);
        }
      };

      if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    }
  }, [currentSessionId]);

  const platformLabel = detectedPlatform
    ? detectedPlatform.charAt(0).toUpperCase() + detectedPlatform.slice(1)
    : 'Shopee';

  const handleAnalyzeClick = () => {
    if (analysisStatus === 'analyzing') return;
    setAnalysisStatus('analyzing');
    setTimeout(() => setAnalysisStatus('completed'), 1800);
  };

  const handleClearAnalysis = () => setAnalysisStatus('idle');

  // Guest tries to save — redirect to login
  const handleSaveRedirect = () => navigate('/login');

  // Logout and go back to landing
  const handleLogout = () => {
    authService.logout();
    navigate('/');
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
          userName={currentUser?.name}
          onLogout={handleLogout}
          onLoginClick={() => navigate('/login')}
        />

        {/* Guest Notice Bar */}
        {!isLoggedIn && (
          <div className="popup-guest-bar">
            <span>Guest Mode — AI Analysis Active</span>
            <button onClick={() => navigate('/login')}>Sign In to Save</button>
          </div>
        )}

        {/* Main Scroll Area */}
        <div className="popup-stage">
          {activeTab === 'analyze' && (
            <>
              <DetectedPageCard
                platform={detectedPlatform}
                pageTitle={scrapedProductTitle || 'Detecting Product...'}
                category={scrapedCategory || 'Product Reviews'}
                rating={scrapedRating ? String(scrapedRating) : '4.8'}
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
                onSaveRedirect={handleSaveRedirect}
                onClearAnalysis={handleClearAnalysis}
                platform={detectedPlatform}
              />
            </>
          )}

          {activeTab === 'saved' && (
            <SavedAnalysesView
              isLoggedIn={isLoggedIn}
              onLoginClick={() => navigate('/login')}
              onSelectSaved={handleSelectSavedItem}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              isLoggedIn={isLoggedIn}
              currentUser={currentUser}
              onLoginClick={() => navigate('/login')}
              onLogout={handleLogout}
            />
          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}
