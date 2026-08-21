import { useState, useEffect } from 'react';
import { Globe, Sliders, CheckCircle2, Clock, Activity, AlertTriangle, Check, AlertCircle, Minus, WifiOff, Loader2 } from 'lucide-react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopActions from '../components/TopActions.jsx';
import { fetchPlatformHealth, getCachedPlatformHealth, FALLBACK_PLATFORMS } from '../data/platforms.js';
import { mockCurrentUser } from '../data/users.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/responsive.css';

const PIPELINE_STAGES = [
  'Platform Detection',
  'Page/Product Detection',
  'Review Section Detection',
  'Review Extraction',
  'Data Normalization',
  'NLP Analysis',
];

const HEALTH_POLL_INTERVAL = 30_000;

export default function PlatformSettings({ activeTab, setActiveTab, onSignOut }) {
  const cachedData = getCachedPlatformHealth();
  const [platforms, setPlatforms] = useState(cachedData || FALLBACK_PLATFORMS);
  const [loading, setLoading] = useState(!cachedData);
  const [platformLoading, setPlatformLoading] = useState({});
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [actionNotice, setActionNotice] = useState(null);

  const triggerNotice = (msg) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  useEffect(() => {
    let mounted = true;

    const loadHealth = async () => {
      if (mounted) {
        const loadingMap = {};
        platforms.forEach((p) => { loadingMap[p.name] = true; });
        setPlatformLoading(loadingMap);
      }

      try {
        const data = await fetchPlatformHealth();
        if (mounted) {
          setPlatforms(data);
          setBackendAvailable(true);
        }
      } catch (err) {
        console.warn('VoxReview: Health fetch failed:', err.message);
        if (mounted) setBackendAvailable(false);
      } finally {
        if (mounted) {
          setLoading(false);
          setPlatformLoading({});
        }
      }
    };

    loadHealth();
    const interval = setInterval(loadHealth, HEALTH_POLL_INTERVAL);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Platform Settings"
          subtitle="Monitor code-managed platform integration settings, scraper limits, and NLP analysis parameters."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="Platform Configurations & Options"
              subtitle="Code-managed settings for Shopee, Lazada, Google Maps, Google Play Store, and Steam."
            />

            {/* Notification Toast */}
            {actionNotice && (
              <div className="settings-notice-toast">
                <CheckCircle2 size={15} />
                <span>{actionNotice}</span>
              </div>
            )}

            {/* Backend connectivity warning */}
            {!backendAvailable && (
              <div className="health-warning-banner">
                <WifiOff size={15} />
                <span>Unable to reach health monitoring service. Showing last known state.</span>
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="health-loading-state">
                <Activity size={18} className="spin-icon" />
                <span>Loading platform health data…</span>
              </div>
            )}

            {/* Platforms Configuration Grid */}
            <div className="section-title-group">
              <h3>
                <Sliders size={17} className="title-icon" />
                Integration Parameters
              </h3>
              <p className="section-desc">
                Review scraping status, NLP analysis state, and diagnostic parameters per platform.
              </p>
            </div>

            <div className="platform-settings-grid">
              {platforms.map((platform) => {
                const isPlatformChecking = !!platformLoading[platform.name];
                const isNlpNotImplemented = platform.nlpStatus === 'Not Implemented';

                return (
                  <div key={platform.name} className="platform-setting-card">
                    <div className="setting-card-top">
                      <div className="platform-title-row">
                        <Globe size={18} className="platform-card-icon" />
                        <div>
                          <h4 className="setting-platform-name">{platform.name}</h4>
                          <span className="setting-platform-domain">{platform.domain}</span>
                        </div>
                      </div>

                      <span className="platform-cat-tag">{platform.category}</span>
                    </div>

                    <div className="setting-controls-row">
                      {/* Platform Status (read-only from real data) */}
                      <div className="setting-field">
                        <label>Platform Status</label>
                        <span className={`status-pill status-${(platform.platformStatus || 'Active').toLowerCase()}`}>
                          {platform.platformStatus || 'Active'}
                        </span>
                      </div>

                      {/* Review Scraping Status (real data with loading spinner) */}
                      <div className="setting-field">
                        <label>Scraping Status</label>
                        {isPlatformChecking ? (
                          <span
                            className="status-pill"
                            style={{
                              background: 'rgba(59,130,246,0.12)',
                              color: '#60a5fa',
                              border: '1px solid rgba(59,130,246,0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            <Loader2 size={12} className="spin-icon" />
                            Checking...
                          </span>
                        ) : (
                          <span
                            className={`status-pill status-${(platform.scrapingStatus || 'Unavailable').toLowerCase()}`}
                          >
                            {platform.scrapingStatus || 'Unavailable'}
                          </span>
                        )}
                      </div>

                      {/* NLP Analysis — Not Implemented badge */}
                      <div className="setting-field">
                        <label>NLP Analysis</label>
                        {isNlpNotImplemented ? (
                          <span className="status-pill status-not-implemented">
                            <Minus size={12} style={{ marginRight: '4px' }} />
                            Not Implemented
                          </span>
                        ) : (
                          <span className={`status-pill status-${(platform.nlpStatus || 'Not Implemented').toLowerCase().replace(/\s+/g, '-')}`}>
                            {platform.nlpStatus}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Diagnostic Summary Line */}
                    <div className="setting-diag-summary">
                      <span>
                        <strong>Last Check:</strong> {platform.lastChecked || 'Never'}
                      </span>
                      <span>
                        <strong>Last Success:</strong> {platform.lastSuccessfulCheck || 'Never'}
                      </span>
                      <span>
                        <strong>Errors:</strong>{' '}
                        <span className={platform.errorCount > 0 ? 'text-error' : 'text-success'}>
                          {platform.errorCount}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Diagnostics Sub-Section */}
            <div className="section-title-group" style={{ marginTop: '28px' }}>
              <h3>
                <Activity size={17} className="title-icon" />
                Pipeline Diagnostics Summary
              </h3>
              <p className="section-desc">
                Real-time telemetry showing pipeline stages and human-readable diagnostic messages.
              </p>
            </div>

            <div className="platform-diagnostics-list">
              {platforms.map((platform) => {
                const hasError = !!platform.errorStage;
                const isUnavailable = platform.scrapingStatus === 'Unavailable';
                const errorStageIndex = PIPELINE_STAGES.indexOf(platform.errorStage);

                return (
                  <div
                    key={`diag-${platform.name}`}
                    className={`platform-diag-card ${hasError ? 'diag-warning' : isUnavailable ? 'diag-unavailable' : 'diag-healthy'}`}
                  >
                    <div className="diag-card-header">
                      <div className="diag-platform-identity">
                        <Globe size={16} />
                        <strong>{platform.name}</strong>
                        <span className="diag-cat">({platform.category})</span>
                      </div>

                      <div className="diag-header-status">
                        <span className="diag-check-time">
                          <Clock size={12} /> Last checked: {platform.lastChecked || 'Never'}
                        </span>
                        <span
                          className={`diag-status-pill ${hasError ? 'pill-warning' : isUnavailable ? 'pill-unavailable' : 'pill-healthy'}`}
                        >
                          Status: {platform.status}
                        </span>
                      </div>
                    </div>

                    {/* Diagnostics Details Grid */}
                    <div className="diag-details-grid">
                      <div>
                        <span className="diag-label">Current Status</span>
                        <span className="diag-val">{platform.status}</span>
                      </div>
                      <div>
                        <span className="diag-label">NLP Status</span>
                        <span className="diag-val" style={{ color: '#6B7280' }}>{platform.nlpStatus || 'Not Implemented'}</span>
                      </div>
                      <div>
                        <span className="diag-label">Last Successful Operation</span>
                        <span className="diag-val">{platform.lastSuccessfulCheck || 'Never'}</span>
                      </div>
                      <div>
                        <span className="diag-label">Error Count</span>
                        <span className="diag-val">{platform.errorCount}</span>
                      </div>
                      <div>
                        <span className="diag-label">Error Stage</span>
                        <span className="diag-val highlight-stage">
                          {platform.errorStage || 'N/A (Operational)'}
                        </span>
                      </div>
                    </div>

                    {/* Diagnostic Error Box */}
                    {hasError ? (
                      <div className="diag-error-box">
                        <div className="diag-error-title">
                          <AlertTriangle size={14} />
                          <span>
                            Diagnostic Alert &mdash; Stage: <strong>{platform.errorStage}</strong>
                          </span>
                        </div>
                        <p className="diag-error-msg">&ldquo;{platform.errorMessage}&rdquo;</p>
                      </div>
                    ) : isUnavailable ? (
                      <div className="diag-healthy-box" style={{ borderColor: 'rgba(107,114,128,0.2)', color: '#9CA3AF' }}>
                        <Minus size={14} />
                        <span>No health reports received yet. Awaiting first scraping event.</span>
                      </div>
                    ) : (
                      <div className="diag-healthy-box">
                        <Check size={14} />
                        <span>No diagnostic information errors reported. All pipeline stages operational.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
