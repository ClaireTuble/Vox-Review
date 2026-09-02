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
  HelpCircle,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import authService, { normalizeAuthErrorMessage } from '../../services/authService.js';
import ProfileChangesConfirmationModal from './ProfileChangesConfirmationModal.jsx';
import VerificationCodeModal from './VerificationCodeModal.jsx';
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
  onProfileUpdated,
}) {
  const [activeView, setActiveView] = useState('main'); // 'main' | 'user-profile' | 'security' | 'help-center'
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showPasswordSuccessModal, setShowPasswordSuccessModal] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  // Account Information Edit Form State
  const [username, setUsername] = useState(() => currentUser?.username || currentUser?.name || '');
  const [email, setEmail] = useState(() => currentUser?.email || '');
  const [firstName, setFirstName] = useState(() => currentUser?.firstName || '');
  const [lastName, setLastName] = useState(() => currentUser?.lastName || '');
  const [savedProfile, setSavedProfile] = useState(() => ({
    username: currentUser?.username || currentUser?.name || '',
    email: currentUser?.email || '',
    firstName: currentUser?.firstName || '',
    lastName: currentUser?.lastName || '',
    fullName: currentUser?.fullName || currentUser?.name || '',
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [pendingProfileSave, setPendingProfileSave] = useState(null);

  // Sync state if currentUser prop updates
  useEffect(() => {
    if (currentUser) {
      setSavedProfile({
        username: currentUser.username || currentUser.name || '',
        email: currentUser.email || '',
        firstName: currentUser.firstName || '',
        lastName: currentUser.lastName || '',
        fullName: currentUser.fullName || currentUser.name || '',
      });
      if (currentUser.username) setUsername(currentUser.username);
      if (currentUser.email) setEmail(currentUser.email);
      if (currentUser.firstName !== undefined) setFirstName(currentUser.firstName);
      if (currentUser.lastName !== undefined) setLastName(currentUser.lastName);
    }
  }, [currentUser]);

  const triggerToast = (msg, type = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      triggerToast('Please fill out first name and last name.', 'error');
      return;
    }

    const currentName = currentUser?.fullName
      || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ').trim()
      || currentUser?.name
      || '';
    const nextName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const currentUsername = currentUser?.username || '';
    const nextUsername = username.trim();
    const changes = [];

    if (currentName !== nextName) {
      changes.push({ label: 'Name', prefix: '', currentValue: currentName, nextValue: nextName });
    }
    if (currentUsername !== nextUsername) {
      changes.push({ label: 'Username', prefix: '@', currentValue: currentUsername, nextValue: nextUsername });
    }

    if (changes.length === 0) {
      triggerToast('No profile changes to save.', 'error');
      return;
    }

    setPendingProfileSave({
      changes,
      username: nextUsername,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });
  };

  const confirmSaveProfile = async () => {
    if (!pendingProfileSave || isSaving) return;
    setIsSaving(true);
    try {
      const result = await authService.updateUserProfile({
        username: pendingProfileSave.username,
        firstName: pendingProfileSave.firstName,
        lastName: pendingProfileSave.lastName,
      });
      const updatedUser = result?.user;
      if (updatedUser) {
        setUsername(updatedUser.username || pendingProfileSave.username);
        setFirstName(updatedUser.firstName || pendingProfileSave.firstName);
        setLastName(updatedUser.lastName || pendingProfileSave.lastName);
        setSavedProfile({
          username: updatedUser.username || pendingProfileSave.username,
          email: updatedUser.email || savedProfile.email,
          firstName: updatedUser.firstName || pendingProfileSave.firstName,
          lastName: updatedUser.lastName || pendingProfileSave.lastName,
          fullName: updatedUser.fullName || `${pendingProfileSave.firstName} ${pendingProfileSave.lastName}`.trim(),
        });
        onProfileUpdated?.(updatedUser);
      }
      triggerToast('Account information saved successfully.', 'success');
    } catch (err) {
      triggerToast(err?.message || 'Failed to save account information.', 'error');
    } finally {
      setIsSaving(false);
      setPendingProfileSave(null);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!currentPass.trim()) {
      triggerToast('Please enter your current password.', 'error');
      return;
    }
    if (!newPass || !confirmPass) {
      triggerToast('Please enter both new password and confirmation password.', 'error');
      return;
    }
    if (newPass !== confirmPass) {
      triggerToast('New passwords do not match.', 'error');
      return;
    }
    if (newPass.length < 8 || !/[a-z]/i.test(newPass) || !/\d/.test(newPass)) {
      triggerToast('New password does not meet the required security requirements.', 'error');
      return;
    }

    setIsChangingPassword(true);
    try {
      // Direct authenticated password update: verifies current password & updates credentials
      await authService.changePassword(newPass, currentPass.trim());
      setShowPasswordModal(false);
      setShowPasswordSuccessModal(true);
      triggerToast('Password changed successfully.', 'success');
    } catch (err) {
      triggerToast(normalizeAuthErrorMessage(err, 'change-password'), 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleStaySignedIn = async () => {
    if (isCheckingSession) return;
    setIsCheckingSession(true);
    setShowPasswordSuccessModal(false);
    setCurrentPass('');
    setNewPass('');
    setConfirmPass('');
    setShowCurrentPass(false);
    setShowNewPass(false);
    setShowConfirmPass(false);
    triggerToast('Password updated successfully. You remain signed in.', 'success');
    setIsCheckingSession(false);
  };

  const handleSignInAgain = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      setShowPasswordSuccessModal(false);
      await onLogout?.();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleClearData = () => {
    if (onClearSavedAnalyses) {
      onClearSavedAnalyses();
    }
    triggerToast('Saved analyses cache cleared.');
  };

  return (
    <div className="profile-view-container">
      {/* ── TOP EXTENSION NOTIFICATION BANNER (Elevated above modals & UI content) ── */}
      {toastMessage && (
        <div
          className={`settings-toast-banner ${toastType || 'success'}`}
          role="alert"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 12px',
            borderRadius: '10px',
            marginBottom: '4px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.16)'
          }}
        >
          {toastType === 'error' ? (
            <X size={15} color="#EF4444" style={{ flexShrink: 0 }} />
          ) : toastType === 'warning' ? (
            <AlertTriangle size={15} color="#F59E0B" style={{ flexShrink: 0 }} />
          ) : (
            <CheckCircle2 size={15} color="#10B981" style={{ flexShrink: 0 }} />
          )}
          <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, lineHeight: 1.35 }}>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'currentColor',
              opacity: 0.7,
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px'
            }}
            aria-label="Dismiss notification"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── COMPACT ACCOUNT HEADER (ALWAYS VISIBLE AT TOP) ── */}
      <div className="compact-profile-header">
        <div className="profile-avatar-lg">
          {(savedProfile.firstName || savedProfile.username || savedProfile.email || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="profile-details">
          <span className="profile-name">
            {savedProfile.firstName || savedProfile.lastName
              ? `${savedProfile.firstName} ${savedProfile.lastName}`.trim()
              : savedProfile.fullName || `@${savedProfile.username || savedProfile.email?.split('@')[0] || 'user'}`}
          </span>
          <span className="profile-email">{savedProfile.email || ''}</span>
          {savedProfile.username && (
            <span style={{ fontSize: '11px', color: 'var(--accent-color)', fontWeight: 600, marginTop: '1px' }}>
              @{savedProfile.username}
            </span>
          )}
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
                    readOnly
                    style={{ opacity: 0.8, cursor: 'not-allowed' }}
                    placeholder="user@example.com"
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
                VoxReview analyzes product reviews across Shopee, Lazada, Google Maps, Google Play Store, and Steam using AI emotion intelligence.
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
                <div className="password-input-wrap">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    aria-label={showCurrentPass ? 'Hide password' : 'Show password'}
                  >
                    {showCurrentPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="modal-field">
                <label>New Password</label>
                <div className="password-input-wrap">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowNewPass(!showNewPass)}
                    aria-label={showNewPass ? 'Hide password' : 'Show password'}
                  >
                    {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="modal-field">
                <label>Confirm New Password</label>
                <div className="password-input-wrap">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    aria-label={showConfirmPass ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="profile-action-btn secondary small" onClick={() => setShowPasswordModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="profile-action-btn primary small" disabled={isChangingPassword}>
                  {isChangingPassword ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Loader2 size={13} className="extension-modal-spinner" />
                      Saving...
                    </span>
                  ) : (
                    'Save Password'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingProfileSave && (
        <ProfileChangesConfirmationModal
          changes={pendingProfileSave.changes}
          onCancel={() => setPendingProfileSave(null)}
          onConfirm={confirmSaveProfile}
        />
      )}

      {showVerificationModal && (
        <VerificationCodeModal
          isOpen={showVerificationModal}
          email={savedProfile.email}
          purpose="change_password"
          onVerifySuccess={handleVerificationSuccess}
          onCancel={() => setShowVerificationModal(false)}
        />
      )}

      {/* Password Change Success Modal */}
      {showPasswordSuccessModal && (
        <div className="extension-modal-backdrop" role="presentation">
          <div
            className="extension-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-success-title"
            style={{ maxWidth: '340px', width: '92%', padding: '20px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981'
              }}>
                <CheckCircle2 size={18} />
              </div>
              <h2 id="password-success-title" style={{ fontSize: '14.5px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Password changed successfully.
              </h2>
            </div>

            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0 0 16px 0' }}>
              Your password has been updated.
            </p>

            <div className="extension-modal-actions" style={{ gap: '8px', flexDirection: 'column' }}>
              <button
                type="button"
                className="extension-modal-button extension-modal-button-secondary"
                onClick={handleStaySignedIn}
                disabled={isCheckingSession || isSigningOut}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {isCheckingSession ? 'Checking session...' : 'Stay Signed In'}
              </button>
              <button
                type="button"
                className="extension-modal-button extension-modal-button-primary"
                onClick={handleSignInAgain}
                disabled={isCheckingSession || isSigningOut}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  background: 'var(--accent-color, #4F46E5)',
                  color: '#ffffff'
                }}
              >
                {isSigningOut ? 'Signing out...' : 'Sign In Again'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
