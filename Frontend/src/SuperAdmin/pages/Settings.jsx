import { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  LogOut,
  CheckCircle2,
  User,
  Check,
  ShieldAlert,
  ChevronRight,
  Key,
} from 'lucide-react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopActions from '../components/TopActions.jsx';
import { mockCurrentUser } from '../data/users.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/settings.css';
import '../css/responsive.css';

export default function Settings({ activeTab, setActiveTab, onSignOut }) {
  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Preferences State
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [actionNotice, setActionNotice] = useState(null);

  const triggerNotice = (msg) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      triggerNotice('Please complete all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      triggerNotice('New passwords do not match. Please verify.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    triggerNotice('Super Admin password updated successfully (UI demo state).');
  };

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Security & Account Settings"
          subtitle="Manage Super Admin security controls, authentication password, and active session preferences."
          user={mockCurrentUser}
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
              <div className="settings-notice-toast">
                <CheckCircle2 size={15} />
                <span>{actionNotice}</span>
              </div>
            )}

            <div className="settings-content-area" style={{ maxWidth: '960px' }}>
              {/* 1. Super Admin Account Summary Card */}
              <div className="settings-card-panel">
                <div className="section-title-group">
                  <h3>
                    <User size={17} className="title-icon" />
                    Super Admin Account Summary
                  </h3>
                  <p className="section-desc">
                    Primary administrator account credentials and active system authority.
                  </p>
                </div>

                <div className="admin-account-summary-box">
                  <div className="account-summary-left">
                    <div className="account-avatar-badge">SA</div>
                    <div className="account-info-stack">
                      <span className="account-info-name">
                        {mockCurrentUser.name || 'Platform SuperAdmin'}
                      </span>
                      <span className="account-info-email">
                        {mockCurrentUser.email || 'admin@test.com'}
                      </span>
                    </div>
                  </div>

                  <div className="account-status-right">
                    <span className="account-status-badge">
                      <Check size={12} /> Active Account
                    </span>
                    <span className="account-role-badge">Super Admin</span>
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
                      <label>Current Password</label>
                      <input
                        type="password"
                        className="form-input-text"
                        placeholder="••••••••"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    </div>

                    <div className="form-field-group">
                      <label>New Password</label>
                      <input
                        type="password"
                        className="form-input-text"
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>

                    <div className="form-field-group">
                      <label>Confirm New Password</label>
                      <input
                        type="password"
                        className="form-input-text"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-actions-row">
                    <button type="submit" className="submit-password-btn">
                      <Lock size={14} />
                      Update Password
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
                    Administrative session timeout limits, security notifications, and session revocation.
                  </p>
                </div>

                <div className="controls-grid">
                  {/* Current Session Logout */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Logout Current Session</strong>
                      <span>Sign out of the current Super Admin console session on this browser.</span>
                    </div>
                    <button className="control-btn btn-secondary" onClick={onSignOut}>
                      <LogOut size={14} />
                      Logout Current Session
                    </button>
                  </div>

                  {/* Terminate All Sessions */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Terminate All Active Sessions</strong>
                      <span>Revoke all active Super Admin authorization tokens across devices.</span>
                    </div>
                    <button
                      className="control-btn btn-danger"
                      onClick={() =>
                        triggerNotice('Terminated all active Super Admin sessions across devices.')
                      }
                    >
                      <ShieldCheck size={14} />
                      Terminate All Sessions
                    </button>
                  </div>

                  {/* Inactivity Timeout Dropdown */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Session Inactivity Timeout</strong>
                      <span>Automatically log out after specified period of inactivity.</span>
                    </div>
                    <select
                      value={sessionTimeout}
                      onChange={(e) => {
                        setSessionTimeout(e.target.value);
                        triggerNotice(`Inactivity timeout set to ${e.target.value} minutes.`);
                      }}
                      className="setting-select width-auto"
                    >
                      <option value="15">15 Minutes</option>
                      <option value="30">30 Minutes (Default)</option>
                      <option value="60">1 Hour</option>
                      <option value="240">4 Hours</option>
                    </select>
                  </div>

                  {/* Admin Security Notifications Toggle */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Admin Security Notifications</strong>
                      <span>Receive notifications for login attempts and security alerts.</span>
                    </div>
                    <button
                      type="button"
                      className={`toggle-switch-btn ${notificationsEnabled ? 'on' : 'off'}`}
                      onClick={() => {
                        setNotificationsEnabled((prev) => !prev);
                        triggerNotice(
                          `Security notifications ${!notificationsEnabled ? 'enabled' : 'disabled'}.`
                        );
                      }}
                    >
                      <span className="toggle-slider" />
                      <span className="toggle-text">
                        {notificationsEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. Reference Banner to Admin Activity Logs */}
              <div className="logs-link-banner">
                <div className="logs-link-left">
                  <ShieldAlert size={20} className="logs-link-icon" />
                  <div className="logs-link-text">
                    <h5>Admin Activity Logs &amp; Audit Trail</h5>
                    <p>
                      View detailed login history, IP address logs, and security alert events on the dedicated logs page.
                    </p>
                  </div>
                </div>

                <button className="open-logs-btn" onClick={() => setActiveTab('logs')}>
                  View Activity Logs
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
