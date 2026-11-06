import { useState } from 'react';
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
} from 'lucide-react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopActions from '../components/TopActions.jsx';
import authService from '../../services/authService.js';
import {
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  SESSION_TIMEOUT_OPTIONS,
  getSessionTimeoutPreference,
  saveSessionTimeoutPreference,
  validatePasswordChange,
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(String(initialTimeoutPreference.minutes));
  const [actionNotice, setActionNotice] = useState(initialTimeoutPreference.error
    ? { msg: initialTimeoutPreference.error, type: 'error' }
    : null);
  const [showGlobalSignOut, setShowGlobalSignOut] = useState(false);
  const [globalSignOutSubmitting, setGlobalSignOutSubmitting] = useState(false);
  const [globalSignOutComplete, setGlobalSignOutComplete] = useState(false);

  const triggerNotice = (msg, type = 'success') => {
    setActionNotice({ msg, type });
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    const validationMessage = validatePasswordChange({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (validationMessage) {
      triggerNotice(validationMessage, 'error');
      return;
    }

    setPasswordSubmitting(true);
    try {
      await authService.changeSuperAdminPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      triggerNotice('Password updated successfully.');
    } catch (error) {
      triggerNotice(error.message || 'Password update failed.', 'error');
    } finally {
      setPasswordSubmitting(false);
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

              {/* 2. Change Password Form */}
              <div className="settings-card-panel">
                <div className="section-title-group">
                  <h3>
                    <Key size={17} className="title-icon" />
                    Change Password
                  </h3>
                  <p className="section-desc">
                    Update the Super Admin account authentication password.
                  </p>
                </div>

                <form onSubmit={handlePasswordSubmit}>
                  <div className="password-form-grid">
                    <div className="form-field-group">
                      <label htmlFor="sa-current-password">Current Password</label>
                      <input
                        id="sa-current-password"
                        type="password"
                        className="form-input-text"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        disabled={passwordSubmitting}
                      />
                    </div>

                    <div className="form-field-group">
                      <label htmlFor="sa-new-password">New Password</label>
                      <input
                        id="sa-new-password"
                        type="password"
                        className="form-input-text"
                        placeholder="Enter new password"
                        autoComplete="new-password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={passwordSubmitting}
                      />
                    </div>

                    <div className="form-field-group">
                      <label htmlFor="sa-confirm-password">Confirm New Password</label>
                      <input
                        id="sa-confirm-password"
                        type="password"
                        className="form-input-text"
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={passwordSubmitting}
                      />
                    </div>
                  </div>

                  <div className="form-actions-row">
                    <button type="submit" className="submit-password-btn" disabled={passwordSubmitting}>
                      {passwordSubmitting ? <Loader2 size={14} className="spin-icon" /> : <Lock size={14} />}
                      {passwordSubmitting ? 'Updating…' : 'Update Password'}
                    </button>
                  </div>
                </form>
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
                  onClick={() => navigate('/admin/login', { replace: true })}
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
