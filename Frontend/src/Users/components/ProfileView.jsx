import { useState } from 'react';
import { User, Bookmark, FileText, Cloud, Lock, LogOut, LogIn } from 'lucide-react';
import '../css/ProfileView.css';

export default function ProfileView({ isLoggedIn = false, currentUser, onLoginClick, onLogout }) {
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  if (!isLoggedIn) {
    return (
      <div className="profile-view-container">
        {/* Guest Card */}
        <div className="profile-card" style={{ flexDirection: 'column', textAlign: 'center', gap: '10px', padding: '20px 14px' }}>
          <div className="profile-avatar-lg" style={{ background: '#EFF6FF', margin: '0 auto' }}>
            <User size={26} color="#2563EB" />
          </div>
          <span className="profile-name">Guest Mode</span>
          <span className="profile-email" style={{ maxWidth: '240px', whiteSpace: 'normal' }}>
            Sign in to unlock cloud sync, Saved Analyses, and data exports.
          </span>
          <button className="profile-action-btn primary" onClick={onLoginClick}>
            <LogIn size={14} />
            Log In / Register
          </button>
        </div>

        {/* Locked Features */}
        <div className="settings-group">
          <span className="settings-group-title">Requires Account</span>
          {[
            { Icon: Bookmark, label: 'Saved Analyses & History' },
            { Icon: FileText, label: 'PDF & CSV Export' },
            { Icon: Cloud,    label: 'Cross-Device Sync' },
          ].map(({ Icon, label }) => (
            <div key={label} className="setting-item-row" style={{ opacity: 0.6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Icon size={14} color="#2563EB" />
                {label}
              </span>
              <span style={{ fontSize: '10px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Lock size={10} /> Locked
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-view-container">
      {/* Account Info */}
      <div className="profile-card">
        <div className="profile-avatar-lg">
          {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div className="profile-details">
          <span className="profile-name">{currentUser?.name || 'User'}</span>
          <span className="profile-email">{currentUser?.email || ''}</span>
          <span className="profile-badge-pro">
            {currentUser?.role === 'superadmin' ? 'SUPER ADMIN' : 'PRO SUBSCRIBER'}
          </span>
        </div>
      </div>

      {/* Preferences */}
      <div className="settings-group">
        <span className="settings-group-title">Extension Preferences</span>
        <div className="setting-item-row">
          <span>Auto-detect Analysis Targets</span>
          <div
            className={`setting-toggle ${autoAnalyze ? 'on' : ''}`}
            onClick={() => setAutoAnalyze(v => !v)}
          >
            <div className="setting-toggle-knob" />
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <button className="profile-action-btn danger" onClick={onLogout}>
        <LogOut size={14} />
        Sign Out
      </button>
    </div>
  );
}
