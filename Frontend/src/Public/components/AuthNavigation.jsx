import { Link, useNavigate } from 'react-router-dom';
import { useVoxLogo } from '../../utils/useVoxLogo.js';
import authService from '../../services/authService.js';
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
            onClick={handleSignOut}
            className="auth-nav-signout-btn"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
