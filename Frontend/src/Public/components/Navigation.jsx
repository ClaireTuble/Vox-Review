import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useVoxLogo } from '../../utils/useVoxLogo.js';
import authService from '../../services/authService.js';
import '../css/Navigation.css';

export default function Navigation({ activePage = 'home' }) {
  const logo = useVoxLogo();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(() => authService.isAuthenticated());

  useEffect(() => {
    const handleAuthSync = () => setIsAuthenticated(authService.isAuthenticated());

    window.addEventListener('voxreview_auth_sync', handleAuthSync);
    return () => window.removeEventListener('voxreview_auth_sync', handleAuthSync);
  }, []);

  const handleSignOut = async () => {
    await authService.logout('user');
    navigate('/', { replace: true });
  };

  return (
    <header className="landing-header">
      <div className="landing-header-container">
        <Link to="/" className="landing-brand">
          <img src={logo} alt="VoxReview Logo" className="brand-logo-img" />
          <span className="title">VoxReview</span>
        </Link>

        <nav className="landing-nav">
          <Link to="/" className={`nav-link ${activePage === 'home' ? 'active' : ''}`}>
            Home
          </Link>
          <a href={activePage === 'home' ? '#features' : '/#features'} className="nav-link">
            Features
          </a>
          <a href={activePage === 'home' ? '#how-it-works' : '/#how-it-works'} className="nav-link">
            How It Works
          </a>
          <Link to="/about" className={`nav-link ${activePage === 'about' ? 'active' : ''}`}>
            About
          </Link>
        </nav>

        <div className="landing-nav-actions">
          {isAuthenticated ? (
            <>
              <Link to="/after-login" className="nav-link login-btn">
                Getting Started
              </Link>
              <button type="button" onClick={handleSignOut} className="nav-link login-btn">
                Sign Out
              </button>
            </>
          ) : (
            <Link to="/login" className="nav-link login-btn">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
