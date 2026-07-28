import { useNavigate } from 'react-router-dom';
import authService from '../../services/authService.js';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import DashboardCards from '../components/DashboardCards.jsx';
import RecentUsersTable from '../components/RecentUsersTable.jsx';
import PlatformStatusCard from '../components/PlatformStatusCard.jsx';
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
    authService.logout();
    navigate('/');
  };

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={handleSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Super Admin Dashboard"
          subtitle="Manage users, supported platforms, analytics, and system configuration."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          <DashboardCards />

          <div className="split-panels-row">
            <article className="admin-panel">
              <div className="panel-header">
                <h3>Recent Users & Accounts</h3>
                <button className="panel-action-btn" onClick={() => setActiveTab('users')}>
                  View All
                </button>
              </div>
              <RecentUsersTable users={mockUsers.slice(0, 4)} />
            </article>

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
        </section>
      </main>
    </div>
  );
}
