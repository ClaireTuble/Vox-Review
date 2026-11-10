import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  LogOut,
  CheckCircle2,
  User,
  ShieldAlert,
  ChevronRight,
  Key,
  Loader2,
  Eye,
  EyeOff,
  Mail,
  RefreshCw,
  Clock,
  KeyRound,
  AlertCircle,
  Smartphone,
  ArrowRight,
} from 'lucide-react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopActions from '../components/TopActions.jsx';
import SessionChoiceConfirmationModal from '../components/SessionChoiceConfirmationModal.jsx';
import authService from '../../services/authService.js';
import {
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  SESSION_TIMEOUT_OPTIONS,
  getSessionTimeoutPreference,
  saveSessionTimeoutPreference,
  validatePasswordChange,
  validateNewPassword,
  getPasswordStrength,
  resolvePasswordInputType,
  resolvePasswordToggleLabel,
} from '../utils/securitySettings.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/settings.css';
import '../css/responsive.css';

function readInitialTimeoutPreference(userId) {
  if (!userId) return { minutes: DEFAULT_SESSION_TIMEOUT_MINUTES, error: null };
  try {
    return {
      minutes: getSessionTimeoutPreference(globalThis.localStorage, userId).minutes,
      error: null,
    };
  } catch (error) {
    return { minutes: DEFAULT_SESSION_TIMEOUT_MINUTES, error: error.message };
  }
}

function getPasswordFlowErrorMessage(error, fallbackMessage) {
  if (error?.status === 429) {
    return 'Too many security requests. Please wait a few minutes before trying again.';
  }
  return error?.message || fallbackMessage;
}

export default function Settings({ activeTab, setActiveTab, onSignOut }) {
  const navigate = useNavigate();
  const currentUser = authService.getCurrentSuperAdminUser();
  const userId = currentUser?.id;
  const accountNameValue = currentUser?.user_metadata?.full_name
    || currentUser?.user_metadata?.name
    || currentUser?.user_metadata?.username
    || currentUser?.email;
  const accountName = typeof accountNameValue === 'string' && accountNameValue.trim()
    ? accountNameValue
    : 'Name not provided';
  const accountEmail = typeof currentUser?.email === 'string' && currentUser.email.trim()
    ? currentUser.email
    : 'Email not provided';
  const accountInitials = accountName
    .split('@')[0]
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';
  const initialTimeoutPreference = readInitialTimeoutPreference(userId);

  // Super Admin Password Change Multi-Step Flow: 'request_otp' | 'verify_otp' | 'new_password' | 'session_choice'
  const [passwordFlowStep, setPasswordFlowStep] = useState('request_otp');
  const [otpCode, setOtpCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [passwordChangeToken, setPasswordChangeToken] = useState('');
  const [maskedAdminEmail, setMaskedAdminEmail] = useState(accountEmail);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [sessionChoiceSubmitting, setSessionChoiceSubmitting] = useState(false);

  const [sessionTimeout, setSessionTimeout] = useState(String(initialTimeoutPreference.minutes));
  const [actionNotice, setActionNotice] = useState(initialTimeoutPreference.error
    ? { msg: initialTimeoutPreference.error, type: 'error' }
    : null);
  const [showGlobalSignOut, setShowGlobalSignOut] = useState(false);
  const [globalSignOutSubmitting, setGlobalSignOutSubmitting] = useState(false);
  const [globalSignOutComplete, setGlobalSignOutComplete] = useState(false);

  const passwordStrength = getPasswordStrength(newPassword);

  const triggerNotice = (msg, type = 'success') => {
    setActionNotice({ msg, type });
    setTimeout(() => setActionNotice(null), 4000);
  };

  // Cooldown timer effect for OTP resend
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // Step 1A: Request Email OTP
  const handleRequestOtp = async () => {
    setOtpSubmitting(true);
    try {
      const res = await authService.requestSuperAdminPasswordChangeOtp();
      setChallengeToken(res.challengeToken);
      setMaskedAdminEmail(res.adminEmail || accountEmail);
      setPasswordFlowStep('verify_otp');
      setCooldownSeconds(60);
      triggerNotice('Verification code sent to your email.');
    } catch (error) {
      if (error.retryAfterSeconds) {
        setCooldownSeconds(error.retryAfterSeconds);
      }
      triggerNotice(getPasswordFlowErrorMessage(error, 'Failed to dispatch verification code.'), 'error');
    } finally {
      setOtpSubmitting(false);
    }
  };

  // Step 1B: Verify Email OTP
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    const cleanOtp = otpCode.trim();
    if (!cleanOtp || !/^\d{6}$/.test(cleanOtp)) {
      triggerNotice('Enter all 6 digits of the verification code.', 'error');
      return;
    }

    setOtpSubmitting(true);
    try {
      const res = await authService.verifySuperAdminPasswordChangeOtp({
        challengeToken,
        otp: cleanOtp,
      });
      setPasswordChangeToken(res.passwordChangeToken);
      setPasswordFlowStep('new_password');
      triggerNotice('Verification successful! You can now set your new password.');
    } catch (error) {
      triggerNotice(getPasswordFlowErrorMessage(error, 'Verification failed. Please check the code.'), 'error');
    } finally {
      setOtpSubmitting(false);
    }
  };

  // Step 2: Set New Password
  const handleNewPasswordSubmit = async (e) => {
    e.preventDefault();
    const validationMessage = validateNewPassword({
      newPassword,
      confirmPassword,
    });
    if (validationMessage) {
      triggerNotice(validationMessage, 'error');
      return;
    }

    setPasswordSubmitting(true);
    try {
      await authService.confirmSuperAdminPasswordChange({
        passwordChangeToken,
        newPassword,
        confirmPassword,
      });
      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setPasswordFlowStep('session_choice');
      triggerNotice('Password updated successfully! Select your device session preference.');
    } catch (error) {
      triggerNotice(getPasswordFlowErrorMessage(error, 'Password update failed.'), 'error');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  // Step 3: Handle Post-Change Device Session Selection with dedicated confirmation modals
  const [selectedSessionOption, setSelectedSessionOption] = useState(null);

  const handleOpenSessionModal = (option) => {
    if (sessionChoiceSubmitting) return;
    setSelectedSessionOption(option);
  };

  const handleCancelSessionModal = () => {
    if (sessionChoiceSubmitting) return;
    setSelectedSessionOption(null);
  };

  const handleConfirmSessionChoice = async (choice) => {
    if (sessionChoiceSubmitting) return;
    setSessionChoiceSubmitting(true);
    try {
      await authService.recordSuperAdminSessionChoice(choice);
      if (choice === 'logout_all') {
        setSelectedSessionOption(null);
        navigate('/superadmin/login', { replace: true });
        return;
      }
      setSelectedSessionOption(null);
      triggerNotice('Current device session preserved where supported. Other devices may require fresh login due to authentication provider session policies.');
      // Reset flow back to initial
      setPasswordFlowStep('request_otp');
      setOtpCode('');
      setChallengeToken('');
      setPasswordChangeToken('');
    } catch (error) {
      triggerNotice(error.message || 'Failed to update device sessions.', 'error');
    } finally {
      setSessionChoiceSubmitting(false);
    }
  };

  const handleTimeoutChange = (value) => {
    try {
      if (!userId) throw new Error('Unable to identify the current Super Admin account.');
      saveSessionTimeoutPreference(globalThis.localStorage, userId, value);
      setSessionTimeout(String(value));
      globalThis.window.dispatchEvent(new Event('voxreview_superadmin_timeout_change'));
      triggerNotice(`This browser will sign out after ${value} minutes of inactivity.`);
    } catch (error) {
      triggerNotice(error.message || 'Unable to save the inactivity timeout.', 'error');
    }
  };

  const handleGlobalSignOut = async () => {
    setGlobalSignOutSubmitting(true);
    try {
      await authService.revokeSuperAdminRefreshTokens();
      setGlobalSignOutComplete(true);
    } catch (error) {
      triggerNotice(error.message || 'Could not terminate Super Admin sessions.', 'error');
      setShowGlobalSignOut(false);
    } finally {
      setGlobalSignOutSubmitting(false);
    }
  };

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Security & Account Settings"
          subtitle="Manage Super Admin security controls, authentication password, and active session preferences."
          user={{
            name: accountName,
            email: accountEmail,
          }}
          onNavigate={setActiveTab}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="Super Admin Security Controls"
              subtitle="Account details, password updates, and session security preferences."
            />

            {/* Toast Feedback Notice */}
            {actionNotice && (
              <div className={`settings-notice-toast ${actionNotice.type === 'error' ? 'notice-error' : 'notice-success'}`} role={actionNotice.type === 'error' ? 'alert' : 'status'}>
                {actionNotice.type === 'error' ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}
                <span>{actionNotice.msg}</span>
              </div>
            )}

            <div className="settings-content-area">
              {/* 1. Super Admin Account Summary Card */}
              <div className="settings-card-panel">
                <div className="section-title-group">
                  <h3>
                    <User size={17} className="title-icon" />
                    Super Admin Account Summary
                  </h3>
                  <p className="section-desc">
                    Account information from the authenticated Super Admin profile.
                  </p>
                </div>

                <div className="admin-account-summary-box">
                  <div className="account-summary-left">
                    <div className="account-avatar-badge" aria-hidden="true">{accountInitials}</div>
                    <div className="account-info-stack">
                      <span className="account-info-name">{accountName}</span>
                      <span className="account-info-email">{accountEmail}</span>
                    </div>
                  </div>

                  <div className="account-status-right">
                    <span className="account-status-badge">
                      {currentUser ? 'Authenticated' : 'Unavailable'}
                    </span>
                    <span className="account-role-badge">
                      {currentUser?.app_metadata?.role === 'superadmin' ? 'Super Admin' : 'Role unavailable'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Change Password Flow with Mandatory Email OTP Verification */}
              <div className="settings-card-panel">
                <div className="section-title-group">
                  <h3>
                    <Key size={17} className="title-icon" />
                    Change Password
                  </h3>
                  <p className="section-desc">
                    Mandatory two-factor email verification is required before updating your administrator password.
                  </p>
                </div>

                {/* STEP 1A: Request Email OTP */}
                {passwordFlowStep === 'request_otp' && (
                  <div className="sa-flow-container">
                    <div className="sa-flow-intro-box">
                      <div className="sa-flow-intro-icon">
                        <Mail size={22} />
                      </div>
                      <div className="sa-flow-intro-text">
                        <strong>Mandatory Two-Factor Verification</strong>
                        <p>
                          To update your Super Admin password, a 6-digit one-time verification code will be dispatched
                          to your registered administrator email address (<strong>{accountEmail}</strong>).
                        </p>
                      </div>
                    </div>

                    <div className="form-actions-row" style={{ marginTop: '16px' }}>
                      <button
                        type="button"
                        className="submit-password-btn"
                        onClick={handleRequestOtp}
                        disabled={otpSubmitting}
                      >
                        {otpSubmitting ? <Loader2 size={14} className="spin-icon" /> : <Mail size={14} />}
                        {otpSubmitting ? 'Sending Code…' : 'Send Verification Code'}
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 1B: Verify Email OTP */}
                {passwordFlowStep === 'verify_otp' && (
                  <div className="sa-flow-container">
                    <div className="sa-flow-info-box">
                      <Clock size={16} className="sa-flow-box-icon" />
                      <div>
                        <span>
                          A 6-digit verification code has been dispatched to <strong>{maskedAdminEmail}</strong>.
                          It expires in 10 minutes.
                        </span>
                      </div>
                    </div>

                    <form onSubmit={handleVerifyOtp} style={{ marginTop: '16px' }}>
                      <div className="form-field-group" style={{ maxWidth: '320px' }}>
                        <label htmlFor="sa-otp-input">Enter 6-Digit Verification Code</label>
                        <input
                          id="sa-otp-input"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          className="form-input-text sa-otp-single-input"
                          placeholder="000000"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          autoComplete="one-time-code"
                          required
                          disabled={otpSubmitting}
                          autoFocus
                        />
                      </div>

                      <div className="sa-otp-actions-bar" style={{ marginTop: '18px' }}>
                        <button
                          type="submit"
                          className="submit-password-btn"
                          disabled={otpSubmitting || otpCode.length !== 6}
                        >
                          {otpSubmitting ? <Loader2 size={14} className="spin-icon" /> : <CheckCircle2 size={14} />}
                          {otpSubmitting ? 'Verifying…' : 'Verify & Proceed'}
                        </button>

                        <button
                          type="button"
                          className="control-btn btn-secondary"
                          onClick={handleRequestOtp}
                          disabled={otpSubmitting || cooldownSeconds > 0}
                        >
                          <RefreshCw size={14} className={otpSubmitting ? 'spin-icon' : ''} />
                          {cooldownSeconds > 0 ? `Resend Code in ${cooldownSeconds}s` : 'Resend Code'}
                        </button>

                        <button
                          type="button"
                          className="control-btn btn-secondary"
                          onClick={() => {
                            setPasswordFlowStep('request_otp');
                            setOtpCode('');
                          }}
                          disabled={otpSubmitting}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* STEP 2: New Password Form (Unlocked after OTP verification) */}
                {passwordFlowStep === 'new_password' && (
                  <div className="sa-flow-container">
                    <div className="sa-flow-verified-alert">
                      <CheckCircle2 size={16} />
                      <span>Email OTP verified successfully. Enter your new administrator password below:</span>
                    </div>

                    <form onSubmit={handleNewPasswordSubmit} style={{ marginTop: '16px' }}>
                      <div className="password-form-grid">
                        <div className="form-field-group">
                          <label htmlFor="sa-new-password">New Password</label>
                          <div className="sa-password-input-wrap">
                            <input
                              id="sa-new-password"
                              type={resolvePasswordInputType(showNewPassword)}
                              className="form-input-text sa-password-input"
                              placeholder="Enter new password"
                              autoComplete="new-password"
                              required
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              disabled={passwordSubmitting}
                              autoFocus
                            />
                            <button
                              type="button"
                              className="sa-password-eye-btn"
                              onClick={() => setShowNewPassword((prev) => !prev)}
                              aria-label={resolvePasswordToggleLabel(showNewPassword, 'new password')}
                              title={resolvePasswordToggleLabel(showNewPassword, 'new password')}
                              disabled={passwordSubmitting}
                            >
                              {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                          {newPassword && (
                            <div className="sa-password-strength-wrap">
                              <div className="sa-password-strength-bar">
                                <div className={`sa-strength-segment ${passwordStrength.strength >= 1 ? 'weak' : ''}`} />
                                <div className={`sa-strength-segment ${passwordStrength.strength >= 2 ? 'fair' : ''}`} />
                                <div className={`sa-strength-segment ${passwordStrength.strength >= 3 ? 'good' : ''}`} />
                                <div className={`sa-strength-segment ${passwordStrength.strength >= 4 ? 'strong' : ''}`} />
                              </div>
                              <span className="sa-password-strength-label">
                                Password strength: <strong>{passwordStrength.label}</strong>
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="form-field-group">
                          <label htmlFor="sa-confirm-password">Confirm New Password</label>
                          <div className="sa-password-input-wrap">
                            <input
                              id="sa-confirm-password"
                              type={resolvePasswordInputType(showConfirmPassword)}
                              className="form-input-text sa-password-input"
                              placeholder="Re-enter your password"
                              autoComplete="new-password"
                              required
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              disabled={passwordSubmitting}
                            />
                            <button
                              type="button"
                              className="sa-password-eye-btn"
                              onClick={() => setShowConfirmPassword((prev) => !prev)}
                              aria-label={resolvePasswordToggleLabel(showConfirmPassword, 'confirm new password')}
                              title={resolvePasswordToggleLabel(showConfirmPassword, 'confirm new password')}
                              disabled={passwordSubmitting}
                            >
                              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="sa-otp-actions-bar" style={{ marginTop: '20px' }}>
                        <button type="submit" className="submit-password-btn" disabled={passwordSubmitting}>
                          {passwordSubmitting ? <Loader2 size={14} className="spin-icon" /> : <Lock size={14} />}
                          {passwordSubmitting ? 'Updating…' : 'Update Password'}
                        </button>
                        <button
                          type="button"
                          className="control-btn btn-secondary"
                          onClick={() => {
                            setPasswordFlowStep('request_otp');
                            setOtpCode('');
                            setPasswordChangeToken('');
                          }}
                          disabled={passwordSubmitting}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* STEP 3: Post-Change Device Session Management */}
                {passwordFlowStep === 'session_choice' && (
                  <div className="sa-flow-container">
                    <div className="sa-session-choice-hero">
                      <div className="sa-session-choice-icon-wrap">
                        <CheckCircle2 size={28} className="sa-session-success-icon" />
                      </div>
                      <div className="sa-session-choice-header">
                        <h4>Your password has been successfully changed. What would you like to do with your other devices?</h4>
                        <p className="section-desc" style={{ marginTop: '4px' }}>
                          Select how active sessions across your browsers and devices should be handled.
                        </p>
                      </div>
                    </div>

                    <div className="sa-session-cards-grid">
                      {/* Option A: Keep Devices Signed In */}
                      <div className="sa-session-card">
                        <div className="sa-session-card-top">
                          <span className="sa-session-badge badge-active">Option A</span>
                          <h5>Keep Devices Signed In</h5>
                        </div>
                        <p className="sa-session-card-body">
                          Keep your existing authenticated devices signed in where supported. Your password
                          change may automatically revoke other sessions depending on Supabase Auth behavior.
                        </p>
                        <div className="sa-session-card-action">
                          <button
                            type="button"
                            className="control-btn btn-secondary"
                            onClick={() => handleOpenSessionModal('keep_sessions')}
                            disabled={sessionChoiceSubmitting}
                            style={{ width: '100%', justifyContent: 'center' }}
                          >
                            <Smartphone size={14} />
                            Keep Devices Signed In
                          </button>
                        </div>
                      </div>

                      {/* Option B: Log Out All Devices */}
                      <div className="sa-session-card highlighted-danger">
                        <div className="sa-session-card-top">
                          <span className="sa-session-badge badge-danger">Option B (Recommended)</span>
                          <h5>Log Out All Devices</h5>
                        </div>
                        <p className="sa-session-card-body">
                          This will sign you out of VoxReview Super Admin on ALL devices, including this current
                          browser. You must log in again with your email, password, and verification code.
                        </p>
                        <div className="sa-session-card-action">
                          <button
                            type="button"
                            className="control-btn sa-btn-danger"
                            onClick={() => handleOpenSessionModal('logout_all')}
                            disabled={sessionChoiceSubmitting}
                            style={{ width: '100%', justifyContent: 'center' }}
                          >
                            <LogOut size={14} />
                            Log Out All Devices
                          </button>
                        </div>
                      </div>
                    </div>

                    {selectedSessionOption && (
                      <SessionChoiceConfirmationModal
                        variant={selectedSessionOption}
                        onCancel={handleCancelSessionModal}
                        onConfirm={handleConfirmSessionChoice}
                        isSubmitting={sessionChoiceSubmitting}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* 3. Session & Security Preferences */}
              <div className="settings-card-panel">
                <div className="section-title-group">
                  <h3>
                    <ShieldCheck size={17} className="title-icon" />
                    Session Security &amp; Preferences
                  </h3>
                  <p className="section-desc">
                    Current-browser inactivity control and provider-supported refresh-token revocation.
                  </p>
                </div>

                <div className="controls-grid">
                  {/* Current Session Logout */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Logout Current Session</strong>
                      <span>Sign out of the current Super Admin console session on this browser.</span>
                    </div>
                    <button type="button" className="control-btn btn-secondary" onClick={onSignOut}>
                      <LogOut size={14} />
                      Logout Current Session
                    </button>
                  </div>

                  {/* Cross-device refresh-token revocation */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Revoke Sessions Across Devices</strong>
                      <span>
                        Revoke refresh tokens across devices. Existing access tokens may remain valid until they expire.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="control-btn btn-danger"
                      onClick={() => {
                        setGlobalSignOutComplete(false);
                        setShowGlobalSignOut(true);
                      }}
                    >
                      <ShieldCheck size={14} />
                      Revoke Refresh Tokens
                    </button>
                  </div>

                  {/* Inactivity Timeout Dropdown */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Session Inactivity Timeout</strong>
                      <span>Applies to this browser and its tabs only; the preference is stored locally.</span>
                    </div>
                    <select
                      value={sessionTimeout}
                      onChange={(e) => handleTimeoutChange(e.target.value)}
                      className="setting-select width-auto"
                      aria-label="Session inactivity timeout for this browser"
                    >
                      {SESSION_TIMEOUT_OPTIONS.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes < 60 ? `${minutes} Minutes` : `${minutes / 60} Hour${minutes === 60 ? '' : 's'}`}
                          {minutes === DEFAULT_SESSION_TIMEOUT_MINUTES ? ' (Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="control-item">
                    <div className="control-info">
                      <strong>Admin Security Notifications</strong>
                      <span>
                        Failed Super Admin login attempts generate in-app security alerts. Per-account notification preferences are not supported.
                      </span>
                    </div>
                    <span className="setting-informational-badge">System-managed</span>
                  </div>
                </div>
              </div>

              {/* 4. Reference Banner to Admin Activity Logs */}
              <div className="logs-link-banner">
                <div className="logs-link-left">
                  <ShieldAlert size={20} className="logs-link-icon" />
                  <div className="logs-link-text">
                    <h5>Admin Activity Logs &amp; Audit Trail</h5>
                    <p>Review Super Admin authentication and configuration events on the dedicated logs page.</p>
                  </div>
                </div>

                <button type="button" className="open-logs-btn" onClick={() => setActiveTab('logs')}>
                  View Activity Logs
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </article>
        </section>
      </main>
      {showGlobalSignOut && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-content-card settings-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-signout-title"
          >
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="modal-icon-badge"><ShieldAlert size={18} /></div>
                <div>
                  <h3 id="global-signout-title">
                    {globalSignOutComplete ? 'Refresh tokens revoked' : 'Revoke refresh tokens across devices?'}
                  </h3>
                  <p className="modal-user-subtitle">
                    {globalSignOutComplete
                      ? 'Supabase revoked refresh tokens. Previously issued access tokens can remain usable until their expiry.'
                      : 'Supabase can revoke refresh tokens across devices, but previously issued access tokens are not guaranteed to expire immediately.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="settings-dialog-actions">
              {globalSignOutComplete ? (
                <button
                  type="button"
                  className="settings-danger-action"
                  onClick={() => navigate('/superadmin/login', { replace: true })}
                >
                  Continue to Login
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="platform-confirmation-cancel"
                    onClick={() => setShowGlobalSignOut(false)}
                    disabled={globalSignOutSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="settings-danger-action"
                    onClick={handleGlobalSignOut}
                    disabled={globalSignOutSubmitting}
                  >
                    {globalSignOutSubmitting ? 'Revoking…' : 'Revoke Refresh Tokens'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
