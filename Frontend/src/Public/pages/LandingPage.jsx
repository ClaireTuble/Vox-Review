import { Link } from 'react-router-dom';
import { Sparkles, Download, ArrowRight, Brain, Globe, BookmarkCheck, BarChart3, Store, MapPin, Lock, CheckCircle2, Smartphone } from 'lucide-react';
import Navigation from '../components/Navigation.jsx';
import { useVoxLogo, logoDark } from '../../utils/useVoxLogo.js';
import '../css/LandingPage.css';

export default function LandingPage() {
  const logo = useVoxLogo();
  return (
    <div className="landing-page-container">
      {/* Background Ambient Glows & Box Grid Texture */}
      <div className="saas-grid-bg" aria-hidden="true" />
      <div className="saas-ambient-glow" aria-hidden="true">
        <div className="glow-purple" />
        <div className="glow-blue" />
      </div>

      <Navigation activePage="home" />

      {/* Hero Section */}
      <main className="landing-hero-section">
        <div className="hero-content">
          <div className="hero-pill-badge">
            <Sparkles size={13} className="badge-icon" />
            <span>AI-Powered Review Analysis</span>
          </div>
          
          <h1 className="hero-heading">
            Understand Reviews. <br className="hero-br" />
            <span className="gradient-text">Feel</span> the Voice.
          </h1>
          
          <p className="hero-subtext">
            VoxReview uses AI sentiment and emotion analysis to help you understand customer feedback and reviews across supported shopping, place, and app platforms.
          </p>

          <div className="hero-cta-group">
            <Link to="/register" className="cta-primary">
              <Download size={16} />
              <span>Add to Chrome</span>
            </Link>
            <a href="#features" className="cta-secondary">
              <span>Learn More</span>
            </a>
          </div>

          {/* Supported Platforms Row */}
          <div className="hero-platforms-row">
            <span className="platforms-label">Supported platforms</span>
            <div className="platform-badges">
              <span className="platform-tag">
                <Store size={13} className="plat-icon shopee" /> Shopee
              </span>
              <span className="platform-tag">
                <Store size={13} className="plat-icon lazada" /> Lazada
              </span>
              <span className="platform-tag">
                <MapPin size={13} className="plat-icon maps" /> Google Maps
              </span>
              <span className="platform-tag">
                <Smartphone size={13} className="plat-icon play" /> Google Play Store
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Why VoxReview Section */}
      <section id="features" className="landing-why-section">
        <div className="section-header-center">
          <h2 className="why-title">
            Why <span className="gradient-text">VoxReview</span>?
          </h2>
          <p className="why-subtitle">
            Extract key sentiment patterns and emotional insights from customer reviews efficiently.
          </p>
        </div>

        <div className="why-features-grid">
          {/* Card 1 */}
          <div className="why-card">
            <div className="why-card-icon-wrapper purple">
              <Brain size={22} />
            </div>
            <h3 className="why-card-title">AI Emotion Analysis</h3>
            <p className="why-card-desc">
              Analyze emotions and sentiment patterns in customer comments using AI-driven feedback classification.
            </p>
          </div>

          {/* Card 2 */}
          <div className="why-card">
            <div className="why-card-icon-wrapper blue">
              <Globe size={22} />
            </div>
            <h3 className="why-card-title">Supported Platforms</h3>
            <p className="why-card-desc">
              Seamlessly analyze reviews on Shopee, Lazada, Google Maps, and Google Play Store directly on the page.
            </p>
          </div>

          {/* Card 3 */}
          <div className="why-card">
            <div className="why-card-icon-wrapper indigo">
              <BookmarkCheck size={22} />
            </div>
            <h3 className="why-card-title">Save & Track</h3>
            <p className="why-card-desc">
              Save review analyses to revisit historical sentiment summaries and feedback highlights anytime.
            </p>
          </div>

          {/* Card 4 */}
          <div className="why-card">
            <div className="why-card-icon-wrapper sky">
              <BarChart3 size={22} />
            </div>
            <h3 className="why-card-title">Smart Insights</h3>
            <p className="why-card-desc">
              View structured summary reports, emotional breakdowns, key topics, and sentiment distributions.
            </p>
          </div>
        </div>
      </section>

      {/* Product Preview Browser Mockup */}
      <section id="how-it-works" className="landing-preview-section">
        <div className="browser-mockup-frame">
          {/* Top Browser Window Header */}
          <div className="browser-header">
            <div className="browser-window-dots">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>
            <div className="browser-address-bar">
              <Lock size={10} className="lock-icon" />
              <span className="url-text">shopee.ph/product/123456789</span>
            </div>
            <div className="browser-actions-placeholder"></div>
          </div>

          {/* Mockup Body Content */}
          <div className="browser-body">
            {/* Background Page Content Placeholder */}
            <div className="mock-ecommerce-page">
              <div className="mock-product-image-box">
                <div className="mock-img-placeholder" />
              </div>
              <div className="mock-product-details">
                <div className="mock-line title" />
                <div className="mock-line price" />
                <div className="mock-line paragraph" />
                <div className="mock-line paragraph short" />
                <div className="mock-reviews-list">
                  <div className="mock-review-item" />
                  <div className="mock-review-item" />
                </div>
              </div>
            </div>

            {/* VoxReview Extension Widget Card Overlay */}
            <div className="vox-widget-overlay">
              <div className="widget-header">
                <div className="widget-brand">
                  <img src={logoDark} alt="VoxReview" className="widget-logo" />
                  <span className="widget-name">VoxReview</span>
                </div>
                <div className="widget-user-icon">
                  <CheckCircle2 size={16} className="verified-icon" />
                </div>
              </div>

              {/* Gauge Score Display */}
              <div className="widget-gauge-container">
                <div className="gauge-circle-outer">
                  <div className="gauge-score-value">86%</div>
                  <div className="gauge-score-label">Happy</div>
                  <div className="gauge-sublabel">Overall Emotion</div>
                </div>
              </div>

              {/* Emotion Distribution Legend */}
              <div className="widget-emotion-grid">
                <div className="emotion-legend-item happy">
                  <span className="em-dot green" />
                  <span className="em-name">Happy</span>
                  <span className="em-val">86%</span>
                </div>
                <div className="emotion-legend-item neutral">
                  <span className="em-dot gray" />
                  <span className="em-name">Neutral</span>
                  <span className="em-val">8%</span>
                </div>
                <div className="emotion-legend-item sad">
                  <span className="em-dot blue" />
                  <span className="em-name">Sad</span>
                  <span className="em-val">4%</span>
                </div>
                <div className="emotion-legend-item angry">
                  <span className="em-dot red" />
                  <span className="em-name">Angry</span>
                  <span className="em-val">2%</span>
                </div>
              </div>
            </div>
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

