import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopActions from '../components/TopActions.jsx';
import { mockPlatforms } from '../data/platforms.js';
import { mockCurrentUser } from '../data/users.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/responsive.css';

export default function Platforms({ activeTab, setActiveTab, onSignOut }) {
  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Supported Platforms"
          subtitle="Configure platform detection rules and monitor integration health."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="Supported Review Platforms & Scrapers"
              subtitle="Configure platform detection rules for the VoxReview Chrome Extension."
              primaryLabel="Add Platform Integration"
              onPrimaryAction={() => window.alert('Add platform detector placeholder')}
            />

            <div className="platforms-grid">
              {mockPlatforms.map((platform, index) => (
                <div key={`${platform.name}-${index}`} className="platform-admin-card">
                  <div className="card-top">
                    <span className="card-platform-icon"><span className="platform-icon-inner" /></span>
                    <span className="platform-status-badge" style={{ background: platform.statusBg, color: platform.statusColor }}>
                      {platform.status}
                    </span>
                  </div>
                  <h4 className="card-platform-title">{platform.name}</h4>
                  <div className="card-platform-meta">
                    <span>Latency: <strong>{platform.responseTime}</strong></span>
                    <span>Scraper: <strong>V2 Parser</strong></span>
                  </div>
                  <div className="card-actions">
                    <button className="card-btn secondary" onClick={() => window.alert(`Configuring ${platform.name}`)}>
                      Configure Rules
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
