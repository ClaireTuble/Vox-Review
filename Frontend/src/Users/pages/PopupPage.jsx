import { useState } from 'react';
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
  const isLoggedIn  = !!currentUser;

  const [activeTab, setActiveTab]         = useState('analyze');
  const [analysisStatus, setAnalysisStatus] = useState('idle');

  // Automatically detected platform from active browser tab (read-only)
  const detectedPlatform = 'amazon';

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
              pageTitle="Sony WH-1000XM5 Wireless Noise Canceling Headphones"
              category="Electronics / Audio"
              rating="4.7"
              reviewsCount="1,420"
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
                  <span>Detected: <strong>Amazon</strong></span>
                </div>
              </div>
            </div>

            <AnalysisResults
              status={analysisStatus}
              isLoggedIn={isLoggedIn}
              onSaveRedirect={handleSaveRedirect}
              onClearAnalysis={handleClearAnalysis}
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
