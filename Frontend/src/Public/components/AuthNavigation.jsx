import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useVoxLogo } from '../../utils/useVoxLogo.js';
import authService from '../../services/authService.js';
import { getRegularUserAfterAuthSync } from '../../services/authSessionSync.js';
import HeaderLogoutConfirmationModal from './HeaderLogoutConfirmationModal.jsx';
import '../css/AuthNavigation.css';

/**
 * AuthNavigation — Dedicated navbar for authenticated pages (AfterLogPage).
 * Completely separate from the public Landing Page Navigation component.
 *
 * Nav items: Home | Getting Started | Sign Out
 */
export default function AuthNavigation({ activePage = 'after-login' }) {
  const logo = useVoxLogo();
  const navigate = useNavigate();
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser());

  useEffect(() => {
    const handleAuthSync = (event) => {
      const result = getRegularUserAfterAuthSync(
        event,
        currentUser,
        () => authService.getCurrentUser(),
      );
      if (result.handled) setCurrentUser(result.user);
    };

    window.addEventListener('voxreview_auth_sync', handleAuthSync);
    return () => window.removeEventListener('voxreview_auth_sync', handleAuthSync);
  }, [currentUser]);

  const handleSignOut = async () => {
    await authService.logout('user');
    navigate('/', { replace: true });
  };

  return (
    <header className="auth-nav-header">
      <div className="auth-nav-container">
        {/* Brand */}
        <Link to="/" className="auth-nav-brand">
          <img src={logo} alt="VoxReview Logo" className="auth-nav-logo-img" />
          <span className="auth-nav-brand-name">VoxReview</span>
        </Link>

        {/* Nav Links */}
        <nav className="auth-nav-links">
          <Link to="/" className="auth-nav-link">
            Home
          </Link>
          <Link
            to="/after-login"
            className={`auth-nav-link ${activePage === 'after-login' ? 'active' : ''}`}
          >
            Getting Started
          </Link>
        </nav>

        {/* Sign Out Action */}
        <div className="auth-nav-actions">
          <button
            type="button"
            id="auth-nav-signout-btn"
            onClick={() => setShowLogoutConfirmation(true)}
            className="auth-nav-signout-btn"
          >
            {currentUser?.avatarUrl ? (
              <img
                className="auth-nav-avatar"
                src={currentUser.avatarUrl}
                alt=""
              />
            ) : (
              <span className="auth-nav-avatar auth-nav-avatar-fallback" aria-hidden="true">
                {(currentUser?.firstName || currentUser?.username || currentUser?.email || 'U')
                  .charAt(0)
                  .toUpperCase()}
              </span>
            )}
            Sign Out
          </button>
        </div>
      </div>
      {showLogoutConfirmation && (
        <HeaderLogoutConfirmationModal
          onCancel={() => setShowLogoutConfirmation(false)}
          onConfirm={handleSignOut}
        />
      )}
    </header>
  );
}
