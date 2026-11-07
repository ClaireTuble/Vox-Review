import { useState, useEffect } from 'react';
import {
  Globe,
  CheckCircle2,
  Activity,
  WifiOff,
  Loader2,
  Store,
  Smartphone,
  Gamepad2,
  ArrowRight,
} from 'lucide-react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopActions from '../components/TopActions.jsx';
import {
  fetchPlatformHealth,
  togglePlatformActive,
  getCachedPlatformHealth,
  FALLBACK_PLATFORMS,
  filterSupportedPlatforms,
} from '../data/platforms.js';
import PlatformDisableConfirmationModal from '../components/PlatformDisableConfirmationModal.jsx';
import authService from '../../services/authService.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/responsive.css';
import '../css/settings.css';

const PLATFORM_META = {
  shopee: {
    icon: Store,
    domain: 'shopee.ph',
    category: 'E-Commerce',
    description: 'E-commerce product reviews and seller ratings on Shopee marketplace.',
  },
  lazada: {
    icon: Store,
    domain: 'lazada.com.ph',
    category: 'E-Commerce',
    description: 'Product reviews and ratings from Lazada online shopping pages.',
  },
  googleplay: {
    icon: Smartphone,
    domain: 'play.google.com',
    category: 'Mobile Apps',
    description: 'Mobile application reviews and ratings on Google Play Store.',
  },
  steam: {
    icon: Gamepad2,
    domain: 'store.steampowered.com',
    category: 'Gaming',
    description: 'Game reviews, user recommendations, and player feedback on Steam.',
  },
};

const HEALTH_POLL_INTERVAL = 30_000;

export default function PlatformSettings({ activeTab, setActiveTab, onSignOut }) {
  const cachedData = getCachedPlatformHealth();
  const [platforms, setPlatforms] = useState(filterSupportedPlatforms(cachedData || FALLBACK_PLATFORMS).map((platform) => (
    typeof platform.is_active === 'boolean'
      ? platform
      : { ...platform, platformStatus: 'Unknown', is_active: undefined }
  )));
  const [loading, setLoading] = useState(!cachedData);
  const [toggleLoading, setToggleLoading] = useState({});
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [platformPendingDisable, setPlatformPendingDisable] = useState(null);
  const currentUser = authService.getCurrentSuperAdminUser();
  const displayName = currentUser?.user_metadata?.full_name
    || currentUser?.user_metadata?.name
    || currentUser?.user_metadata?.username
    || currentUser?.email;
  const profileUser = {
    name: typeof displayName === 'string' && displayName.trim() ? displayName : 'Name not provided',
    email: typeof currentUser?.email === 'string' && currentUser.email.trim()
      ? currentUser.email
      : 'Email not provided',
  };

  const getPlatformCode = (platform) => platform.platform || ({
    Shopee: 'shopee',
    Lazada: 'lazada',
    'Google Play Store': 'googleplay',
    Steam: 'steam',
  }[platform.name]);

  const triggerNotice = (msg, type = 'success') => {
    setActionNotice({ msg, type });
    setTimeout(() => setActionNotice(null), 3500);
  };

  const updatePlatformAvailability = async (platform, nextIsActive, confirmationPassword = null) => {
    const platformCode = getPlatformCode(platform);
    if (!platformCode || toggleLoading[platform.name]) return;
    setToggleLoading((curr) => ({ ...curr, [platform.name]: true }));
    try {
      const updated = await togglePlatformActive(
        platformCode,
        null,
        nextIsActive,
        confirmationPassword,
      );
      setPlatforms((prev) => prev.map((p) => {
        if (getPlatformCode(p) === platformCode || p.name === platform.name) {
          return {
            ...p,
            platformStatus: updated.platformStatus || (nextIsActive ? 'Active' : 'Disabled'),
            is_active: updated.is_active !== undefined ? updated.is_active : nextIsActive,
          };
        }
        return p;
      }));
      const statusMessage = `${platform.name} is now ${nextIsActive ? 'Active (available for scraping & analysis)' : 'Disabled (analysis blocked)'}`;
      triggerNotice(
        updated.auditRecorded === false
          ? `${statusMessage}, but its audit event could not be saved.`
          : statusMessage,
        updated.auditRecorded === false ? 'error' : (nextIsActive ? 'success' : 'warning')
      );
      if (!nextIsActive) setPlatformPendingDisable(null);
    } catch (err) {
      throw new Error(`Failed to update ${platform.name}: ${err.message}`, { cause: err });
    } finally {
      setToggleLoading((curr) => {
        const next = { ...curr };
        delete next[platform.name];
        return next;
      });
    }
  };

  const handleTogglePlatform = async (platform) => {
    if (!backendAvailable || typeof platform.is_active !== 'boolean') return;
    const currentIsActive = platform.is_active;
    if (currentIsActive) {
      setPlatformPendingDisable(platform);
      return;
    }

    try {
      await updatePlatformAvailability(platform, true);
    } catch (err) {
      console.warn('VoxReview: Toggle platform status failed:', err.message);
      triggerNotice(err.message, 'error');
    }
  };

  const confirmDisablePlatform = async (confirmationPassword) => {
    if (!platformPendingDisable) return;
    await updatePlatformAvailability(platformPendingDisable, false, confirmationPassword);
  };

  useEffect(() => {
    let mounted = true;

    const loadHealth = async () => {
      try {
        const data = await fetchPlatformHealth();
        if (mounted) {
          if (Array.isArray(data) && data.length > 0) {
            setPlatforms(filterSupportedPlatforms(data).map((platform) => (
              typeof platform.is_active === 'boolean'
                ? platform
                : { ...platform, platformStatus: 'Unknown', is_active: undefined }
            )));
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

  const totalPlatforms = platforms.length;
  const activePlatformsCount = platforms.filter((p) => p.is_active === true).length;
  const disabledPlatformsCount = platforms.filter((p) => p.is_active === false).length;
  const unknownPlatformsCount = totalPlatforms - activePlatformsCount - disabledPlatformsCount;

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Platform Settings"
          subtitle="Manage which supported platforms are available for review analysis."
          user={profileUser}
          onNavigate={setActiveTab}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="Platform Availability & Management"
              subtitle="Enable or disable supported platforms to control scraper and analysis availability across the system."
            />

            {/* Notification Toast */}
            {actionNotice && (
              <div className={`settings-notice-toast ${actionNotice.type === 'error' ? 'notice-error' : actionNotice.type === 'warning' ? 'notice-warning' : 'notice-success'}`}>
                <CheckCircle2 size={15} />
                <span>{actionNotice.msg}</span>
              </div>
            )}

            {/* Backend connectivity warning */}
            {!backendAvailable && (
              <div className="health-warning-banner">
                <WifiOff size={15} />
                <span>Unable to reach platform management service. Displayed values may be last known; changes are disabled until the service is available.</span>
              </div>
            )}

            {/* Management Overview Summary Bar */}
            <div className="platform-mgmt-summary-bar">
              <div className="mgmt-metric-badge">
                <span className="metric-num">{totalPlatforms}</span>
                <span className="metric-label">Total Platforms</span>
              </div>
              <div className="mgmt-metric-badge active-badge">
                <span className="metric-num">{activePlatformsCount}</span>
                <span className="metric-label">Active</span>
              </div>
              <div className="mgmt-metric-badge disabled-badge">
                <span className="metric-num">{disabledPlatformsCount}</span>
                <span className="metric-label">Disabled</span>
              </div>
              <div className="mgmt-metric-badge">
                <span className="metric-num">{unknownPlatformsCount}</span>
                <span className="metric-label">Unknown</span>
              </div>

              <div className="mgmt-health-cta">
                <div className="mgmt-cta-text">
                  <Activity size={15} className="cta-icon" />
                  <span>Looking for real-time pipeline telemetry &amp; diagnostics?</span>
                </div>
                <button
                  type="button"
                  className="mgmt-goto-health-btn"
                  onClick={() => setActiveTab('platforms')}
                >
                  <span>View Platform Health</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="health-loading-state">
                <Activity size={18} className="spin-icon" />
                <span>Loading platform configuration…</span>
              </div>
            )}

            {/* Platforms Management Grid */}
            <div className="platform-mgmt-grid">
              {platforms.map((platform) => {
                const code = getPlatformCode(platform);
                const meta = PLATFORM_META[code] || {
                  icon: Globe,
                  domain: platform.domain || 'voxreview.internal',
                  category: platform.category || 'General',
                  description: 'Supported platform integration for review extraction.',
                };
                const PlatformIcon = meta.icon;
                const isToggling = !!toggleLoading[platform.name];
                const availabilityKnown = typeof platform.is_active === 'boolean';
                const isActive = platform.is_active === true;
                const rawHealth = platform.scrapingStatus || platform.status || 'Unavailable';

                return (
                  <div
                    key={platform.name}
                    className={`platform-mgmt-card ${!availabilityKnown ? 'is-unknown' : isActive ? 'is-active' : 'is-disabled'}`}
                  >
                    {/* Card Top: Icon, Name, Domain, Category */}
                    <div className="mgmt-card-header">
                      <div className="mgmt-identity-group">
                        <div className={`mgmt-icon-box ${isActive ? 'icon-active' : 'icon-disabled'}`}>
                          <PlatformIcon size={20} />
                        </div>
                        <div className="mgmt-name-stack">
                          <div className="mgmt-title-row">
                            <h4 className="mgmt-platform-name">{platform.name}</h4>
                            <span className="mgmt-cat-pill">{platform.category || meta.category}</span>
                          </div>
                          <span className="mgmt-domain-text">{platform.domain || meta.domain}</span>
                        </div>
                      </div>
                    </div>

                    {/* Platform description */}
                    <p className="mgmt-card-desc">{meta.description}</p>

                    {/* Platform Availability Toggle Box */}
                    <div className="mgmt-availability-box">
                      <div className="mgmt-availability-info">
                        <span className="mgmt-control-label">Platform Availability</span>
                        <div className="mgmt-status-line">
                          <span className={`mgmt-status-indicator ${!availabilityKnown ? '' : isActive ? 'status-dot-active' : 'status-dot-disabled'}`} />
                          <span className={`mgmt-status-text ${!availabilityKnown ? '' : isActive ? 'text-active' : 'text-disabled'}`}>
                            {!availabilityKnown ? 'Unknown' : isActive ? 'Active' : 'Disabled'}
                          </span>
                          <span className="mgmt-status-subtext">
                            {!availabilityKnown
                              ? '• Live availability configuration is unavailable'
                              : isActive
                                ? '• Available for user scraping & analysis'
                                : '• Blocked from scraping & analysis'}
                          </span>
                        </div>
                      </div>

                      {/* Functional Toggle Switch Button */}
                      <button
                        type="button"
                        className={`mgmt-toggle-switch ${isActive ? 'on' : 'off'}`}
                        onClick={() => handleTogglePlatform(platform)}
                        disabled={isToggling || !backendAvailable || !availabilityKnown}
                        title={`Click to ${isActive ? 'Disable' : 'Enable'} ${platform.name}`}
                        aria-label={`Toggle ${platform.name} availability`}
                      >
                        {isToggling ? (
                          <Loader2 size={13} className="spin-icon" />
                        ) : (
                          <span className="mgmt-toggle-thumb" />
                        )}
                        <span className="mgmt-toggle-text">
                          {isToggling ? 'Updating…' : !availabilityKnown ? 'Unknown' : (isActive ? 'Active' : 'Disabled')}
                        </span>
                      </button>
                    </div>

                    {/* Compact Card Footer: Health badge + View Health Details action */}
                    <div className="mgmt-card-footer">
                      <div className="mgmt-health-compact">
                        <span className="mgmt-health-label">Health Status:</span>
                        <span className={`mgmt-health-pill health-${rawHealth.toLowerCase()}`}>
                          <span className="health-dot" />
                          {rawHealth === 'Working' ? 'Operational' : rawHealth}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="mgmt-view-health-btn"
                        onClick={() => setActiveTab('platforms')}
                        title={`View detailed health diagnostics for ${platform.name}`}
                      >
                        <span>View Health Details</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      </main>

      {platformPendingDisable && (
        <PlatformDisableConfirmationModal
          platformName={platformPendingDisable.name}
          onCancel={() => setPlatformPendingDisable(null)}
          onConfirm={confirmDisablePlatform}
        />
      )}
    </div>
  );
}
