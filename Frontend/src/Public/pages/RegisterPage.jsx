import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Lock, ShieldCheck, Zap, AlertTriangle, Eye, EyeOff, Globe, Cpu, BookmarkCheck, Sparkles, Shield } from 'lucide-react';
import logo from '../../assets/VRLogo.png';
import authService from '../../services/authService.js';
import '../css/AuthModern.css';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName]               = useState('');
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedRole, setSelectedRole]       = useState('user');
  const [agreeTerms, setAgreeTerms]           = useState(true);
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [errorMessage, setErrorMessage]       = useState('');

  const getPasswordStrength = (pwd) => {
    if (!pwd) return { strength: 0, label: '' };
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (pwd.match(/[a-z]/) && pwd.match(/[A-Z]/)) strength++;
    if (pwd.match(/\d/)) strength++;
    if (pwd.match(/[^a-zA-Z\d]/)) strength++;
    
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    return { strength, label: labels[strength] };
  };

  const passwordStrength = getPasswordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!fullName || !email || !password || !confirmPassword) {
      setErrorMessage('Please fill out all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (!agreeTerms) {
      setErrorMessage('You must agree to the terms of service.');
      return;
    }

    setIsSubmitting(true);
    await authService.login(email, password);
    setIsSubmitting(false);

    // After registration, send user to login to sign in properly
    navigate('/login');
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
        {/* Left Panel - Branding */}
        <div className="auth-left-panel">
          <div className="auth-left-grid-pattern" aria-hidden="true" />
          
          <div className="auth-brand-section">
            <Link to="/" className="auth-brand-logo">
              <img src={logo} alt="VoxReview Logo" className="auth-logo-img" />
              <span className="auth-brand-name">VoxReview</span>
            </Link>

            <div className="auth-welcome-headline">
              <h1 className="auth-tagline">
                Create Your Account <Sparkles size={22} className="sparkle-icon" />
              </h1>
              <p className="auth-description">
                Join VoxReview and start understanding reviews better with AI.
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

        {/* Right Panel - Form */}
        <div className="auth-right-panel">
          <div className="auth-form-card">
            <div className="auth-form-header">
              <h2 className="auth-form-title">Create an account</h2>
              <p className="auth-form-subtitle">
                Fill in the details to get started
              </p>
            </div>

            {/* Role Selector */}
            <div className="auth-role-selector">
              <button
                type="button"
                className={`auth-role-btn ${selectedRole === 'user' ? 'active' : ''}`}
                onClick={() => setSelectedRole('user')}
              >
                <User size={14} /> User
              </button>
              <button
                type="button"
                className={`auth-role-btn ${selectedRole === 'superadmin' ? 'active' : ''}`}
                onClick={() => setSelectedRole('superadmin')}
              >
                <Zap size={14} /> SuperAdmin
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="auth-error-message">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Register Form */}
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-form-group">
                <label htmlFor="reg-fullname" className="auth-form-label">
                  <User size={16} className="label-icon" />
                  <span>Full Name</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="reg-fullname"
                    type="text"
                    className="auth-input"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-form-group">
                <label htmlFor="reg-email" className="auth-form-label">
                  <Mail size={16} className="label-icon" />
                  <span>Email address</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="reg-email"
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
                <label htmlFor="reg-password" className="auth-form-label">
                  <Lock size={16} className="label-icon" />
                  <span>Password</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="reg-password"
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
                {password && (
                  <div className="password-strength">
                    <div className="password-strength-bar">
                      <div className={`strength-segment ${passwordStrength.strength >= 1 ? 'weak' : ''}`} />
                      <div className={`strength-segment ${passwordStrength.strength >= 2 ? 'fair' : ''}`} />
                      <div className={`strength-segment ${passwordStrength.strength >= 3 ? 'good' : ''}`} />
                      <div className={`strength-segment ${passwordStrength.strength >= 4 ? 'strong' : ''}`} />
                    </div>
                    <span className="password-strength-text">Password strength: <strong>{passwordStrength.label}</strong></span>
                  </div>
                )}
              </div>

              <div className="auth-form-group">
                <label htmlFor="reg-confirm" className="auth-form-label">
                  <ShieldCheck size={16} className="label-icon" />
                  <span>Confirm Password</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="reg-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <label className="auth-checkbox-group">
                <input
                  type="checkbox"
                  className="auth-checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                />
                <span className="auth-checkbox-label">
                  I agree to the <a href="#" onClick={(e) => e.preventDefault()}>Terms of Service</a> and <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
                </span>
              </label>

              <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Creating account...' : 'Sign Up'}
              </button>
            </form>

            {/* Switch to Login */}
            <div className="auth-form-footer">
              <span className="auth-form-footer-text">Already have an account?</span>
              <button
                type="button"
                className="auth-form-footer-link"
                onClick={() => navigate('/login')}
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


