import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Globe, Activity, Layers, Clock, ShieldCheck, Minus, WifiOff, Loader2 } from 'lucide-react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopActions from '../components/TopActions.jsx';
import { fetchPlatformHealth, requestPlatformHealth, getCachedPlatformHealth, FALLBACK_PLATFORMS } from '../data/platforms.js';
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

const HEALTH_POLL_INTERVAL = 30_000; // 30 seconds

export default function Platforms({ activeTab, setActiveTab, onSignOut }) {
  const cachedData = getCachedPlatformHealth();
  const [platforms, setPlatforms] = useState(cachedData || FALLBACK_PLATFORMS);
  const [loading, setLoading] = useState(!cachedData);
  const [platformLoading, setPlatformLoading] = useState({});
  const [backendAvailable, setBackendAvailable] = useState(true);

  const getPlatformCode = (platform) => platform.platform || ({
    Shopee: 'shopee',
    Lazada: 'lazada',
    'Google Maps': 'google',
    'Google Play Store': 'googleplay',
    Steam: 'steam',
  }[platform.name]);

  const checkPlatformHealth = async (platform) => {
    if (platformLoading[platform.name]) return;
    const platformCode = getPlatformCode(platform);
    if (!platformCode) return;

    setPlatformLoading((current) => ({ ...current, [platform.name]: true }));
    try {
      await requestPlatformHealth(platformCode);
      const refreshedPlatforms = await fetchPlatformHealth();
      setPlatforms(refreshedPlatforms);
      setBackendAvailable(true);
    } catch (err) {
      console.warn('VoxReview: Active health check failed:', err.message);
      setBackendAvailable(false);
      setPlatforms((current) => current.map((item) => (
        item.name === platform.name
          ? { ...item, scrapingStatus: 'Unavailable', status: 'Unavailable' }
          : item
      )));
    } finally {
      setPlatformLoading((current) => {
        const next = { ...current };
        delete next[platform.name];
        return next;
      });
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadHealth = async () => {
      try {
        const data = await fetchPlatformHealth();
        if (mounted) {
          if (Array.isArray(data) && data.length > 0) {
            setPlatforms(data);
          }
          setBackendAvailable(true);
        }
      } catch (err) {
        console.warn('VoxReview: Health fetch failed:', err.message);
        if (mounted) setBackendAvailable(false);
      } finally {
        if (mounted) {
          setLoading(false);
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
          title="Supported Platforms"
          subtitle="Monitor platform integration health, scraping status, and pipeline diagnostics."
          user={mockCurrentUser}
          onNavigate={setActiveTab}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="Platform Health & Scraper Diagnostics"
              subtitle="Real-time status monitoring for VoxReview Chrome Extension integration pipelines."
            />

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

            {/* Standardized Pipeline Overview Legend */}
            <div className="pipeline-legend-card">
              <div className="legend-header">
                <Layers size={16} className="legend-icon" />
                <span className="legend-title">Standardized Error Diagnostic Pipeline</span>
              </div>
              <div className="pipeline-flow-steps">
                {PIPELINE_STAGES.map((stage, idx) => (
                  <div key={stage} className="pipeline-flow-step">
                    <span className="step-num">{idx + 1}</span>
                    <span className="step-name">{stage}</span>
                    {idx < PIPELINE_STAGES.length - 1 && <span className="step-arrow">&rarr;</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="platform-diagnostics-list">
              {platforms.map((platform, index) => {
                const isPlatformChecking = !!platformLoading[platform.name];
                const isError = platform.scrapingStatus === 'Error' || platform.status === 'Error';
                const isWarning = platform.scrapingStatus === 'Warning' || platform.status === 'Warning';
                const isUnavailable = platform.scrapingStatus === 'Unavailable' || platform.status === 'Unavailable';
                const hasDiagnostics = !!(platform.scrapingStatus || platform.lastChecked);
                const errorStageIndex = PIPELINE_STAGES.indexOf(platform.errorStage);

                return (
                  <div
                    key={`${platform.name}-${index}`}
                    className={`platform-health-card ${isPlatformChecking ? 'is-loading' : isError ? 'has-error' : isWarning ? 'has-warning' : isUnavailable ? 'is-unavailable' : 'is-healthy'}`}
                  >
                    {/* Card Top Banner */}
                    <div className="health-card-header">
                      <div className="platform-identity">
                        <span className="platform-health-icon">
                          <Globe size={18} />
                        </span>
                        <div>
                          <h3 className="platform-health-name">{platform.name}</h3>
                          <span className="platform-category-badge">{platform.category || 'General'}</span>
                        </div>
                      </div>

                      <div className="platform-status-badges">
                        <span className="status-badge support-badge">
                          <ShieldCheck size={12} />
                          {platform.supportStatus || 'Supported'}
                        </span>

                        {isPlatformChecking ? (
                          <span
                            className="status-badge scraping-badge"
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
                            <span>Checking...</span>
                          </span>
                        ) : (
                          <span
                            className="status-badge scraping-badge"
                            style={{
                              background: platform.statusBg || 'rgba(107,114,128,0.08)',
                              color: platform.statusColor || '#9CA3AF',
                              border: `1px solid ${platform.statusColor ? platform.statusColor + '4D' : 'rgba(107,114,128,0.3)'}`,
                            }}
                          >
                            {isError ? <AlertCircle size={12} /> : isUnavailable ? <Minus size={12} /> : <CheckCircle2 size={12} />}
                            Scraping: {platform.scrapingStatus || platform.status || 'Unavailable'}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => checkPlatformHealth(platform)}
                          disabled={isPlatformChecking}
                          style={{
                            border: '1px solid rgba(148,163,184,0.35)',
                            borderRadius: '6px',
                            padding: '5px 9px',
                            background: 'transparent',
                            color: 'inherit',
                            cursor: isPlatformChecking ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          {isPlatformChecking && <Loader2 size={12} className="spin-icon" />}
                          {isPlatformChecking ? 'Checking...' : 'Check Health'}
                        </button>
                      </div>
                    </div>

                    {!hasDiagnostics ? (
                      <div className="neutral-diagnostic-state">
                        <Activity size={16} />
                        <span>No diagnostic information available.</span>
                      </div>
                    ) : (
                      <>
                        {/* Key-Value Diagnostics Grid */}
                        <div className="health-metrics-grid">
                          <div className="metric-item">
                            <span className="metric-label">Category</span>
                            <span className="metric-value">{platform.category || 'General'}</span>
                          </div>
                          <div className="metric-item">
                            <span className="metric-label">Support Status</span>
                            <span className="metric-value text-supported">{platform.supportStatus || 'Supported'}</span>
                          </div>
                          <div className="metric-item">
                            <span className="metric-label">Scraping Status</span>
                            <span className={`metric-value ${isError ? 'text-error' : isWarning ? 'text-warning' : isUnavailable ? 'text-muted' : 'text-success'}`}>
                              {platform.scrapingStatus || platform.status || 'Unavailable'}
                            </span>
                          </div>
                          <div className="metric-item">
                            <span className="metric-label">NLP Status</span>
                            <span className="metric-value text-muted">
                              {platform.nlpStatus || 'Not Implemented'}
                            </span>
                          </div>
                          <div className="metric-item">
                            <span className="metric-label">Last Checked</span>
                            <span className="metric-value text-muted">
                              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                              {platform.lastChecked || 'Never'}
                            </span>
                          </div>
                          <div className="metric-item">
                            <span className="metric-label">Last Success</span>
                            <span className="metric-value text-muted">
                              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                              {platform.lastSuccessfulCheck || 'Never'}
                            </span>
                          </div>
                        </div>

                        {/* Error Diagnostic Details Box (if error) */}
                        {isError ? (
                          <div className="error-diagnostic-box">
                            <div className="error-box-header">
                              <AlertCircle size={15} className="error-box-icon" />
                              <span>Error Status: {platform.errorStatus || 'Error Detected'}</span>
                            </div>
                            <div className="error-box-body">
                              <p>
                                <strong>Error Stage:</strong>{' '}
                                <span className="error-stage-pill">{platform.errorStage || 'Unknown Stage'}</span>
                              </p>
                              <p>
                                <strong>Message:</strong> &ldquo;{platform.errorMessage || 'An error occurred during execution.'}&rdquo;
                              </p>
                            </div>
                          </div>
                        ) : isWarning ? (
                          <div className="error-diagnostic-box" style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)' }}>
                            <div className="error-box-header" style={{ color: '#F59E0B' }}>
                              <AlertCircle size={15} className="error-box-icon" />
                              <span>Warning: {platform.errorStage || 'Partial Issue'}</span>
                            </div>
                            <div className="error-box-body">
                              <p>
                                <strong>Stage:</strong>{' '}
                                <span className="error-stage-pill">{platform.errorStage || 'Unknown Stage'}</span>
                              </p>
                              <p>
                                <strong>Message:</strong> &ldquo;{platform.errorMessage || 'A warning condition was detected.'}&rdquo;
                              </p>
                            </div>
                          </div>
                        ) : isUnavailable ? (
                          <div className="healthy-diagnostic-box" style={{ borderColor: 'rgba(107,114,128,0.2)', color: '#9CA3AF' }}>
                            <Minus size={14} />
                            <span>No health reports received yet. Status will update after first scraping event.</span>
                          </div>
                        ) : (
                          <div className="healthy-diagnostic-box">
                            <CheckCircle2 size={14} className="healthy-box-icon" />
                            <span>No diagnostic errors reported across pipeline stages.</span>
                          </div>
                        )}

                        {/* Pipeline Stage Visualizer */}
                        <div className="pipeline-visualizer">
                          <span className="visualizer-title">Pipeline Stage Status</span>
                          <div className="pipeline-stage-nodes">
                            {PIPELINE_STAGES.map((stage, idx) => {
                              let stageState = 'passed';

                              // NLP Analysis is always "not-implemented" until real NLP exists
                              if (stage === 'NLP Analysis') {
                                stageState = 'not-implemented';
                              } else if (isUnavailable) {
                                stageState = 'unavailable';
                              } else if (isError || isWarning) {
                                if (idx === errorStageIndex) stageState = 'failed';
                                else if (idx > errorStageIndex && errorStageIndex >= 0) stageState = 'blocked';
                              }

                              return (
                                <div key={stage} className={`stage-node state-${stageState}`}>
                                  <div className="stage-node-icon">
                                    {stageState === 'passed' && <CheckCircle2 size={12} />}
                                    {stageState === 'failed' && <AlertCircle size={12} />}
                                    {stageState === 'blocked' && <span className="dot-blocked" />}
                                    {stageState === 'not-implemented' && <Minus size={12} />}
                                    {stageState === 'unavailable' && <Minus size={12} />}
                                  </div>
                                  <span className="stage-node-label">{stage}</span>
                                  {stageState === 'not-implemented' && (
                                    <span className="stage-sublabel">Not Implemented</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
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
