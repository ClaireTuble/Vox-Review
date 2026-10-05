import { Link } from 'react-router-dom';
import { Sparkles, Download, ArrowRight, Brain, Globe, BookmarkCheck, BarChart3, Store, MapPin, Lock, CheckCircle2, Smartphone, Gamepad2 } from 'lucide-react';
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
      <main id="home" className="landing-hero-section">

        <div className="hero-content">
          <div className="hero-pill-badge">
            <Sparkles size={13} className="badge-icon" />
            <span>Review Analysis Platform</span>
          </div>
          
          <h1 className="hero-heading">
            Understand Reviews. <br className="hero-br" />
            <span className="gradient-text">Feel</span> the Voice.
          </h1>
          
          <p className="hero-subtext">
            VoxReview is a customer feedback analysis platform that helps users understand large amounts of online reviews more efficiently. It analyzes customer feedback, identifies emotions and discussion topics, and helps users prioritize reviews that may require attention.
          </p>

          <div className="hero-cta-group">
            <button
              type="button"
              className="cta-primary"
              style={{ border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
              onClick={(e) => e.preventDefault()}
            >
              <Download size={16} />
              <span>Add to Chrome</span>
            </button>
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
              <span className="platform-tag">
                <Gamepad2 size={13} className="plat-icon steam" /> Steam
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
            Extract key sentiment patterns, emotions, discussion topics, and priority insights from customer reviews efficiently.
          </p>
        </div>

        <div className="why-features-grid">
          {/* Card 1 */}
          <div className="why-card">
            <div className="why-card-icon-wrapper purple">
              <Brain size={22} />
            </div>
            <h3 className="why-card-title">Review &amp; Emotion Analysis</h3>
            <p className="why-card-desc">
              Analyze customer reviews and understand the emotions expressed in customer feedback.
            </p>
          </div>

          {/* Card 2 */}
          <div className="why-card">
            <div className="why-card-icon-wrapper blue">
              <Globe size={22} />
            </div>
            <h3 className="why-card-title">Supported Platforms</h3>
            <p className="why-card-desc">
              Seamlessly analyze reviews across Shopee, Lazada, Google Maps, Google Play Store, and Steam directly on the page.
            </p>
          </div>

          {/* Card 3 */}
          <div className="why-card">
            <div className="why-card-icon-wrapper indigo">
              <BookmarkCheck size={22} />
            </div>
            <h3 className="why-card-title">Saved Analyses &amp; Refresh</h3>
            <p className="why-card-desc">
              Save previous review analyses and easily check for newly added customer reviews.
            </p>
          </div>

          {/* Card 4 */}
          <div className="why-card">
            <div className="why-card-icon-wrapper sky">
              <BarChart3 size={22} />
            </div>
            <h3 className="why-card-title">Topic &amp; Priority Insights</h3>
            <p className="why-card-desc">
              See what customers are talking about across review topics and identify feedback that may need more immediate attention.
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
                <div className="emotion-legend-item sad">
                  <span className="em-dot blue" />
                  <span className="em-name">Sad</span>
                  <span className="em-val">4%</span>
                </div>
                <div className="emotion-legend-item angry">
                  <span className="em-dot red" />
                  <span className="em-name">Anger</span>
                  <span className="em-val">2%</span>
                </div>
                <div className="emotion-legend-item fear">
                  <span className="em-dot orange" />
                  <span className="em-name">Fear</span>
                  <span className="em-val">3%</span>
                </div>
                <div className="emotion-legend-item disgust">
                  <span className="em-dot purple" />
                  <span className="em-name">Disgust</span>
                  <span className="em-val">3%</span>
                </div>
                <div className="emotion-legend-item sarcastic">
                  <span className="em-dot pink" />
                  <span className="em-name">Sarcastic</span>
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
            © {new Date().getFullYear()} VoxReview. Customer Feedback Analysis Platform. All rights reserved.
          </p>

        </div>
      </footer>
    </div>
  );
}

