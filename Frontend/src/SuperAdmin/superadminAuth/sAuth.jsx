import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { useVoxLogo } from '../../utils/useVoxLogo.js';
import authService from '../../services/authService.js';
import './sAuth.css';

export default function SuperAdminLoginPage() {
  const logo = useVoxLogo({ forceDark: true });
  const navigate = useNavigate();

  // Phase: 'credentials' | '2fa'
  const [phase, setPhase] = useState('credentials');

  // Credentials form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // 2FA form state
  const [challengeToken, setChallengeToken] = useState('');
  const [maskedAdminEmail, setMaskedAdminEmail] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(600); // 10 minutes in seconds

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');

  const digitRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
  ];

  // Countdown timer for 2FA phase
  useEffect(() => {
    if (phase !== '2fa') return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setError('Verification code has expired. Please log in again.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // Handle credentials submission (Phase 1)
  const handleCredentialsSubmit = async (ev) => {
    ev.preventDefault();
    setError('');
    setSuccessInfo('');

    if (!email || !password) {
      setError('Please fill in both email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authService.initiateSuperAdminLogin(email, password);
      setSubmitting(false);

      if (res.mfaRequired && res.challengeToken) {
        setChallengeToken(res.challengeToken);
        setMaskedAdminEmail(res.adminEmail || email);
        setCountdown(res.expiresInSeconds || 600);
        setDigits(['', '', '', '', '', '']);
        setPhase('2fa');
        setTimeout(() => digitRefs[0]?.current?.focus(), 150);
      } else {
        setError('Unexpected authentication response.');
      }
    } catch (err) {
      setSubmitting(false);
      setError(err.message || 'Authentication failed. Please check your credentials.');
    }
  };

  // Handle 2FA OTP submission (Phase 2)
  const handleOtpSubmit = async (ev) => {
    if (ev) ev.preventDefault();
    setError('');

    const otpCode = digits.join('').trim();
    if (otpCode.length !== 6 || !/^\d{6}$/.test(otpCode)) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }

    if (countdown <= 0) {
      setError('Verification code has expired. Please log in again.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authService.verifySuperAdminTwoFactor({
        email,
        password,
        challengeToken,
        otp: otpCode,
      });

      setSubmitting(false);
      if (res.success && res.role === 'superadmin' && res.session?.access_token) {
        navigate('/superadmin/dashboard', { replace: true });
      } else {
        setError('The verified administrator session is incomplete. Please log in again.');
      }
    } catch (err) {
      setSubmitting(false);
      setError(err.message || 'Verification failed. Please check the code.');
    }
  };

  // OTP digit keyboard handling
  const handleDigitChange = (index, val) => {
    const clean = val.replace(/\D/g, '');
    const next = [...digits];

    if (clean.length > 1) {
      // Pasting full 6-digit code
      const pasteDigits = clean.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        next[i] = pasteDigits[i] || '';
      }
      setDigits(next);
      const nextFocus = Math.min(pasteDigits.length, 5);
      digitRefs[nextFocus]?.current?.focus();
      return;
    }

    next[index] = clean.slice(-1);
    setDigits(next);

    if (clean && index < 5) {
      digitRefs[index + 1]?.current?.focus();
    }
  };

  const handleDigitKeyDown = (index, ev) => {
    if (ev.key === 'Backspace' && !digits[index] && index > 0) {
      digitRefs[index - 1]?.current?.focus();
    }
  };

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="sa-root">
      {/* Page Ambient Glows */}
      <div className="sa-page-glow sa-page-glow-indigo" aria-hidden="true" />
      <div className="sa-page-glow sa-page-glow-purple" aria-hidden="true" />

      {/* Main Dual-Panel Container */}
      <div className="sa-container">
        {/* ── LEFT FORM PANEL ── */}
        <div className="sa-form-panel">
          <div className="sa-forms-track">
            <div className="sa-form-body">
              {/* Admin Badge & Header */}
              <div className="sa-admin-badge">
                <ShieldCheck size={14} className="badge-shield-icon" />
                <span>Restricted Admin Portal</span>
              </div>

              <div className="sa-form-header">
                <h2 className="sa-form-title">
                  {phase === '2fa' ? 'Two-Factor Verification' : 'Super Admin Access'}
                </h2>
                <p className="sa-form-subtitle">
                  {phase === '2fa'
                    ? `Enter the 6-digit code sent to ${maskedAdminEmail}`
                    : 'Enter system credentials to access the admin console'}
                </p>
              </div>

              {/* Error Toast Banner */}
              {error && (
                <div className="sa-error">
                  <AlertTriangle size={16} className="sa-error-icon" />
                  <span>{error}</span>
                </div>
              )}

              {/* PHASE 1: CREDENTIALS INPUT */}
              {phase === 'credentials' && (
                <form className="sa-form" onSubmit={handleCredentialsSubmit} noValidate>
                  <div className="sa-field">
                    <label htmlFor="sa-email" className="sa-label">
                      Admin Email
                    </label>
                    <div className="sa-input-wrap">
                      <Mail size={16} className="sa-icon" />
                      <input
                        id="sa-email"
                        type="email"
                        className="sa-input"
                        placeholder="Enter your email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <div className="sa-field">
                    <label htmlFor="sa-password" className="sa-label">
                      Password
                    </label>
                    <div className="sa-input-wrap">
                      <Lock size={16} className="sa-icon" />
                      <input
                        id="sa-password"
                        type={showPass ? 'text' : 'password'}
                        className="sa-input"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        className="sa-eye"
                        onClick={() => setShowPass((p) => !p)}
                        aria-label={showPass ? 'Hide password' : 'Show password'}
                        title={showPass ? 'Hide password' : 'Show password'}
                      >
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="sa-options-row">
                    <label className="sa-check-label">
                      <input
                        type="checkbox"
                        className="sa-check"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span>Keep admin session active</span>
                    </label>
                  </div>

                  <button type="submit" className="sa-submit-btn" disabled={submitting}>
                    {submitting ? 'Verifying Credentials…' : 'Continue to 2FA Verification'}
                  </button>
                </form>
              )}

              {/* PHASE 2: TWO-FACTOR OTP INPUT */}
              {phase === '2fa' && (
                <form className="sa-form" onSubmit={handleOtpSubmit} noValidate>
                  <div className="sa-otp-inputs">
                    {digits.map((digit, index) => (
                      <input
                        key={index}
                        ref={digitRefs[index]}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        className="sa-otp-digit"
                        value={digit}
                        onChange={(e) => handleDigitChange(index, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(index, e)}
                        autoFocus={index === 0}
                      />
                    ))}
                  </div>

                  <div className="sa-otp-meta">
                    <div className="sa-otp-timer">
                      <Clock size={13} />
                      <span>Code expires in: {formatCountdown(countdown)}</span>
                    </div>
                    <button
                      type="button"
                      className="sa-link-button"
                      onClick={() => {
                        setPhase('credentials');
                        setError('');
                        setDigits(['', '', '', '', '', '']);
                      }}
                    >
                      Use another account
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="sa-submit-btn"
                    disabled={submitting || digits.join('').length !== 6 || countdown <= 0}
                    style={{ marginTop: '16px' }}
                  >
                    {submitting ? 'Verifying Code…' : 'Confirm & Sign In to Console'}
                  </button>
                </form>
              )}

              {/* Back to Public Site Link */}
              <div className="sa-footer-row">
                <Link to="/" className="sa-back-link">
                  <ArrowLeft size={14} />
                  <span>Return to Public Site</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT BRANDING PANEL ── */}
        <div className="sa-brand-panel">
          <div className="sa-brand-content">
            {/* Animated Ambient Blobs */}
            <div className="sa-blob sa-blob-1" />
            <div className="sa-blob sa-blob-2" />
            <div className="sa-blob sa-blob-3" />

            {/* Grid Overlay */}
            <div className="sa-brand-grid" aria-hidden="true" />

            {/* Glassmorphism Branding Card */}
            <div className="sa-glass-card">
              <Link to="/" className="sa-brand-logo-row">
                <img src={logo} alt="VoxReview" className="sa-brand-logo-img" />
                <span className="sa-brand-logo-name">VoxReview</span>
              </Link>

              <div className="sa-brand-headline">
                <h1 className="sa-brand-title">
                  <span>Super Admin</span>
                  <br />
                  <span className="sa-brand-accent">Secure Sign-In</span>
                </h1>
                <p className="sa-brand-sub">
                  Verify your password and email code before a protected administrator session is granted.
                </p>
              </div>

              {/* Decorative Sparkle */}
              <div className="sa-sparkle-float" aria-hidden="true">
                <Sparkles size={26} />
              </div>

              {/* Admin Feature Pills */}
              <div className="sa-feature-list">
                <div className="sa-feature-pill">
                  <div className="sa-feature-icon">
                    <Mail size={15} />
                  </div>
                  <span>Email OTP Verification</span>
                </div>
                <div className="sa-feature-pill">
                  <div className="sa-feature-icon">
                    <ShieldCheck size={15} />
                  </div>
                  <span>Exact-Session Binding</span>
                </div>
                <div className="sa-feature-pill">
                  <div className="sa-feature-icon">
                    <KeyRound size={15} />
                  </div>
                  <span>Revocable Admin Sessions</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
