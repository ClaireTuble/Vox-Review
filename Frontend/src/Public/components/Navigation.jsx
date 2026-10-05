import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useVoxLogo } from '../../utils/useVoxLogo.js';
import authService from '../../services/authService.js';
import '../css/Navigation.css';

export default function Navigation({ activePage }) {
  const logo = useVoxLogo();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(() => authService.isAuthenticated());

  const getActiveFromCurrentState = () => {
    if (location.pathname === '/about') return 'about';
    if (location.pathname === '/') {
      if (location.hash === '#features') return 'features';
      if (location.hash === '#how-it-works') return 'how-it-works';
      return 'home';
    }
    return activePage || 'home';
  };

  const [activeItem, setActiveItem] = useState(getActiveFromCurrentState);

  useEffect(() => {
    const handleAuthSync = () => setIsAuthenticated(authService.isAuthenticated());
    window.addEventListener('voxreview_auth_sync', handleAuthSync);
    return () => window.removeEventListener('voxreview_auth_sync', handleAuthSync);
  }, []);

  useEffect(() => {
    if (location.pathname === '/about') {
      setActiveItem('about');
      return;
    }

    if (location.pathname === '/') {
      const handleScrollAndHash = () => {
        const scrollY = window.scrollY;
        const featuresEl = document.getElementById('features');
        const howItWorksEl = document.getElementById('how-it-works');
        const offset = 220;

        if (howItWorksEl && scrollY >= howItWorksEl.offsetTop - offset) {
          setActiveItem('how-it-works');
        } else if (featuresEl && scrollY >= featuresEl.offsetTop - offset) {
          setActiveItem('features');
        } else {
          setActiveItem('home');
        }
      };

      if (location.hash === '#features') {
        setActiveItem('features');
        const el = document.getElementById('features');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else if (location.hash === '#how-it-works') {
        setActiveItem('how-it-works');
        const el = document.getElementById('how-it-works');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        handleScrollAndHash();
      }

      window.addEventListener('scroll', handleScrollAndHash, { passive: true });
      window.addEventListener('hashchange', handleScrollAndHash);
      window.addEventListener('popstate', handleScrollAndHash);

      return () => {
        window.removeEventListener('scroll', handleScrollAndHash);
        window.removeEventListener('hashchange', handleScrollAndHash);
        window.removeEventListener('popstate', handleScrollAndHash);
      };
    }
  }, [location.pathname, location.hash]);

  const handleSignOut = async () => {
    await authService.logout('user');
    navigate('/', { replace: true });
  };

  const scrollToSection = (e, sectionId) => {
    if (location.pathname === '/') {
      e.preventDefault();
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        window.history.pushState(null, '', `#${sectionId}`);
        setActiveItem(sectionId);
      }
    }
  };

  const scrollToTop = (e) => {
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.history.pushState(null, '', '/');
      setActiveItem('home');
    }
  };

  return (
    <header className="landing-header">
      <div className="landing-header-container">
        <Link to="/" onClick={scrollToTop} className="landing-brand">
          <img src={logo} alt="VoxReview Logo" className="brand-logo-img" />
          <span className="title">VoxReview</span>
        </Link>

        <nav className="landing-nav">
          <Link
            to="/"
            onClick={scrollToTop}
            className={`nav-link ${activeItem === 'home' ? 'active' : ''}`}
          >
            Home
          </Link>
          <a
            href={location.pathname === '/' ? '#features' : '/#features'}
            onClick={(e) => scrollToSection(e, 'features')}
            className={`nav-link ${activeItem === 'features' ? 'active' : ''}`}
          >
            Features
          </a>
          <a
            href={location.pathname === '/' ? '#how-it-works' : '/#how-it-works'}
            onClick={(e) => scrollToSection(e, 'how-it-works')}
            className={`nav-link ${activeItem === 'how-it-works' ? 'active' : ''}`}
          >
            How It Works
          </a>
          <Link
            to="/about"
            className={`nav-link ${activeItem === 'about' ? 'active' : ''}`}
          >
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
