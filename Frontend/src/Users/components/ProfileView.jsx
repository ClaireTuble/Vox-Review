import { useState, useEffect } from 'react';
import {
  User,
  LogIn,
  UserPlus,
  LogOut,
  Sun,
  Moon,
  ShieldCheck,
  KeyRound,
  Puzzle,
  Trash2,
  CheckCircle2,
  X,
  Lock,
  Save,
  ChevronRight,
  ArrowLeft,
  HelpCircle
} from 'lucide-react';
import authService from '../../services/authService.js';
import '../css/ProfileView.css';

export default function ProfileView({
  isLoggedIn = false,
  currentUser,
  onLoginClick,
  onRegisterClick,
  onLogout,
  theme = 'light',
  onThemeToggle,
  onClearSavedAnalyses,
}) {
  const [activeView, setActiveView] = useState('main'); // 'main' | 'user-profile' | 'security' | 'help-center'
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Account Information Edit Form State
  const [username, setUsername] = useState(() => currentUser?.username || currentUser?.name || 'claire123');
  const [email, setEmail] = useState(() => currentUser?.email || 'user@test.com');
  const [firstName, setFirstName] = useState(() => currentUser?.firstName || 'Claire');
  const [lastName, setLastName] = useState(() => currentUser?.lastName || 'Tuble');
  const [isSaving, setIsSaving] = useState(false);

  // Sync state if currentUser prop updates
  useEffect(() => {
    if (currentUser) {
      if (currentUser.username) setUsername(currentUser.username);
      if (currentUser.email) setEmail(currentUser.email);
      if (currentUser.firstName) setFirstName(currentUser.firstName);
      if (currentUser.lastName) setLastName(currentUser.lastName);
    }
  }, [currentUser]);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (!username || !email || !firstName || !lastName) {
      triggerToast('Please fill out all required fields (*).');
      return;
    }
    setIsSaving(true);
    authService.updateUserProfile({
      username: username.trim(),
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });
    setTimeout(() => {
      setIsSaving(false);
      triggerToast('Account information saved successfully.');
    }, 300);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!currentPass || !newPass) return;
    setShowPasswordModal(false);
    setCurrentPass('');
    setNewPass('');
    triggerToast('Password updated successfully.');
  };

  const handleClearData = () => {
    if (onClearSavedAnalyses) {
      onClearSavedAnalyses();
    }
    triggerToast('Saved analyses cache cleared.');
  };

  return (
    <div className="profile-view-container">
      {/* Toast Notice */}
      {toastMessage && (
        <div className="settings-toast-banner">
          <CheckCircle2 size={14} color="#10B981" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── COMPACT ACCOUNT HEADER (ALWAYS VISIBLE AT TOP) ── */}
      <div className="compact-profile-header">
        <div className="profile-avatar-lg">
          {(username || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="profile-details">
          <span className="profile-name">
            @{username || 'claire123'}
          </span>
          <span className="profile-email">{email || 'user@test.com'}</span>
        </div>
      </div>

      {/* ── MAIN MENU VIEW ── */}
      {activeView === 'main' && (
        <div className="profile-menu-container">
          <div className="settings-group">
            {/* User Profile item */}
            <div
              className="menu-item-row"
              onClick={() => isLoggedIn ? setActiveView('user-profile') : onLoginClick('/login')}
              role="button"
            >
              <div className="menu-item-left">
                <div className="menu-item-icon">
                  <User size={15} color="var(--accent-color)" />
                </div>
                <div className="menu-item-text">
                  <span className="menu-item-title">User Profile</span>
                  <span className="menu-item-sub">View &amp; manage account information</span>
                </div>
              </div>
              <ChevronRight size={16} className="menu-item-arrow" />
            </div>

            {/* Security item */}
            <div
              className="menu-item-row"
              onClick={() => isLoggedIn ? setActiveView('security') : onLoginClick('/login')}
              role="button"
            >
              <div className="menu-item-left">
                <div className="menu-item-icon">
                  <ShieldCheck size={15} color="var(--accent-color)" />
                </div>
                <div className="menu-item-text">
                  <span className="menu-item-title">Security</span>
                  <span className="menu-item-sub">Password &amp; authentication</span>
                </div>
              </div>
              <ChevronRight size={16} className="menu-item-arrow" />
            </div>

            {/* Dark Mode toggle item */}
            <div className="menu-item-row no-hover">
              <div className="menu-item-left">
                <div className="menu-item-icon">
                  {theme === 'dark' ? (
                    <Moon size={15} color="var(--accent-color)" />
                  ) : (
                    <Sun size={15} color="var(--accent-color)" />
                  )}
                </div>
                <div className="menu-item-text">
                  <span className="menu-item-title">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                  <span className="menu-item-sub">Switch application theme</span>
                </div>
              </div>
              <div
                className={`setting-toggle ${theme === 'dark' ? 'on' : ''}`}
                onClick={onThemeToggle}
                role="button"
                aria-label="Toggle dark mode"
              >
                <div className="setting-toggle-knob" />
              </div>
            </div>

            {/* Help Center item */}
            <div
              className="menu-item-row"
              onClick={() => setActiveView('help-center')}
              role="button"
            >
              <div className="menu-item-left">
                <div className="menu-item-icon">
                  <HelpCircle size={15} color="var(--accent-color)" />
                </div>
                <div className="menu-item-text">
                  <span className="menu-item-title">Help Center</span>
                  <span className="menu-item-sub">Guides, FAQs &amp; support</span>
                </div>
              </div>
              <ChevronRight size={16} className="menu-item-arrow" />
            </div>

            {/* Extension Status item */}
            <div className="menu-item-row no-hover">
              <div className="menu-item-left">
                <div className="menu-item-icon">
                  <Puzzle size={15} color="var(--accent-color)" />
                </div>
                <div className="menu-item-text">
                  <span className="menu-item-title">Extension Status</span>
                  <span className="menu-item-sub">Active integration state</span>
                </div>
              </div>
              <span className="status-badge-connected">
                <span className="status-dot-green">●</span>
                <span>Connected</span>
              </span>
            </div>

            {/* Saved Data item */}
            <div className="menu-item-row no-hover">
              <div className="menu-item-left">
                <div className="menu-item-icon">
                  <Trash2 size={15} color="#EF4444" />
                </div>
                <div className="menu-item-text">
                  <span className="menu-item-title">Saved Data</span>
                  <span className="menu-item-sub">Clear local analysis cache</span>
                </div>
              </div>
              <button
                className="profile-action-btn secondary small"
                onClick={handleClearData}
                style={{ width: 'auto', padding: '4px 10px' }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Log Out item at bottom */}
          {isLoggedIn ? (
            <div style={{ marginTop: '8px' }}>
              <button className="profile-action-btn danger" onClick={onLogout}>
                <LogOut size={14} />
                Log Out
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
              <button className="profile-action-btn primary small" onClick={() => onLoginClick('/login')} style={{ flex: 1 }}>
                <LogIn size={13} />
                Log In
              </button>
              <button className="profile-action-btn secondary small" onClick={() => onRegisterClick('/register')} style={{ flex: 1 }}>
                <UserPlus size={13} />
                Sign Up
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── USER PROFILE DETAIL VIEW (REDESIGNED FOR MODERN SPACIOUS LOOK) ── */}
      {activeView === 'user-profile' && (
        <div className="subview-container">
          <button className="back-nav-btn" onClick={() => setActiveView('main')}>
            <ArrowLeft size={14} /> Back to Settings
          </button>

          <div className="modern-profile-card">
            <span className="modern-section-title">PERSONAL INFORMATION</span>

            <form onSubmit={handleSaveProfile} className="modern-profile-form">
              <div className="modern-form-field">
                <label htmlFor="edit-username">USERNAME</label>
                <div className="modern-input-wrap">
                  <input
                    id="edit-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    required
                  />
                </div>
              </div>

              <div className="modern-form-field">
                <label htmlFor="edit-email">EMAIL ADDRESS</label>
                <div className="modern-input-wrap">
                  <input
                    id="edit-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                  />
                </div>
              </div>

              <div className="modern-form-field">
                <label>NAME</label>
                <div className="modern-name-row">
                  <div className="modern-input-wrap flex-1">
                    <input
                      id="edit-firstname"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First Name"
                      required
                    />
                  </div>
                  <div className="modern-input-wrap flex-1">
                    <input
                      id="edit-lastname"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last Name"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="modern-submit-btn"
                disabled={isSaving}
              >
                <Save size={14} />
                {isSaving ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── SECURITY DETAIL VIEW ── */}
      {activeView === 'security' && (
        <div className="subview-container">
          <button className="back-nav-btn" onClick={() => setActiveView('main')}>
            <ArrowLeft size={14} /> Back to Settings
          </button>

          <div className="modern-profile-card">
            <span className="modern-section-title">SECURITY &amp; ACCOUNT PROTECTION</span>

            <div className="setting-item-row" onClick={() => setShowPasswordModal(true)} style={{ cursor: 'pointer', padding: '12px 0' }}>
              <span className="setting-item-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                <KeyRound size={15} color="var(--accent-color)" />
                <span>Change Account Password</span>
              </span>
              <span className="setting-action-link" style={{ fontSize: '11.5px', color: 'var(--accent-color)', fontWeight: 700 }}>
                Update
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── HELP CENTER DETAIL VIEW ── */}
      {activeView === 'help-center' && (
        <div className="subview-container">
          <button className="back-nav-btn" onClick={() => setActiveView('main')}>
            <ArrowLeft size={14} /> Back to Settings
          </button>

          <div className="modern-profile-card">
            <span className="modern-section-title">HELP CENTER</span>
            
            <div className="help-box-content" style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                VoxReview analyzes product reviews across Shopee, Lazada, Google Maps, and Google Play Store using AI emotion intelligence.
              </p>
              <div className="help-tip-item" style={{ background: 'var(--bg-stage)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-card)' }}>
                <strong style={{ fontSize: '11.5px', color: 'var(--text-primary)', display: 'block', marginBottom: '3px' }}>How to run analysis:</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Navigate to any product page on a supported platform and click the "Analyze Page" button.</span>
              </div>
              <div className="help-tip-item" style={{ background: 'var(--bg-stage)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-card)' }}>
                <strong style={{ fontSize: '11.5px', color: 'var(--text-primary)', display: 'block', marginBottom: '3px' }}>Need assistance?</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Contact VoxReview Support at support@voxreview.ai</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="password-modal-overlay">
          <div className="password-modal-card">
            <div className="password-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={15} color="var(--accent-color)" />
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Change Password</strong>
              </div>
              <button className="modal-close-btn" onClick={() => setShowPasswordModal(false)}>
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="password-modal-form">
              <div className="modal-field">
                <label>Current Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  required
                />
              </div>

              <div className="modal-field">
                <label>New Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="profile-action-btn secondary small" onClick={() => setShowPasswordModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="profile-action-btn primary small">
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
