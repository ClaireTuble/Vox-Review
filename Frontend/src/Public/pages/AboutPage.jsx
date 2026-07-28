import { Link } from 'react-router-dom';
import { Brain, Shield, Zap, Globe, BarChart3, Users, Settings, Code, Heart, Star, CheckCircle, ArrowRight } from 'lucide-react';
import logo from '../../assets/VRLogo.png';
import Navigation from '../components/Navigation.jsx';
import '../css/AboutPage.css';
import '../css/LandingPage.css';

export default function AboutPage() {
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
          Transform unorganized product reviews into actionable emotion intelligence with our advanced Chrome Extension and platform management system.
        </p>
      </section>

      {/* What is VoxReview */}
      <section className="about-section">
        <div className="about-main-card">
          <h3><Brain size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> AI Emotion Intelligence Engine</h3>
          <p>
            VoxReview transforms unorganized product reviews into actionable emotion intelligence. Designed for modern e-commerce buyers and sellers, VoxReview runs as a high-performance Chrome Extension that evaluates sentiment distributions, key emotional drivers, and authentic review evidence directly on product pages.
          </p>

          <h3><Shield size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Role-Based Platform Management</h3>
          <ul>
            <li>
              <CheckCircle size={18} style={{ color: '#2563EB', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>User Mode:</strong> Chrome Extension analysis, saved sentiment history, and personalized review insights.
              </div>
            </li>
            <li>
              <CheckCircle size={18} style={{ color: '#2563EB', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>SuperAdmin Control:</strong> Executive platform management, user administration, supported scraper platform configurations, and system health reporting.
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
            <p>Get instant sentiment distributions and emotional drivers as you browse products.</p>
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
            <h4>User Management</h4>
            <p>Comprehensive user administration with role-based access control.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Settings size={24} />
            </div>
            <h4>Platform Config</h4>
            <p>Flexible scraper platform configurations for different e-commerce sites.</p>
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
              <p>Visit any supported e-commerce product page to see real-time sentiment analysis.</p>
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
          <h2 className="section-title">Works Everywhere</h2>
          <p className="section-description">
            VoxReview integrates seamlessly with major e-commerce platforms.
          </p>
        </div>

        <div className="platforms-grid">
          <div className="platform-card">
            <div className="platform-icon">
              <Globe size={28} />
            </div>
            <h4>Amazon</h4>
          </div>

          <div className="platform-card">
            <div className="platform-icon">
              <Globe size={28} />
            </div>
            <h4>eBay</h4>
          </div>

          <div className="platform-card">
            <div className="platform-icon">
              <Globe size={28} />
            </div>
            <h4>Walmart</h4>
          </div>

          <div className="platform-card">
            <div className="platform-icon">
              <Globe size={28} />
            </div>
            <h4>Target</h4>
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
            <p>Real-time sentiment analysis with sub-second response times for seamless browsing.</p>
          </div>

          <div className="benefit-card">
            <h4>
              <Brain size={20} style={{ color: '#2563EB' }} />
              AI-Powered
            </h4>
            <p>Advanced machine learning models trained on millions of reviews for high accuracy.</p>
          </div>

          <div className="benefit-card">
            <h4>
              <Shield size={20} style={{ color: '#2563EB' }} />
              Privacy First
            </h4>
            <p>Your data stays secure with enterprise-grade encryption and privacy protections.</p>
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
            VoxReview is developed by a team of passionate engineers and data scientists dedicated to making online shopping smarter and more transparent.
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
