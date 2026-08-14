import { CheckCircle2, AlertCircle, Globe, Activity, Layers, Clock, ShieldCheck } from 'lucide-react';
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

export default function Platforms({ activeTab, setActiveTab, onSignOut }) {
  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Supported Platforms"
          subtitle="Monitor platform integration health, scraping status, and pipeline diagnostics."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="Platform Health & Scraper Diagnostics"
              subtitle="Read-only status monitoring for VoxReview Chrome Extension integration pipelines."
            />

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
              {mockPlatforms.map((platform, index) => {
                const isError = platform.scrapingStatus === 'Error' || platform.status === 'Error';
                const hasDiagnostics = !!(platform.scrapingStatus || platform.lastChecked);
                const errorStageIndex = PIPELINE_STAGES.indexOf(platform.errorStage);

                return (
                  <div
                    key={`${platform.name}-${index}`}
                    className={`platform-health-card ${isError ? 'has-error' : 'is-healthy'}`}
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
                        <span
                          className="status-badge scraping-badge"
                          style={{
                            background: isError ? 'rgba(239,68,68,0.14)' : 'rgba(22,163,74,0.14)',
                            color: isError ? '#f87171' : '#4ade80',
                            border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : 'rgba(22,163,74,0.3)'}`,
                          }}
                        >
                          {isError ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                          Scraping: {platform.scrapingStatus || platform.status || 'Working'}
                        </span>
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
                            <span className={`metric-value ${isError ? 'text-error' : 'text-success'}`}>
                              {platform.scrapingStatus || platform.status || 'Working'}
                            </span>
                          </div>
                          <div className="metric-item">
                            <span className="metric-label">Last Checked</span>
                            <span className="metric-value text-muted">
                              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                              {platform.lastChecked || 'N/A'}
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
                              if (isError) {
                                if (idx === errorStageIndex) stageState = 'failed';
                                else if (idx > errorStageIndex) stageState = 'blocked';
                              }

                              return (
                                <div key={stage} className={`stage-node state-${stageState}`}>
                                  <div className="stage-node-icon">
                                    {stageState === 'passed' && <CheckCircle2 size={12} />}
                                    {stageState === 'failed' && <AlertCircle size={12} />}
                                    {stageState === 'blocked' && <span className="dot-blocked" />}
                                  </div>
                                  <span className="stage-node-label">{stage}</span>
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
