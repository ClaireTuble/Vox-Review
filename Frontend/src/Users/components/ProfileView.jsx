import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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
  Loader2,
  Upload,
} from 'lucide-react';
import authService, { normalizeAuthErrorMessage } from '../../services/authService.js';
import ProfileChangesConfirmationModal from './ProfileChangesConfirmationModal.jsx';
import RemoveAvatarConfirmationModal from './RemoveAvatarConfirmationModal.jsx';
import VerificationCodeModal from './VerificationCodeModal.jsx';
import { getProfileSaveChanges, persistProfileDraft } from '../utils/profileSave.js';
import '../css/ProfileView.css';

export default function ProfileView({
  isLoggedIn = false,
  currentUser,
  onLoginClick,
  onRegisterClick,
  onLogout,
  theme = 'light',
  onThemeToggle,
  onSavedProfileUpdated,
  onDirtyChange,
  onRequestLeave,
  registerDiscardDraft,
}) {
  const [activeView, setActiveView] = useState('main'); // 'main' | 'user-profile' | 'security' | 'help-center'
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showRemoveAvatarModal, setShowRemoveAvatarModal] = useState(false);
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

  // Profile Picture state
  const fileInputRef = useRef(null);
  const pendingAvatarPreviewRef = useRef(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState(null);
  const [isAvatarRemovalPending, setIsAvatarRemovalPending] = useState(false);

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
    avatarUrl: currentUser?.avatarUrl || null,
    googleAvatarUrl: currentUser?.googleAvatarUrl || null,
    isCustomAvatar: currentUser?.isCustomAvatar ?? Boolean(currentUser?.custom_avatar_url),
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [pendingProfileSave, setPendingProfileSave] = useState(null);
  const profileDraft = { username, firstName, lastName };
  const pendingAvatarAction = pendingAvatar
    ? { type: 'upload', file: pendingAvatar.file }
    : isAvatarRemovalPending
      ? { type: 'remove' }
      : null;
  const profileChanges = getProfileSaveChanges(savedProfile, profileDraft, pendingAvatarAction);
  const hasUnsavedProfileChanges = profileChanges.length > 0;
  const isDirty = activeView === 'user-profile' && hasUnsavedProfileChanges;
  const displayedAvatarUrl = pendingAvatar?.previewUrl
    || (isAvatarRemovalPending ? savedProfile.googleAvatarUrl : savedProfile.avatarUrl)
    || null;

  useLayoutEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  const handleDiscardDraft = useCallback(() => {
    if (pendingAvatarPreviewRef.current) {
      URL.revokeObjectURL(pendingAvatarPreviewRef.current);
      pendingAvatarPreviewRef.current = null;
    }
    setPendingAvatar(null);
    setIsAvatarRemovalPending(false);
    setPendingProfileSave(null);
    setShowRemoveAvatarModal(false);
    setUsername(savedProfile.username);
    setEmail(savedProfile.email);
    setFirstName(savedProfile.firstName);
    setLastName(savedProfile.lastName);
    setToastMessage('');
    setActiveView('main');
  }, [savedProfile]);

  useEffect(() => {
    registerDiscardDraft?.(handleDiscardDraft);
    return () => {
      registerDiscardDraft?.(null);
    };
  }, [registerDiscardDraft, handleDiscardDraft]);

  useEffect(() => () => {
    if (pendingAvatarPreviewRef.current) {
      URL.revokeObjectURL(pendingAvatarPreviewRef.current);
      pendingAvatarPreviewRef.current = null;
    }
  }, []);

  // Sync state if currentUser prop updates
  useEffect(() => {
    if (currentUser && !hasUnsavedProfileChanges) {
      setSavedProfile({
        username: currentUser.username || currentUser.name || '',
        email: currentUser.email || '',
        firstName: currentUser.firstName || '',
        lastName: currentUser.lastName || '',
        fullName: currentUser.fullName || currentUser.name || '',
        avatarUrl: currentUser.avatarUrl || null,
        googleAvatarUrl: currentUser.googleAvatarUrl || null,
        isCustomAvatar: currentUser.isCustomAvatar ?? Boolean(currentUser.custom_avatar_url),
      });
      if (currentUser.username) setUsername(currentUser.username);
      if (currentUser.email) setEmail(currentUser.email);
      if (currentUser.firstName !== undefined) setFirstName(currentUser.firstName);
      if (currentUser.lastName !== undefined) setLastName(currentUser.lastName);
    }
  }, [currentUser, hasUnsavedProfileChanges]);

  const triggerToast = (msg, type = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      triggerToast('Invalid file format. Please choose a JPG, PNG, WebP, or GIF image.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      triggerToast('Image is too large. Maximum allowed file size is 5MB.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const previewUrl = URL.createObjectURL(file);
      if (pendingAvatarPreviewRef.current) {
        URL.revokeObjectURL(pendingAvatarPreviewRef.current);
      }
      pendingAvatarPreviewRef.current = previewUrl;
      setPendingAvatar({ file, previewUrl });
      setIsAvatarRemovalPending(false);
      setToastMessage('');
    } catch (error) {
      triggerToast(error?.message || 'Unable to preview this profile picture.', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    if (pendingAvatarPreviewRef.current) {
      URL.revokeObjectURL(pendingAvatarPreviewRef.current);
      pendingAvatarPreviewRef.current = null;
    }
    if (pendingAvatar) {
      setPendingAvatar(null);
      setIsAvatarRemovalPending(false);
    } else if (savedProfile.isCustomAvatar || savedProfile.avatarUrl) {
      setPendingAvatar(null);
      setIsAvatarRemovalPending(true);
    } else {
      setPendingAvatar(null);
      setIsAvatarRemovalPending(false);
    }
    setShowRemoveAvatarModal(false);
    setToastMessage('');
  };

  const handleBackToSettings = () => {
    if (!isDirty) {
      handleDiscardDraft();
      return;
    }
    if (onRequestLeave) {
      onRequestLeave(() => {
        handleDiscardDraft();
      });
    } else {
      handleDiscardDraft();
    }
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      triggerToast('Please fill out first name and last name.', 'error');
      return;
    }

    const changes = getProfileSaveChanges(savedProfile, {
      username: username.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    }, pendingAvatarAction);

    if (!changes.length) {
      triggerToast('No profile changes to save.', 'error');
      return;
    }

    setPendingProfileSave({
      username: username.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      avatarAction: pendingAvatarAction,
    });
  };

  const confirmSaveProfile = async () => {
    if (!pendingProfileSave || isSaving) return;
    setIsSaving(true);
    try {
      setIsUploadingAvatar(pendingProfileSave.avatarAction?.type === 'upload');
      setIsRemovingAvatar(pendingProfileSave.avatarAction?.type === 'remove');
      const updatedUser = await persistProfileDraft({
        authService,
        username: pendingProfileSave.username,
        firstName: pendingProfileSave.firstName,
        lastName: pendingProfileSave.lastName,
        avatarAction: pendingProfileSave.avatarAction,
        onPersisted: onSavedProfileUpdated,
      });
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
          avatarUrl: updatedUser.avatarUrl || null,
          googleAvatarUrl: updatedUser.googleAvatarUrl || null,
          isCustomAvatar: updatedUser.isCustomAvatar ?? false,
        });
      }
      if (pendingAvatarPreviewRef.current) {
        URL.revokeObjectURL(pendingAvatarPreviewRef.current);
        pendingAvatarPreviewRef.current = null;
      }
      setPendingAvatar(null);
      setIsAvatarRemovalPending(false);
      setPendingProfileSave(null);
      triggerToast('Profile changes saved successfully.', 'success');
    } catch (err) {
      triggerToast(err?.message || 'Failed to save profile changes.', 'error');
    } finally {
      setIsSaving(false);
      setIsUploadingAvatar(false);
      setIsRemovingAvatar(false);
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
      <div
        className={`compact-profile-header ${!isLoggedIn ? 'guest-clickable' : ''}`}
        onClick={!isLoggedIn ? () => onLoginClick('/login') : undefined}
        role={!isLoggedIn ? 'button' : undefined}
        tabIndex={!isLoggedIn ? 0 : undefined}
        onKeyDown={!isLoggedIn ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onLoginClick('/login');
          }
        } : undefined}
        title={!isLoggedIn ? 'Click to Sign In / Register' : undefined}
      >
        <div className="profile-avatar-lg">
          {isLoggedIn ? (
            savedProfile.avatarUrl ? (
              <img
                src={savedProfile.avatarUrl}
                alt={savedProfile.firstName || savedProfile.username || 'User'}
                className="profile-avatar-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              (savedProfile.firstName || savedProfile.username || savedProfile.email || 'U').charAt(0).toUpperCase()
            )
          ) : (
            <User size={18} color="var(--accent-color)" />
          )}
          {isLoggedIn && (isUploadingAvatar || isRemovingAvatar) && (
            <div className="pf-avatar-loading-overlay">
              <Loader2 size={15} className="spin-icon" />
            </div>
          )}
        </div>
        <div className="profile-details">
          {isLoggedIn ? (
            <>
              <span className="profile-name">
                {savedProfile.firstName || savedProfile.lastName
                  ? `${savedProfile.firstName} ${savedProfile.lastName}`.trim()
                  : savedProfile.fullName || (savedProfile.username ? `@${savedProfile.username}` : (savedProfile.email?.split('@')[0] ? `@${savedProfile.email.split('@')[0]}` : 'User'))}
              </span>
              <span className="profile-email">{savedProfile.email || ''}</span>
              {savedProfile.username && (
                <span style={{ fontSize: '11px', color: 'var(--accent-color)', fontWeight: 600, marginTop: '1px' }}>
                  @{savedProfile.username}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="profile-name">Guest User</span>
              <span className="profile-email">Sign in to manage your account</span>
            </>
          )}
        </div>
      </div>

      {/* ── MAIN MENU VIEW ── */}
      {activeView === 'main' && (
        <div className="profile-menu-container">
          <div className="settings-group">
            {isLoggedIn && (
              <>
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
              </>
            )}

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

      {/* -- USER PROFILE DETAIL VIEW -- */}
      {activeView === 'user-profile' && (
        <div className="subview-container">

          {/* Page header */}
          <div className="pf-page-header">
            <button className="back-nav-btn" onClick={handleBackToSettings}>
              <ArrowLeft size={14} /> Back to Settings
            </button>
            <h2 className="pf-page-title">Profile Details</h2>
            <p className="pf-page-desc">Manage your personal information and profile picture.</p>
          </div>

          {/* Profile Picture Card */}
          <div className="pf-section-card">
            <div className="pf-section-head">
              <span className="pf-section-label">Profile Picture</span>
              <span className="pf-section-hint">Choose a photo that will be shown on your VoxReview profile.</span>
            </div>

            <div className="pf-avatar-row">
              <div className="pf-avatar-ring">
                {displayedAvatarUrl ? (
                  <img
                    src={displayedAvatarUrl}
                    alt="Profile"
                    className="pf-avatar-img"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="pf-avatar-initial">
                    {(savedProfile.firstName || savedProfile.username || savedProfile.email || 'U').charAt(0).toUpperCase()}
                  </span>
                )}
                {(isUploadingAvatar || isRemovingAvatar) && (
                  <div className="pf-avatar-loading-overlay">
                    <Loader2 size={16} className="spin-icon" />
                  </div>
                )}
              </div>

              <div className="pf-avatar-controls">
                <div className="pf-avatar-btn-row">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarFileChange}
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    style={{ display: 'none' }}
                  />
                  <button
                    id="upload-picture-btn"
                    type="button"
                    className="pf-btn-upload"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar || isRemovingAvatar}
                  >
                    {isUploadingAvatar
                      ? <Loader2 size={12} className="spin-icon" />
                      : <Upload size={12} />}
                    {isUploadingAvatar ? 'Uploading...' : 'Upload Picture'}
                  </button>

                  {displayedAvatarUrl && (
                    <button
                      id="remove-picture-btn"
                      type="button"
                      className="pf-btn-remove"
                      onClick={() => setShowRemoveAvatarModal(true)}
                      disabled={isUploadingAvatar || isRemovingAvatar}
                    >
                      {isRemovingAvatar
                        ? <Loader2 size={12} className="spin-icon" />
                        : <Trash2 size={12} />}
                      {isRemovingAvatar ? 'Removing...' : 'Remove'}
                    </button>
                  )}
                </div>
                <span className="pf-avatar-hint">JPG, PNG, WEBP, or GIF &middot; Max 5 MB</span>
              </div>
            </div>
          </div>

          {/* Personal Information Card */}
          <div className="pf-section-card">
            <div className="pf-section-head">
              <span className="pf-section-label">Personal Information</span>
              <span className="pf-section-hint">Update your account information below.</span>
            </div>

            <form onSubmit={handleSaveProfile} className="pf-form">

              {/* Row 1: Username | Email Address */}
              <div className="pf-field-row">
                <div className="pf-field">
                  <label className="pf-label" htmlFor="edit-username">Username</label>
                  <input
                    id="edit-username"
                    className="pf-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    required
                  />
                </div>
                <div className="pf-field">
                  <label className="pf-label" htmlFor="edit-email">Email Address</label>
                  <input
                    id="edit-email"
                    className="pf-input pf-input--readonly"
                    type="email"
                    value={email}
                    readOnly
                    placeholder="Enter your email address"
                  />
                </div>
              </div>

              {/* Row 2: First Name | Last Name */}
              <div className="pf-field-row">
                <div className="pf-field">
                  <label className="pf-label" htmlFor="edit-firstname">First Name</label>
                  <input
                    id="edit-firstname"
                    className="pf-input"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter your first name"
                    required
                  />
                </div>
                <div className="pf-field">
                  <label className="pf-label" htmlFor="edit-lastname">Last Name</label>
                  <input
                    id="edit-lastname"
                    className="pf-input"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter your last name"
                    required
                  />
                </div>
              </div>

              <button
                id="save-profile-btn"
                type="submit"
                className="pf-save-btn"
                disabled={isSaving}
              >
                <Save size={13} />
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
                    placeholder="Enter your password"
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
                    placeholder="Enter your new password"
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
                    placeholder="Re-enter your password"
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
          onCancel={() => setPendingProfileSave(null)}
          onConfirm={confirmSaveProfile}
        />
      )}

      {showRemoveAvatarModal && (
        <RemoveAvatarConfirmationModal
          onCancel={() => !isRemovingAvatar && setShowRemoveAvatarModal(false)}
          onConfirm={handleRemoveAvatar}
          isRemoving={isRemovingAvatar}
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
