import { Link } from 'react-router-dom';
import logo from '../../assets/VRLogo.png';

export default function Navigation({ activePage = 'home' }) {
  return (
    <header className="landing-header">
      <div className="landing-header-container">
        <Link to="/" className="landing-brand">
          <img src={logo} alt="VoxReview Logo" className="brand-logo-img" />
          <span className="title">VoxReview</span>
        </Link>

        <nav className="landing-nav">
          <Link to="/" className={`nav-link ${activePage === 'home' ? 'active' : ''}`}>Home</Link>
          <a href="#features" className="nav-link">Features</a>
          <a href="#how-it-works" className="nav-link">How It Works</a>
          <Link to="/about" className={`nav-link ${activePage === 'about' ? 'active' : ''}`}>About</Link>
        </nav>

        <div className="landing-nav-actions">
          <Link to="/login" className="nav-link login-btn">Sign In</Link>
          <Link to="/register" className="nav-link register-btn">Get Started</Link>
        </div>
      </div>
    </header>
  );
}

