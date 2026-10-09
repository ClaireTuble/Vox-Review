import { useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { useVoxLogo } from '../../utils/useVoxLogo.js';
import '../css/Header.css';

export default function Header({ isLoggedIn, userName, avatarUrl, userInitial, onLogout, onLoginClick }) {
  const logo = useVoxLogo();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState(null);
  const showAvatarImage = avatarUrl && failedAvatarUrl !== avatarUrl;

  return (
    <header className="vox-header">
      <div className="vox-brand">
        <div className="vox-logo-badge">
          <img src={logo} alt="VoxReview Logo" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
        </div>
        <div className="vox-title-group">
          <span className="vox-brand-name">VoxReview</span>
          <span className="vox-brand-tag">AI Emotion Intelligence</span>
        </div>
      </div>

      <div className="vox-header-actions">
        {isLoggedIn ? (
          <div className="vox-user-profile" onClick={onLogout} title="Click to Sign Out">
            <div className={`vox-user-avatar${showAvatarImage ? ' has-image' : ''}`}>
              {showAvatarImage ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="vox-user-avatar-image"
                  onError={() => setFailedAvatarUrl(avatarUrl)}
                />
              ) : (
                <span>{userInitial || userName?.charAt(0)?.toUpperCase() || 'U'}</span>
              )}
            </div>
            <span className="vox-user-name">{userName || 'User'}</span>
            <LogOut size={12} color="#94A3B8" style={{ marginLeft: '2px' }} />
          </div>
        ) : (
          <button className="vox-login-btn" onClick={onLoginClick}>
            <LogIn size={13} />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}
