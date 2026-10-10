import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Store, MapPin, Smartphone, Gamepad2, ExternalLink, CheckCircle2, Globe, FileText, Puzzle, Sparkles, Info } from 'lucide-react';
import AuthNavigation from '../components/AuthNavigation.jsx';
import { useVoxLogo } from '../../utils/useVoxLogo.js';
import authService from '../../services/authService.js';
import { getRegularUserAfterAuthSync } from '../../services/authSessionSync.js';
import '../css/AfterLogPage.css';

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
