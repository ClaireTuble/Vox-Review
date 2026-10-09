import { Link } from 'react-router-dom';
import { Brain, Shield, Zap, Globe, BarChart3, Users, BookmarkCheck, RefreshCw, Star, CheckCircle, ArrowRight, Store, MapPin, Smartphone, Gamepad2, Heart } from 'lucide-react';
import { useVoxLogo } from '../../utils/useVoxLogo.js';
import Navigation from '../components/Navigation.jsx';
import '../css/AboutPage.css';
import '../css/LandingPage.css';

export default function AboutPage() {
  const logo = useVoxLogo();
  return (
    <div className="about-page-container">
      <Navigation activePage="about" />

      {/* Hero Section */}
      <section className="about-hero">
        <div className="hero-badge">
          <img src={logo} alt="VoxReview" style={{ width: '14px', height: '14px', objectFit: 'contain' }} />
          Review Analysis Platform
        </div>
        <h1 className="hero-title">About VoxReview</h1>
        <p className="hero-subtitle">
          VoxReview is a customer feedback analysis platform that helps users understand large amounts of online reviews more efficiently.
        </p>
      </section>

      {/* What is VoxReview */}
      <section className="about-section">
        <div className="about-main-card">
          <h3><Brain size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Customer Feedback Analysis</h3>
          <p>
            VoxReview is a customer feedback analysis platform that helps users understand large amounts of online reviews more efficiently. It analyzes customer feedback, identifies emotions and discussion topics, and helps users prioritize reviews that may require attention.
          </p>

          <h3><Shield size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Key Capabilities</h3>
          <ul>
            <li>
              <CheckCircle size={18} style={{ color: '#2563EB', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Review &amp; Emotion Analysis:</strong> Analyze customer reviews and understand the emotions expressed in customer feedback.
              </div>
            </li>
            <li>
              <CheckCircle size={18} style={{ color: '#2563EB', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Topic &amp; Priority Analysis:</strong> See what customers are talking about across different topics and identify reviews that may need more immediate attention.
              </div>
            </li>
            <li>
              <CheckCircle size={18} style={{ color: '#2563EB', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Saved Analyses &amp; Review Refresh:</strong> Save previous review analyses and check for newly added reviews anytime.
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* Features Section */}
      <section className="about-section">
        <div className="section-header">
          <div className="section-label">
            <Zap size={14} />
            Features
          </div>
          <h2 className="section-title">Platform Capabilities</h2>
          <p className="section-description">
            Everything you need to analyze, understand, and organize customer feedback.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <Brain size={24} />
            </div>
            <h4>Review Analysis</h4>
            <p>Analyze customer reviews and identify important patterns and feedback.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Heart size={24} />
            </div>
            <h4>Emotion Analysis</h4>
            <p>Understand the emotions expressed in customer reviews.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <BarChart3 size={24} />
            </div>
            <h4>Topic Analysis</h4>
            <p>See what customers are talking about across different review topics.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Shield size={24} />
            </div>
            <h4>Priority Analysis</h4>
            <p>Identify reviews that may need more immediate attention.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <BookmarkCheck size={24} />
            </div>
            <h4>Saved Analyses</h4>
            <p>Save and revisit previous review analyses.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <RefreshCw size={24} />
            </div>
            <h4>Review Refresh</h4>
            <p>Check saved analyses for newly added reviews.</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="about-section">
        <div className="section-header">
          <div className="section-label">
            <ArrowRight size={14} />
            How It Works
          </div>
          <h2 className="section-title">Simple Workflow</h2>
          <p className="section-description">
            Start analyzing customer feedback in four straightforward steps.
          </p>
        </div>

        <div className="steps-container">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>Install Browser Extension</h4>
              <p>Add VoxReview to your browser to analyze customer reviews directly on supported pages.</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>Browse Supported Platforms</h4>
              <p>Visit any supported page on Shopee, Lazada, Google Maps, Google Play Store, or Steam.</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>Analyze Feedback</h4>
              <p>Open the extension to analyze reviews and explore emotions, topics, and prioritized items.</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">4</div>
            <div className="step-content">
              <h4>Save &amp; Revisit</h4>
              <p>Save analyses to your history and refresh them anytime to check for new customer reviews.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Supported Platforms */}
      <section className="about-section">
        <div className="section-header">
          <div className="section-label">
            <Globe size={14} />
            Supported Platforms
          </div>
          <h2 className="section-title">Works Across 5 Supported Platforms</h2>
          <p className="section-description">
            VoxReview integrates seamlessly with supported shopping, place, mobile app, and gaming platforms.
          </p>
        </div>

        <div className="platforms-grid">
          <div className="platform-card">
            <div className="platform-icon">
              <Store size={28} />
            </div>
            <h4>Shopee</h4>
          </div>

          <div className="platform-card">
            <div className="platform-icon">
              <Store size={28} />
            </div>
            <h4>Lazada</h4>
          </div>

          <div className="platform-card">
            <div className="platform-icon">
              <MapPin size={28} />
            </div>
            <h4>Google Maps</h4>
          </div>

          <div className="platform-card">
            <div className="platform-icon">
              <Smartphone size={28} />
            </div>
            <h4>Google Play Store</h4>
          </div>

          <div className="platform-card">
            <div className="platform-icon">
              <Gamepad2 size={28} />
            </div>
            <h4>Steam</h4>
          </div>
        </div>
      </section>

      {/* Why Choose VoxReview */}
      <section className="about-section">
        <div className="section-header">
          <div className="section-label">
            <Star size={14} />
            Why Choose Us
          </div>
          <h2 className="section-title">The VoxReview Experience</h2>
          <p className="section-description">
            Built for clarity, speed, and ease of use.
          </p>
        </div>

        <div className="benefits-grid">
          <div className="benefit-card">
            <h4>
              <Zap size={20} style={{ color: '#2563EB' }} />
              Fast &amp; Direct
            </h4>
            <p>Analyzes customer reviews and displays results directly within your browser extension panel.</p>
          </div>

          <div className="benefit-card">
            <h4>
              <Brain size={20} style={{ color: '#2563EB' }} />
              Clear Insights
            </h4>
            <p>Understand overall feedback trends, emotional breakdowns, and key discussion topics at a glance.</p>
          </div>

          <div className="benefit-card">
            <h4>
              <Shield size={20} style={{ color: '#2563EB' }} />
              Privacy Focused
            </h4>
            <p>Analyzes only publicly available review content on supported pages without collecting personal user data.</p>
          </div>

          <div className="benefit-card">
            <h4>
              <Users size={20} style={{ color: '#2563EB' }} />
              User Friendly
            </h4>
            <p>Intuitive interface designed to make large volumes of customer feedback easy to explore.</p>
          </div>
        </div>
      </section>

      {/* Project Overview Section */}
      <section className="about-section">
        <div className="team-section">
          <h3>Customer Feedback Intelligence</h3>
          <p>
            VoxReview is a customer feedback analysis platform that helps users understand large amounts of online reviews more efficiently. It analyzes customer feedback, identifies emotions and discussion topics, and helps users prioritize reviews that may require attention across shopping, place, app, and gaming platforms.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="about-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <img src={logo} alt="VoxReview Logo" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
            <span>VoxReview</span>
          </div>
          <p className="footer-text">
            Customer feedback analysis platform for shopping, place, app, and gaming platforms.
          </p>
          <div className="footer-links">
            <Link to="/" className="footer-link">Home</Link>
            <Link to="/about" className="footer-link">About</Link>
            <Link to="/login" className="footer-link">Sign In</Link>
            <Link to="/register" className="footer-link">Get Started</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
