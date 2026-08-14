import { useNavigate } from 'react-router-dom';
import authService from '../../services/authService.js';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import DashboardCards from '../components/DashboardCards.jsx';
import RecentUsersTable from '../components/RecentUsersTable.jsx';
import PlatformStatusCard from '../components/PlatformStatusCard.jsx';
import PlatformUsageChart from '../components/PlatformUsageChart.jsx';
import AnalysisActivityChart from '../components/AnalysisActivityChart.jsx';
import RecentActivityFeed from '../components/RecentActivityFeed.jsx';
import { mockUsers, mockCurrentUser } from '../data/users.js';
import { mockPlatforms } from '../data/platforms.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/responsive.css';

export default function Dashboard({ activeTab, setActiveTab }) {
  const navigate = useNavigate();

  const handleSignOut = () => {
    authService.logout('superadmin');
    navigate('/');
  };

  // Regular users only (no SuperAdmin entries)
  const regularUsers = mockUsers.filter((u) => u.role !== 'SuperAdmin');

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={handleSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="System Overview"
          subtitle="Monitor users, supported platforms, and review-analysis activity."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          {/* ── Row 1: Summary stat cards ── */}
          <DashboardCards />

          {/* ── Row 2: Recent Users + Supported Review Platforms (unchanged) ── */}
          <div className="split-panels-row">
            <article className="admin-panel">
              <div className="panel-header">
                <h3>Recent Users &amp; Accounts</h3>
                <button className="panel-action-btn" onClick={() => setActiveTab('users')}>
                  View All
                </button>
              </div>
              <RecentUsersTable users={regularUsers.slice(0, 4)} />
            </article>

            {/* ── Supported Review Platforms — PRESERVED EXACTLY ── */}
            <article className="admin-panel">
              <div className="panel-header">
                <h3>Supported Review Platforms</h3>
                <button className="panel-action-btn" onClick={() => setActiveTab('platforms')}>
                  Manage
                </button>
              </div>
              <div className="platforms-list">
                {mockPlatforms.map((platform, index) => (
                  <PlatformStatusCard key={`${platform.name}-${index}`} platform={platform} />
                ))}
              </div>
            </article>
          </div>

          {/* ── Row 3: Platform Usage + Analysis Activity ── */}
          <div className="split-panels-row">
            <article className="admin-panel">
              <div className="panel-header">
                <div>
                  <h3>Platform Usage</h3>
                  <p className="panel-subtitle">Analyses run per platform · demo data</p>
                </div>
              </div>
              <PlatformUsageChart platforms={mockPlatforms} />
            </article>

            <article className="admin-panel">
              <div className="panel-header">
                <div>
                  <h3>Analysis Activity</h3>
                  <p className="panel-subtitle">Reviews analysed · last 7 days · demo data</p>
                </div>
              </div>
              <AnalysisActivityChart />
            </article>
          </div>

          {/* ── Row 4: Recent User Activity ── */}
          <article className="admin-panel">
            <div className="panel-header">
              <h3>Recent User Activity</h3>
            </div>
            <RecentActivityFeed />
          </article>
        </section>
      </main>
    </div>
  );
}
