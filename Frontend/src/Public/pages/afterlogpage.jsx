import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Store, MapPin, Smartphone, Gamepad2, ExternalLink, CheckCircle2, Globe, FileText, Puzzle, Sparkles, Info, Download } from 'lucide-react';
import AuthNavigation from '../components/AuthNavigation.jsx';
import { useVoxLogo } from '../../utils/useVoxLogo.js';
import authService from '../../services/authService.js';
import { getRegularUserAfterAuthSync } from '../../services/authSessionSync.js';
import { getRegularUserAfterAuthSync } from '../../services/authSessionSync.js';
import '../css/AfterLogPage.css';

const VOXREVIEW_EXTENSION_ID = 'docdbeejbfkoidffligmldaebhammafa';
const EXTENSION_PING_TIMEOUT_MS = 1500;

function pingVoxReviewExtension() {
  return new Promise((resolve) => {
    const runtime = globalThis.chrome?.runtime;
    if (typeof runtime?.sendMessage !== 'function') {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (available) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(available);
    };
    const timeoutId = window.setTimeout(
      () => finish(false),
      EXTENSION_PING_TIMEOUT_MS,
    );

    try {
      runtime.sendMessage(
        VOXREVIEW_EXTENSION_ID,
        { type: 'voxreview_extension_ping' },
        (response) => {
          finish(
            !runtime.lastError &&
            response?.ok === true &&
            response.type === 'voxreview_extension_pong',
          );
        },
      );
    } catch {
      finish(false);
    }
  });
}

const SUPPORTED_WEBSITES = [
  {
    name: 'Shopee',
    url: 'https://shopee.ph/',
    description: 'Analyze customer reviews from Shopee product pages.',
    buttonText: 'Open Shopee',
    iconClass: 'shopee',
    Icon: Store,
  },
  {
    name: 'Lazada',
    url: 'https://www.lazada.com.ph/',
    description: 'Analyze customer reviews from Lazada product pages.',
    buttonText: 'Open Lazada',
    iconClass: 'lazada',
    Icon: Store,
  },
  {
    name: 'Google Maps',
    url: 'https://maps.google.com/',
    description: 'Analyze reviews from businesses and places on Google Maps.',
    buttonText: 'Open Google Maps',
    iconClass: 'maps',
    Icon: MapPin,
  },
  {
    name: 'Google Play',
    url: 'https://play.google.com/',
    description: 'Analyze reviews from apps available on Google Play.',
    buttonText: 'Open Google Play',
    iconClass: 'play',
    Icon: Smartphone,
  },
  {
    name: 'Steam',
    url: 'https://store.steampowered.com/',
    description: 'Analyze user reviews from Steam games.',
    buttonText: 'Open Steam',
    iconClass: 'steam',
    Icon: Gamepad2,
  },
];

const USAGE_STEPS = [
  {
    step: 1,
    title: 'Choose one of the supported websites.',
    Icon: Globe,
  },
  {
    step: 2,
    title: 'Open a page that contains reviews.',
    Icon: FileText,
  },
  {
    step: 3,
    title: 'Open the VoxReview browser extension.',
    Icon: Puzzle,
  },
  {
    step: 4,
    title: 'Start your review analysis.',
    Icon: Sparkles,
  },
];

export default function AfterLogPage() {
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser());
  const isAuthenticated = Boolean(currentUser);
  const [extensionStatus, setExtensionStatus] = useState('checking');
  const [isCheckingExtension, setIsCheckingExtension] = useState(false);
  const [extensionCheckAttempt, setExtensionCheckAttempt] = useState(0);
  const logo = useVoxLogo();

  useEffect(() => {
    const handleAuthSync = (event) => {
      const result = getRegularUserAfterAuthSync(
        event,
        currentUser,
        () => authService.getCurrentUser(),
      );
      if (result.handled) setCurrentUser(result.user);
    };

    window.addEventListener('voxreview_auth_sync', handleAuthSync);
    return () => window.removeEventListener('voxreview_auth_sync', handleAuthSync);
  }, [currentUser]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let active = true;
    let checkInProgress = false;

    const checkExtension = async () => {
      if (checkInProgress) return;
      checkInProgress = true;
      setIsCheckingExtension(true);

      try {
        const available = await pingVoxReviewExtension();
        if (!active) return;
        setExtensionStatus(available ? 'available' : 'missing');

        if (available) {
          try {
            const session = JSON.parse(window.localStorage.getItem('user_auth_session') || 'null');
            if (
              session?.user?.id &&
              session.user.role === 'user' &&
              typeof session.token === 'string' &&
              typeof session.refresh_token === 'string'
            ) {
              window.dispatchEvent(new CustomEvent('voxreview_auth_sync', {
                detail: {
                  action: 'session_updated',
                  userId: session.user.id,
                  clearLogoutMarker: true,
                },
              }));
            }
          } catch (error) {
            console.warn('VoxReview: Could not synchronize the active website session to the extension.', {
              code: error?.code || null,
            });
          }
        }
      } catch (error) {
        if (active) {
          setExtensionStatus('missing');
          console.warn('VoxReview: Extension detection could not be completed.', {
            code: error?.code || null,
          });
        }
      } finally {
        checkInProgress = false;
        if (active) setIsCheckingExtension(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkExtension();
    };
    const handleWindowFocus = () => void checkExtension();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    void checkExtension();

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isAuthenticated, extensionCheckAttempt]);

  if (!currentUser) return <Navigate to="/login" replace />;

  return (
    <div className="afterlog-container">
      {/* Background Ambient Glows & Box Grid Texture */}
      <div className="saas-grid-bg" aria-hidden="true" />
      <div className="saas-ambient-glow" aria-hidden="true">
        <div className="glow-purple" />
        <div className="glow-blue" />
      </div>

      {/* Header / Navigation — Authenticated */}
      <AuthNavigation />

      {/* Welcome Section */}
      <main className="afterlog-hero-section">
        <div className="afterlog-hero-content">
          {extensionStatus === 'available' ? (
            <>
              <div className="afterlog-pill-badge">
                <CheckCircle2 size={14} className="badge-icon" />
                <span>Ready to Analyze</span>
              </div>

              <h1 className="afterlog-main-heading">
                Welcome to <span className="gradient-text">VoxReview</span>!
              </h1>

              <p className="afterlog-main-msg">
                You have successfully logged in to VoxReview.
              </p>

              <p className="afterlog-subtext">
                VoxReview is ready to help you analyze reviews and identify the emotions expressed in them. To get started, choose one of our supported websites and open a page containing reviews.
              </p>
            </>
          ) : extensionStatus === 'checking' ? (
            <>
              <div className="afterlog-pill-badge extension-required" role="status" aria-live="polite">
                <Puzzle size={14} className="badge-icon" />
                <span>Checking for Extension</span>
              </div>

              <h1 className="afterlog-main-heading">
                Welcome to <span className="gradient-text">VoxReview</span>!
              </h1>

              <p className="afterlog-main-msg">
                You have successfully logged in to VoxReview.
              </p>

              <p className="afterlog-subtext">
                Checking whether the VoxReview extension is available in this browser.
              </p>
            </>
          ) : (
            <>
              <div className="afterlog-pill-badge extension-required" role="status" aria-live="polite">
                <Puzzle size={14} className="badge-icon" />
                <span>Extension Required</span>
              </div>

              <h1 className="afterlog-main-heading">
                Install the <span className="gradient-text">VoxReview</span> Extension
              </h1>

              <p className="afterlog-main-msg">
                Install the extension first to analyze reviews.
              </p>

              <p className="afterlog-subtext">
                Add VoxReview to Chrome, then return to this page to get started.
              </p>

              <a
                href="https://chromewebstore.google.com/detail/docdbeejbfkoidffligmldaebhammafa"
                target="_blank"
                rel="noopener noreferrer"
                className="cta-primary afterlog-install-cta"
              >
                <Download size={16} />
                <span>Add to Chrome</span>
              </a>

              <button
                type="button"
                className="extension-recheck-button"
                onClick={() => setExtensionCheckAttempt((attempt) => attempt + 1)}
                disabled={isCheckingExtension}
              >
                {isCheckingExtension ? 'Checking...' : 'Re-check extension'}
              </button>
            </>
          )}
        </div>
      </main>

      {/* Supported Websites Section */}
      <section className="afterlog-section" id="supported-websites">
        <div className="afterlog-section-header">
          <h2 className="afterlog-section-title">Supported Websites</h2>
          <p className="afterlog-section-subtitle">
            Select any supported platform to browse products, places, apps, or games with customer reviews.
          </p>
        </div>

        <div className="platforms-grid afterlog-platforms-grid">
          {SUPPORTED_WEBSITES.map((platform) => {
            const IconComponent = platform.Icon;
            return (
              <div key={platform.name} className="platform-card afterlog-platform-card">
                <div className="platform-card-top">
                  <div className={`platform-icon-wrap ${platform.iconClass}`}>
                    <IconComponent size={24} />
                  </div>
                  <h3 className="platform-name">{platform.name}</h3>
                </div>

                <p className="platform-desc">{platform.description}</p>

                <a
                  href={platform.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="platform-open-btn"
                >
                  <span>{platform.buttonText}</span>
                  <ExternalLink size={14} />
                </a>
              </div>
            );
          })}
        </div>
      </section>

      {/* How to use VoxReview Section */}
      <section className="afterlog-section" id="how-to-use">
        <div className="afterlog-section-header">
          <h2 className="afterlog-section-title">How to use VoxReview</h2>
          <p className="afterlog-section-subtitle">
            Follow these easy steps to analyze reviews directly on your browser.
          </p>
        </div>

        <div className="how-to-use-grid">
          {USAGE_STEPS.map((item) => {
            const StepIcon = item.Icon;
            return (
              <div key={item.step} className="step-card">
                <div className="step-number-badge">0{item.step}</div>
                <div className="step-icon-wrap">
                  <StepIcon size={22} />
                </div>
                <p className="step-text">{item.title}</p>
              </div>
            );
          })}
        </div>

        {/* Extension Info Banner */}
        <div className="extension-callout-banner">
          <div className="callout-icon-wrap">
            <Info size={22} />
          </div>
          <div className="callout-content">
            <h4 className="callout-title">Browser Extension Required for Analysis</h4>
            <p className="callout-desc">
              VoxReview works through the browser extension. Open a supported website, navigate to a page containing reviews, then use the VoxReview extension to analyze the reviews.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src={logo} alt="VoxReview" className="footer-logo" />
            <span className="footer-title">VoxReview</span>
          </div>
          <p className="footer-copy">
            © {new Date().getFullYear()} VoxReview. AI-Powered Review Analysis for Shopping, Place, and App Platforms. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
