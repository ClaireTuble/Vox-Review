import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Mail, Lock, User, Zap, AlertTriangle, Eye, EyeOff,
  Shield, Globe, BookmarkCheck, Sparkles, ShieldCheck, Brain, BarChart3
} from 'lucide-react';
import { logoDark } from '../../utils/useVoxLogo.js';
import authService, { normalizeAuthErrorMessage } from '../../services/authService.js';
import VerificationCodeModal from '../../Users/components/VerificationCodeModal.jsx';
import '../css/AuthPage.css';

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());

/* ─── LOGIN FORM ─────────────────────────────────────────── */
function LoginForm({ onSwitchToRegister }) {
  const [role, setRole] = useState('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [resetAuthorization, setResetAuthorization] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmNewPass, setShowConfirmNewPass] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const fillQuick = (e, p) => { setEmail(e); setPassword(p); setError(''); };

  const handleForgotPasswordRequest = async (ev) => {
    ev.preventDefault();
    setError('');
    if (!isValidEmail(email)) { setError('Please enter a valid email address.'); return; }
    setSubmitting(true);
    try {
      await authService.requestForgotPassword(email);
      setShowVerificationModal(true);
    } catch (err) {
      setError(normalizeAuthErrorMessage(err, 'forgot'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (ev) => {
    ev.preventDefault();
    setError('');
    if (newPassword.length < 8 || !/[a-z]/i.test(newPassword) || !/\d/.test(newPassword)) { setError('New password does not meet the required security requirements.'); return; }
    if (newPassword !== confirmNewPassword) { setError('New passwords do not match.'); return; }
    setResetSubmitting(true);
    try {
      await authService.resetPassword({ resetAuthorization, newPassword, confirmPassword: confirmNewPassword });
      setSuccess('Password changed successfully.');
      setForgotPassword(false);
      setResetAuthorization('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setError(normalizeAuthErrorMessage(err, 'change-password'));
    } finally {
      setResetSubmitting(false);
    }
  };

  if (forgotPassword && resetAuthorization) {
    return (
      <div className="ap-form-body">
        <div className="ap-form-header">
          <h2 className="ap-form-title">Create a new password</h2>
          <p className="ap-form-subtitle">Choose a new password for your VoxReview account.</p>
        </div>
        {error && <div className="ap-error"><AlertTriangle size={15} /> <span>{error}</span></div>}
        {success && <div className="ap-success-toast"><span>{success}</span></div>}
        <form className="ap-form" onSubmit={handleResetPassword}>
          <div className="ap-field">
            <label htmlFor="new-password" className="ap-label">New password</label>
            <div className="ap-input-wrap">
              <Lock size={15} className="ap-icon" />
              <input id="new-password" type={showNewPass ? 'text' : 'password'} className="ap-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              <button type="button" className="ap-eye" onClick={() => setShowNewPass(p => !p)} aria-label={showNewPass ? 'Hide password' : 'Show password'}>
                {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="ap-field">
            <label htmlFor="confirm-new-password" className="ap-label">Confirm password</label>
            <div className="ap-input-wrap">
              <Lock size={15} className="ap-icon" />
              <input id="confirm-new-password" type={showConfirmNewPass ? 'text' : 'password'} className="ap-input" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} required />
              <button type="button" className="ap-eye" onClick={() => setShowConfirmNewPass(p => !p)} aria-label={showConfirmNewPass ? 'Hide password' : 'Show password'}>
                {showConfirmNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <button type="submit" className="ap-submit-btn" disabled={resetSubmitting}>{resetSubmitting ? 'Updating password...' : 'Reset Password'}</button>
        </form>
        <div className="ap-footer"><button type="button" className="ap-footer-link" onClick={() => { setForgotPassword(false); setResetAuthorization(''); }}>Back to Login</button></div>
      </div>
    );
  }

  if (forgotPassword) {
    return (
      <div className="ap-form-body">
        <div className="ap-form-header"><h2 className="ap-form-title">Forgot Password?</h2><p className="ap-form-subtitle">Enter your email to receive a verification code.</p></div>
        {error && <div className="ap-error"><AlertTriangle size={15} /> <span>{error}</span></div>}
        <form className="ap-form" onSubmit={handleForgotPasswordRequest}>
          <div className="ap-field"><label htmlFor="forgot-email" className="ap-label">Email address</label><div className="ap-input-wrap"><Mail size={15} className="ap-icon" /><input id="forgot-email" type="email" className="ap-input" value={email} onChange={e => setEmail(e.target.value)} required /></div></div>
          <button type="submit" className="ap-submit-btn" disabled={submitting}>{submitting ? 'Sending code...' : 'Send Code'}</button>
        </form>
        <div className="ap-footer"><button type="button" className="ap-footer-link" onClick={() => setForgotPassword(false)}>Back to Login</button></div>
        {showVerificationModal && <VerificationCodeModal isOpen={showVerificationModal} email={email} purpose="forgot_password" onVerifySuccess={(result) => { setShowVerificationModal(false); setResetAuthorization(result.resetAuthorization); }} onCancel={() => setShowVerificationModal(false)} />}
      </div>
    );
  }

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setError('');
    setSuccess('');
    if (!isValidEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (!password) { setError('Incorrect email or password. Please check your credentials and try again.'); return; }
    setSubmitting(true);
    try {
      const res = await authService.login(email, password, 'user');
      setSubmitting(false);
      if (res.success) {
        // Session is synced to chrome.storage.local via authService.
        // Stay on this page and show a toast — do NOT redirect to dashboard.
        setSuccess('Login successful! Your VoxReview account is now connected to the extension.');
        setTimeout(() => setSuccess(''), 8000);
      }
    } catch (err) {
      setSubmitting(false);
      setError(normalizeAuthErrorMessage(err, 'login'));
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await authService.signInWithGoogle();
    } catch (err) {
      setSubmitting(false);
      setError(err?.message || 'Google sign-in failed. Please try again.');
    }
  };

  return (
    <div className="ap-form-body">
      <div className="ap-form-header">
        <h2 className="ap-form-title">Sign in to your account</h2>
        <p className="ap-form-subtitle">Enter your email and password to continue</p>
      </div>


      {success && (
        <div className="ap-success-toast">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="ap-error">
          <AlertTriangle size={15} /> <span>{error}</span>
        </div>
      )}

      <form className="ap-form" onSubmit={handleSubmit}>
        <div className="ap-field">
          <label htmlFor="login-email" className="ap-label">Email address</label>
          <div className="ap-input-wrap">
            <Mail size={15} className="ap-icon" />
            <input id="login-email" type="email" className="ap-input" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
        </div>

        <div className="ap-field">
          <label htmlFor="login-password" className="ap-label">Password</label>
          <div className="ap-input-wrap">
            <Lock size={15} className="ap-icon" />
            <input id="login-password" type={showPass ? 'text' : 'password'} className="ap-input" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="ap-eye" onClick={() => setShowPass(p => !p)} aria-label="Toggle password">
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="ap-options-row">
          <label className="ap-check-label">
            <input type="checkbox" className="ap-check" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
            <span>Remember me</span>
          </label>
          <button type="button" className="ap-text-link" onClick={() => { setError(''); setForgotPassword(true); }}>
            Forgot password?
          </button>
        </div>

        <button type="submit" className="ap-submit-btn" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      {/* Google OAuth */}
      <div className="ap-divider"><span>or continue with</span></div>
      <button type="button" className="ap-google-btn" onClick={handleGoogleSignIn} disabled={submitting}>
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
        {submitting ? 'Connecting...' : 'Continue with Google'}
      </button>

      <div className="ap-footer">
        <span className="ap-footer-text">Don't have an account?</span>
        <button type="button" className="ap-footer-link" onClick={onSwitchToRegister}>Sign up</button>
      </div>
    </div>
  );
}

/* ─── REGISTER FORM ─────────────────────────────────────── */
function RegisterForm({ onSwitchToLogin }) {
  const [selectedRole, setSelectedRole] = useState('user');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [pendingSignupData, setPendingSignupData] = useState(null);

  const getStrength = (pwd) => {
    if (!pwd) return { s: 0, label: '' };
    let s = 0;
    if (pwd.length >= 8) s++;
    if (pwd.match(/[a-z]/) && pwd.match(/[A-Z]/)) s++;
    if (pwd.match(/\d/)) s++;
    if (pwd.match(/[^a-zA-Z\d]/)) s++;
    return { s, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][s] };
  };
  const { s, label } = getStrength(password);

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setError('');
    if (!username || !firstName || !lastName || !email || !password || !confirmPwd) {
      setError('Please fill all required fields.');
      return;
    }
    if (!isValidEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) { setError('Password must meet the required security requirements.'); return; }
    if (password !== confirmPwd) { setError('Passwords do not match.'); return; }
    if (!agreeTerms) { setError('You must agree to the terms.'); return; }

    setSubmitting(true);
    const signupData = { email, password, username, firstName, lastName };

    try {
      // Step 1: Send verification code email via Brevo. Account NOT created yet.
      await authService.requestSignupVerification(signupData);
      setPendingSignupData(signupData);
      setShowVerificationModal(true);
    } catch (err) {
      setError(normalizeAuthErrorMessage(err, 'signup'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerificationSuccess = (result) => {
    setShowVerificationModal(false);
    setSuccess('Registration & email verification successful! Your account is ready.');
    setTimeout(() => {
      setSuccess('');
      onSwitchToLogin();
    }, 4000);
  };

  return (
    <div className="ap-form-body">
      <div className="ap-form-header">
        <h2 className="ap-form-title">Create an account</h2>
        <p className="ap-form-subtitle">Fill in the details to get started</p>
      </div>

      {success && (
        <div className="ap-success-toast">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="ap-error">
          <AlertTriangle size={15} /> <span>{error}</span>
        </div>
      )}

      <form className="ap-form" onSubmit={handleSubmit}>
        <div className="ap-field">
          <label htmlFor="reg-username" className="ap-label">Username*</label>
          <div className="ap-input-wrap">
            <User size={15} className="ap-icon" />
            <input id="reg-username" type="text" className="ap-input" placeholder="claire123"
              value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
        </div>

        <div className="auth-form-row">
          <div className="ap-field flex-1">
            <label htmlFor="reg-firstname" className="ap-label">First Name*</label>
            <div className="ap-input-wrap">
              <User size={15} className="ap-icon" />
              <input id="reg-firstname" type="text" className="ap-input" placeholder="Claire"
                value={firstName} onChange={e => setFirstName(e.target.value)} required />
            </div>
          </div>

          <div className="ap-field flex-1">
            <label htmlFor="reg-lastname" className="ap-label">Last Name*</label>
            <div className="ap-input-wrap">
              <User size={15} className="ap-icon" />
              <input id="reg-lastname" type="text" className="ap-input" placeholder="Tuble"
                value={lastName} onChange={e => setLastName(e.target.value)} required />
            </div>
          </div>
        </div>

        <div className="ap-field">
          <label htmlFor="reg-email" className="ap-label">Email address</label>
          <div className="ap-input-wrap">
            <Mail size={15} className="ap-icon" />
            <input id="reg-email" type="email" className="ap-input" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
        </div>

        <div className="ap-field">
          <label htmlFor="reg-password" className="ap-label">Password</label>
          <div className="ap-input-wrap">
            <Lock size={15} className="ap-icon" />
            <input id="reg-password" type={showPass ? 'text' : 'password'} className="ap-input" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="ap-eye" onClick={() => setShowPass(p => !p)} aria-label="Toggle password">
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {password && (
            <div className="ap-strength">
              <div className="ap-strength-bar">
                {[1, 2, 3, 4].map(n => (
                  <div key={n} className={`ap-seg ${s >= n ? ['', 'weak', 'fair', 'good', 'strong'][n] : ''}`} />
                ))}
              </div>
              <span className="ap-strength-text">Strength: <strong>{label}</strong></span>
            </div>
          )}
        </div>

        <div className="ap-field">
          <label htmlFor="reg-confirm" className="ap-label">Confirm Password</label>
          <div className="ap-input-wrap">
            <ShieldCheck size={15} className="ap-icon" />
            <input id="reg-confirm" type={showConf ? 'text' : 'password'} className="ap-input" placeholder="••••••••"
              value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required />
            <button type="button" className="ap-eye" onClick={() => setShowConf(p => !p)} aria-label="Toggle confirm">
              {showConf ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <label className="ap-check-label terms">
          <input type="checkbox" className="ap-check" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} />
          <span>I agree to the <a href="#" onClick={e => e.preventDefault()}>Terms of Service</a> and <a href="#" onClick={e => e.preventDefault()}>Privacy Policy</a></span>
        </label>

        <button type="submit" className="ap-submit-btn" disabled={submitting}>
          {submitting ? 'Sending verification code…' : 'Sign Up'}
        </button>
      </form>

      <div className="ap-footer">
        <span className="ap-footer-text">Already have an account?</span>
        <button type="button" className="ap-footer-link" onClick={onSwitchToLogin}>Sign in</button>
      </div>

      {showVerificationModal && (
        <VerificationCodeModal
          isOpen={showVerificationModal}
          email={pendingSignupData?.email}
          purpose="signup_email_verification"
          signupData={pendingSignupData}
          onVerifySuccess={handleVerificationSuccess}
          onCancel={() => setShowVerificationModal(false)}
        />
      )}
    </div>
  );
}

/* ─── BRANDING PANEL CONTENT ─────────────────────────────── */
function BrandingPanel({ mode }) {
  const isLogin = mode === 'login';
  return (
    <div className="ap-brand-content">
      {/* Animated blobs */}
      <div className="ap-blob ap-blob-1" />
      <div className="ap-blob ap-blob-2" />
      <div className="ap-blob ap-blob-3" />

      {/* Grid overlay */}
      <div className="ap-brand-grid" aria-hidden="true" />

      {/* Inner glassmorphism card */}
      <div className="ap-glass-card">
        <Link to="/" className="ap-brand-logo-row">
          <img src={logoDark} alt="VoxReview" className="ap-brand-logo-img" />
          <span className="ap-brand-logo-name">VoxReview</span>
        </Link>

        <div className="ap-brand-headline">
          <h1 className="ap-brand-title">
            {isLogin ? (
              <><span>Welcome</span><br /><span className="ap-brand-accent">Back!</span></>
            ) : (
              <><span>Join</span><br /><span className="ap-brand-accent">VoxReview</span></>
            )}
          </h1>
          <p className="ap-brand-sub">
            {isLogin
              ? 'Sign in to continue analyzing reviews with AI.'
              : 'Start understanding what customers really feel.'}
          </p>
        </div>

        {/* Decorative sparkle */}
        <div className="ap-sparkle-float" aria-hidden="true">
          <Sparkles size={28} />
        </div>

        {/* Feature pills */}
        <div className="ap-feature-list">
          <div className="ap-feature-pill">
            <div className="ap-feature-icon"><Shield size={15} /></div>
            <span>AI-Powered Analysis</span>
          </div>
          <div className="ap-feature-pill">
            <div className="ap-feature-icon"><Globe size={15} /></div>
            <span>Multi-Platform Support</span>
          </div>
          <div className="ap-feature-pill">
            <div className="ap-feature-icon"><BookmarkCheck size={15} /></div>
            <span>Save & Track Results</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── MAIN AUTH PAGE ─────────────────────────────────────── */
export default function AuthPage({ initialMode = 'login' }) {
  const location = useLocation();

  // Derive mode from URL path so direct navigation to /login or /register works
  const pathMode = location.pathname === '/register' ? 'register' : 'login';
  const [mode, setMode] = useState(pathMode || initialMode);
  const [animating, setAnimating] = useState(false);
  const navigate = useNavigate();

  // Sync mode if URL changes externally
  useEffect(() => {
    setMode(pathMode);
  }, [pathMode]);

  const switchTo = (target) => {
    if (animating || mode === target) return;
    setAnimating(true);
    // Update URL without reload
    navigate(target === 'login' ? '/login' : '/register', { replace: true });
    setTimeout(() => {
      setMode(target);
      setAnimating(false);
    }, 380);
  };

  const isLogin = mode === 'login';

  return (
    <div className="ap-root">
      {/* Page-level ambient glows */}
      <div className="ap-page-glow ap-page-glow-purple" aria-hidden="true" />
      <div className="ap-page-glow ap-page-glow-blue" aria-hidden="true" />

      {/* Main sliding container */}
      <div className={`ap-container ${isLogin ? 'ap-mode-login' : 'ap-mode-register'} ${animating ? 'ap-animating' : ''}`}>

        {/* ── FORM PANEL ── */}
        <div className="ap-form-panel">
          <div className="ap-forms-track">
            {/* Login form */}
            <div className={`ap-form-slide ${isLogin ? 'ap-slide-active' : 'ap-slide-hidden-right'}`}
              aria-hidden={!isLogin}>
              <LoginForm onSwitchToRegister={() => switchTo('register')} />
            </div>
            {/* Register form */}
            <div className={`ap-form-slide ${!isLogin ? 'ap-slide-active' : 'ap-slide-hidden-left'}`}
              aria-hidden={isLogin}>
              <RegisterForm onSwitchToLogin={() => switchTo('login')} />
            </div>
          </div>
        </div>

        {/* ── BRANDING PANEL ── */}
        <div className="ap-brand-panel">
          <BrandingPanel mode={mode} />
        </div>
      </div>
    </div>
  );
}
