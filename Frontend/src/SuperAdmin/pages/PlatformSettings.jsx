import { useState } from 'react';
import { Globe, Sliders, CheckCircle2, Clock, Activity, AlertTriangle, Check, AlertCircle } from 'lucide-react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopActions from '../components/TopActions.jsx';
import { mockPlatforms } from '../data/platforms.js';
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

export default function PlatformSettings({ activeTab, setActiveTab, onSignOut }) {
  const [platforms, setPlatforms] = useState(mockPlatforms);
  const [actionNotice, setActionNotice] = useState(null);

  const triggerNotice = (msg) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handlePlatformStatusChange = (platformName, newStatus) => {
    setPlatforms((prev) =>
      prev.map((p) => (p.name === platformName ? { ...p, platformStatus: newStatus } : p))
    );
    triggerNotice(`Updated ${platformName} status to ${newStatus} (UI demo state).`);
  };

  const handleNlpToggle = (platformName) => {
    setPlatforms((prev) =>
      prev.map((p) =>
        p.name === platformName
          ? { ...p, nlpStatus: p.nlpStatus === 'Enabled' ? 'Disabled' : 'Enabled' }
          : p
      )
    );
    triggerNotice(`Toggled NLP status for ${platformName} (UI demo state).`);
  };

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Platform Settings"
          subtitle="Configure code-managed platform integration settings, scraper limits, and NLP analysis parameters."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="Platform Configurations & Options"
              subtitle="Code-managed settings for Shopee, Lazada, Google Maps, and Google Play Store."
            />

            {/* Notification Toast */}
            {actionNotice && (
              <div className="settings-notice-toast">
                <CheckCircle2 size={15} />
                <span>{actionNotice}</span>
              </div>
            )}

            {/* Platforms Configuration Grid */}
            <div className="section-title-group">
              <h3>
                <Sliders size={17} className="title-icon" />
                Integration Parameters
              </h3>
              <p className="section-desc">
                Review scraping limits, status controls, and NLP engine parameters per platform.
              </p>
            </div>

            <div className="platform-settings-grid">
              {platforms.map((platform) => (
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
                    {/* Platform Status Selector */}
                    <div className="setting-field">
                      <label>Platform Status</label>
                      <select
                        value={platform.platformStatus}
                        onChange={(e) => handlePlatformStatusChange(platform.name, e.target.value)}
                        className="setting-select"
                      >
                        <option value="Active">Active</option>
                        <option value="Disabled">Disabled</option>
                        <option value="Maintenance">Maintenance</option>
                      </select>
                    </div>

                    {/* Review Scraping Status */}
                    <div className="setting-field">
                      <label>Scraping Status</label>
                      <span
                        className={`status-pill status-${platform.scrapingStatus.toLowerCase()}`}
                      >
                        {platform.scrapingStatus}
                      </span>
                    </div>

                    {/* NLP Analysis Toggle */}
                    <div className="setting-field">
                      <label>NLP Analysis</label>
                      <button
                        type="button"
                        className={`toggle-switch-btn ${platform.nlpStatus === 'Enabled' ? 'on' : 'off'}`}
                        onClick={() => handleNlpToggle(platform.name)}
                      >
                        <span className="toggle-slider" />
                        <span className="toggle-text">{platform.nlpStatus}</span>
                      </button>
                    </div>

                    {/* Review Processing Limit */}
                    <div className="setting-field">
                      <label>Max Processing Limit</label>
                      <span className="limit-badge">{platform.reviewLimit} reviews / req</span>
                    </div>
                  </div>

                  {/* Diagnostic Summary Line */}
                  <div className="setting-diag-summary">
                    <span>
                      <strong>Last Check:</strong> {platform.lastChecked}
                    </span>
                    <span>
                      <strong>Last Success:</strong> {platform.lastSuccessfulCheck}
                    </span>
                    <span>
                      <strong>Errors:</strong>{' '}
                      <span className={platform.errorCount > 0 ? 'text-error' : 'text-success'}>
                        {platform.errorCount}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
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
                const errorStageIndex = PIPELINE_STAGES.indexOf(platform.errorStage);

                return (
                  <div
                    key={`diag-${platform.name}`}
                    className={`platform-diag-card ${hasError ? 'diag-warning' : 'diag-healthy'}`}
                  >
                    <div className="diag-card-header">
                      <div className="diag-platform-identity">
                        <Globe size={16} />
                        <strong>{platform.name}</strong>
                        <span className="diag-cat">({platform.category})</span>
                      </div>

                      <div className="diag-header-status">
                        <span className="diag-check-time">
                          <Clock size={12} /> Last checked: {platform.lastChecked}
                        </span>
                        <span
                          className={`diag-status-pill ${hasError ? 'pill-warning' : 'pill-healthy'}`}
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
                        <span className="diag-label">Last Successful Operation</span>
                        <span className="diag-val">{platform.lastSuccessfulCheck}</span>
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
