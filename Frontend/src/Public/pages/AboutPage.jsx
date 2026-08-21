import { Link } from 'react-router-dom';
import { Brain, Shield, Zap, Globe, BarChart3, Users, Settings, Code, Heart, Star, CheckCircle, ArrowRight, Store, MapPin, Smartphone } from 'lucide-react';
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
          AI-Powered Review Intelligence
        </div>
        <h1 className="hero-title">About VoxReview Platform</h1>
        <p className="hero-subtitle">
          Transform unorganized customer reviews into meaningful emotion insights with our AI-powered Chrome Extension.
        </p>
      </section>

      {/* What is VoxReview */}
      <section className="about-section">
        <div className="about-main-card">
          <h3><Brain size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> AI Emotion Intelligence Engine</h3>
          <p>
            VoxReview helps you make sense of customer reviews by applying AI-based sentiment and emotion analysis. Designed as a Chrome Extension, it collects and evaluates reviews directly on supported platforms — including shopping sites, places, and apps — and surfaces meaningful patterns from the feedback that matters most.
          </p>

          <h3><Shield size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> User-Focused Review Intelligence</h3>
          <ul>
            <li>
              <CheckCircle size={18} style={{ color: '#2563EB', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Extension Analysis:</strong> On-page review evaluation for supported shopping, place, and app platforms.
              </div>
            </li>
            <li>
              <CheckCircle size={18} style={{ color: '#2563EB', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Saved Sentiment History:</strong> Easily save, review, and organize historical feedback analyses.
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
          <h2 className="section-title">Powerful Capabilities</h2>
          <p className="section-description">
            Everything you need to analyze, understand, and act on customer sentiment data.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <Brain size={24} />
            </div>
            <h4>Sentiment Analysis</h4>
            <p>Advanced AI-powered emotion detection from customer reviews with high accuracy.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <BarChart3 size={24} />
            </div>
            <h4>Real-time Insights</h4>
            <p>View sentiment distributions and emotional patterns from customer reviews as you browse supported platforms.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Shield size={24} />
            </div>
            <h4>Authentic Reviews</h4>
            <p>Identify genuine customer feedback with our evidence-based verification system.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Users size={24} />
            </div>
            <h4>Personal Dashboard</h4>
            <p>Save and organize your analyzed review reports and sentiment summaries in one place.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Settings size={24} />
            </div>
            <h4>Multi-Platform Support</h4>
            <p>Designed to analyze feedback across Shopee, Lazada, Google Maps, and Google Play Store.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Heart size={24} />
            </div>
            <h4>Emotional Drivers</h4>
            <p>Understand what drives customer emotions with detailed sentiment breakdowns.</p>
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
          <h2 className="section-title">Simple Integration</h2>
          <p className="section-description">
            Get started in minutes with our streamlined workflow.
          </p>
        </div>

        <div className="steps-container">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>Install Chrome Extension</h4>
              <p>Add VoxReview to your browser with one click from the Chrome Web Store.</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>Browse Products</h4>
              <p>Visit any supported platform page — Shopee, Lazada, Google Maps, or Google Play Store — to trigger AI review analysis.</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>View Insights</h4>
              <p>Access detailed emotion intelligence, sentiment distributions, and authentic review evidence.</p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">4</div>
            <div className="step-content">
              <h4>Make Informed Decisions</h4>
              <p>Use AI-powered insights to make better purchasing decisions based on genuine customer feedback.</p>
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
          <h2 className="section-title">Works Across 4 Supported Platforms</h2>
          <p className="section-description">
            VoxReview integrates with supported shopping, place, and app platforms.
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
        </div>
      </section>

      {/* Why Choose VoxReview */}
      <section className="about-section">
        <div className="section-header">
          <div className="section-label">
            <Star size={14} />
            Why Choose Us
          </div>
          <h2 className="section-title">The VoxReview Advantage</h2>
          <p className="section-description">
            Built for accuracy, speed, and user experience.
          </p>
        </div>

        <div className="benefits-grid">
          <div className="benefit-card">
            <h4>
              <Zap size={20} style={{ color: '#2563EB' }} />
              Lightning Fast
            </h4>
            <p>Analyzes customer reviews and returns sentiment results directly within the extension panel.</p>
          </div>

          <div className="benefit-card">
            <h4>
              <Brain size={20} style={{ color: '#2563EB' }} />
              AI-Powered
            </h4>
            <p>Uses AI-based models to classify emotions and sentiment from collected review text.</p>
          </div>

          <div className="benefit-card">
            <h4>
              <Shield size={20} style={{ color: '#2563EB' }} />
              Privacy First
            </h4>
            <p>Your data is handled responsibly. Only publicly available review content is analyzed.</p>
          </div>

          <div className="benefit-card">
            <h4>
              <Users size={20} style={{ color: '#2563EB' }} />
              User Friendly
            </h4>
            <p>Intuitive interface designed for both casual shoppers and power users.</p>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="about-section">
        <div className="team-section">
          <h3>Built by Innovators</h3>
          <p>
            VoxReview is a student-developed project built to explore practical applications of AI in understanding customer feedback. It was created to help users get more value from online reviews across shopping, place, and app platforms.
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
            Transforming product reviews into actionable intelligence with AI-powered sentiment analysis.
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
