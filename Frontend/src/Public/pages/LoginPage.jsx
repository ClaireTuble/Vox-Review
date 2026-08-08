import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, User, Zap, AlertTriangle, Eye, EyeOff, Globe, BookmarkCheck, Sparkles, Shield } from 'lucide-react';
import logo from '../../assets/VRLogo.png';
import authService from '../../services/authService.js';
import '../css/AuthModern.css';

export default function LoginPage() {
  const [role, setRole]                 = useState('user');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fillQuickAccount = (testEmail, testPassword) => {
    setEmail(testEmail);
    setPassword(testPassword);
    setErrorMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !password) {
      setErrorMessage('Please fill in both email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authService.login(email, password);
      setIsSubmitting(false);

      if (res.success) {
        // Session is saved and synced to chrome.storage.local by authService.
        // Show a success notification — do NOT redirect to the dashboard.
        // The user can open the extension to continue; it will detect the session.
        setSuccessMessage('Login successful! Your VoxReview account is now connected to the extension.');
        setTimeout(() => setSuccessMessage(''), 8000);
      }
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Authentication failed.');
    }
  };

  return (
    <div className="auth-modern-container">
      {/* Background Ambient Glows & Box Grid Texture */}
      <div className="saas-grid-bg" aria-hidden="true" />
      <div className="saas-ambient-glow" aria-hidden="true">
        <div className="glow-purple" />
        <div className="glow-blue" />
      </div>

      <div className="auth-card-wrapper desktop-size">
        {/* Left Panel - Branding & Feature Perks */}
        <div className="auth-left-panel">
          <div className="auth-left-grid-pattern" aria-hidden="true" />
          
          <div className="auth-brand-section">
            <Link to="/" className="auth-brand-logo">
              <img src={logo} alt="VoxReview Logo" className="auth-logo-img" />
              <span className="auth-brand-name">VoxReview</span>
            </Link>

            <div className="auth-welcome-headline">
              <h1 className="auth-tagline">
                Welcome Back! <Sparkles size={22} className="sparkle-icon" />
              </h1>
              <p className="auth-description">
                Sign in to continue analyzing reviews with AI.
              </p>
            </div>

            {/* Decorative Sparkle floating */}
            <div className="left-decorative-sparkle">
              <Sparkles size={24} color="#818CF8" />
            </div>

            <div className="auth-feature-perks">
              <div className="perk-badge-item">
                <div className="perk-icon-circle">
                  <Shield size={16} />
                </div>
                <span>AI-Powered Analysis</span>
              </div>
              <div className="perk-badge-item">
                <div className="perk-icon-circle">
                  <Globe size={16} />
                </div>
                <span>Multi-Platform Support</span>
              </div>
              <div className="perk-badge-item">
                <div className="perk-icon-circle">
                  <BookmarkCheck size={16} />
                </div>
                <span>Save & Track Results</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - White Card Form */}
        <div className="auth-right-panel">
          <div className="auth-form-card">
            <div className="auth-form-header">
              <h2 className="auth-form-title">Sign in to your account</h2>
              <p className="auth-form-subtitle">
                Enter your email and password to continue
              </p>
            </div>

            {/* Quick Test Account Fillers */}
            <div className="auth-quick-fill-row">
              <button
                type="button"
                className="quick-fill-btn"
                onClick={() => fillQuickAccount('user@test.com', 'user123')}
              >
                <User size={13} /> Fill User
              </button>
              <button
                type="button"
                className="quick-fill-btn admin"
                onClick={() => fillQuickAccount('admin@test.com', 'admin123')}
              >
                <Zap size={13} /> Fill Admin
              </button>
            </div>

            {/* Role Selector */}
            <div className="auth-role-selector">
              <button
                type="button"
                className={`auth-role-btn ${role === 'user' ? 'active' : ''}`}
                onClick={() => setRole('user')}
              >
                <User size={14} /> User
              </button>
              <button
                type="button"
                className={`auth-role-btn ${role === 'superadmin' ? 'active' : ''}`}
                onClick={() => setRole('superadmin')}
              >
                <Zap size={14} /> SuperAdmin
              </button>
            </div>

            {/* Success Toast */}
            {successMessage && (
              <div className="auth-success-toast">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{successMessage}</span>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="auth-error-message">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Login Form */}
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-form-group">
                <label htmlFor="login-email" className="auth-form-label">
                  <Mail size={16} className="label-icon" />
                  <span>Email address</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="login-email"
                    type="email"
                    className="auth-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-form-group">
                <label htmlFor="login-password" className="auth-form-label">
                  <Lock size={16} className="label-icon" />
                  <span>Password</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="auth-form-options">
                <label className="auth-checkbox-group">
                  <input
                    type="checkbox"
                    className="auth-checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="auth-checkbox-label">Remember me</span>
                </label>
                <button
                  type="button"
                  className="auth-forgot-link"
                  onClick={() => alert('Password reset link has been requested.')}
                >
                  Forgot password?
                </button>
              </div>

              <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            {/* Social Divider UI */}
            <div className="auth-social-divider">
              <span>or continue with</span>
            </div>

            {/* Single Google Sign-in Button */}
            <div className="auth-social-single">
              <button type="button" className="social-btn full-width" onClick={() => alert('Google Sign-In integration')}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Google
              </button>
            </div>

            {/* Switch to Register */}
            <div className="auth-form-footer">
              <span className="auth-form-footer-text">Don't have an account?</span>
              <button
                type="button"
                className="auth-form-footer-link"
                onClick={() => navigate('/register')}
              >
                Sign up
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


