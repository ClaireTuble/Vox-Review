import '../css/BottomNavBar.css';

export default function BottomNavBar({ activeTab, onTabChange, savedCount = 3 }) {
  return (
    <nav className="bottom-nav-bar">
      <button
        className={`nav-tab-btn ${activeTab === 'analyze' ? 'active' : ''}`}
        onClick={() => onTabChange('analyze')}
      >
        <span className="nav-tab-icon">
          <svg className="nav-icon" viewBox="0 0 24 24">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </span>
        <span className="nav-tab-label">Analyze</span>
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
        onClick={() => onTabChange('saved')}
      >
        <span className="nav-tab-icon">
          <svg className="nav-icon" viewBox="0 0 24 24">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span className="nav-tab-label">Saved {savedCount > 0 && `(${savedCount})`}</span>
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
        onClick={() => onTabChange('profile')}
      >
        <span className="nav-tab-icon">
          <svg className="nav-icon" viewBox="0 0 24 24">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <span className="nav-tab-label">Profile</span>
      </button>
    </nav>
  );
}
