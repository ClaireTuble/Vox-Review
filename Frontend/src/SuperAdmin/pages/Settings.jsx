import { useState } from 'react';
import { Settings as SettingsIcon, Moon, Lock, LogOut, ShieldCheck, CheckCircle2, User, Palette } from 'lucide-react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopActions from '../components/TopActions.jsx';
import { mockCurrentUser } from '../data/users.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/responsive.css';

export default function Settings({ activeTab, setActiveTab, onSignOut }) {
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [density, setDensity] = useState('comfortable');
  const [actionNotice, setActionNotice] = useState(null);

  const triggerNotice = (msg) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Super Admin Settings"
          subtitle="Manage appearance, account preferences, and admin session security controls."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="Console Preferences & Controls"
              subtitle="General settings for the Super Admin dashboard interface and active sessions."
            />

            {/* Toast Notice */}
            {actionNotice && (
              <div className="settings-notice-toast">
                <CheckCircle2 size={15} />
                <span>{actionNotice}</span>
              </div>
            )}

            <div className="settings-section-container">
              {/* Account & Profile Summary */}
              <div className="settings-card-panel">
                <div className="section-title-group">
                  <h3>
                    <User size={17} className="title-icon" />
                    Admin Account Profile
                  </h3>
                  <p className="section-desc">Internal administrator account details and active console authority.</p>
                </div>

                <div className="admin-profile-box">
                  <div className="profile-avatar-circle">SA</div>
                  <div className="profile-details-stack">
                    <strong className="profile-name">{mockCurrentUser.name}</strong>
                    <span className="profile-email">{mockCurrentUser.email}</span>
                    <span className="profile-role-badge">Role: {mockCurrentUser.role}</span>
                  </div>
                </div>
              </div>

              {/* Appearance Preferences */}
              <div className="settings-card-panel">
                <div className="section-title-group">
                  <h3>
                    <Palette size={17} className="title-icon" />
                    Appearance & Theme
                  </h3>
                  <p className="section-desc">Customize interface visual theme and table layout density.</p>
                </div>

                <div className="controls-grid">
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Theme Mode</strong>
                      <span>Default system theme for administrator console.</span>
                    </div>
                    <span className="theme-pill-active">
                      <Moon size={13} /> Dark Mode (Active)
                    </span>
                  </div>

                  <div className="control-item">
                    <div className="control-info">
                      <strong>Table Layout Density</strong>
                      <span>Adjust spacing and padding for data tables across pages.</span>
                    </div>
                    <select
                      value={density}
                      onChange={(e) => {
                        setDensity(e.target.value);
                        triggerNotice(`Table density set to ${e.target.value}.`);
                      }}
                      className="setting-select width-auto"
                    >
                      <option value="comfortable">Comfortable (Default)</option>
                      <option value="compact">Compact</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Basic Session & Security Controls */}
              <div className="settings-card-panel">
                <div className="section-title-group">
                  <h3>
                    <Lock size={17} className="title-icon" />
                    Session & Security Controls
                  </h3>
                  <p className="section-desc">Manage active sessions and inactivity timeouts for administrative safety.</p>
                </div>

                <div className="controls-grid">
                  {/* Logout Current Session */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Logout Current Session</strong>
                      <span>Terminates your current Super Admin authentication session on this device.</span>
                    </div>
                    <button className="control-btn btn-secondary" onClick={onSignOut}>
                      <LogOut size={14} />
                      Logout Current Session
                    </button>
                  </div>

                  {/* Logout All Sessions */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Logout All Sessions</strong>
                      <span>Invalidates all active Super Admin sessions across all devices.</span>
                    </div>
                    <button
                      className="control-btn btn-danger"
                      onClick={() => triggerNotice('Logged out all active Super Admin sessions across devices.')}
                    >
                      <ShieldCheck size={14} />
                      Terminate All Sessions
                    </button>
                  </div>

                  {/* Session Inactivity Timeout */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Session Inactivity Timeout</strong>
                      <span>Automatically logs out the Super Admin after a period of inactivity.</span>
                    </div>
                    <select
                      value={sessionTimeout}
                      onChange={(e) => {
                        setSessionTimeout(e.target.value);
                        triggerNotice(`Session timeout set to ${e.target.value} minutes.`);
                      }}
                      className="setting-select width-auto"
                    >
                      <option value="15">15 Minutes</option>
                      <option value="30">30 Minutes</option>
                      <option value="60">1 Hour</option>
                      <option value="240">4 Hours</option>
                    </select>
                  </div>

                  {/* Security Login Notifications Toggle */}
                  <div className="control-item">
                    <div className="control-info">
                      <strong>Admin Security Notifications</strong>
                      <span>Alert Super Admin when a new or failed login attempt occurs.</span>
                    </div>
                    <button
                      type="button"
                      className={`toggle-switch-btn ${notificationsEnabled ? 'on' : 'off'}`}
                      onClick={() => {
                        setNotificationsEnabled((prev) => !prev);
                        triggerNotice(`Security notifications ${!notificationsEnabled ? 'enabled' : 'disabled'}.`);
                      }}
                    >
                      <span className="toggle-slider" />
                      <span className="toggle-text">{notificationsEnabled ? 'Enabled' : 'Disabled'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
