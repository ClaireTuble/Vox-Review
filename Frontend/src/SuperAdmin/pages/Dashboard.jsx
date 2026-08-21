import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import authService from '../../services/authService.js';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import DashboardCards from '../components/DashboardCards.jsx';
import RecentUsersTable from '../components/RecentUsersTable.jsx';
import PlatformStatusCard from '../components/PlatformStatusCard.jsx';
import PlatformUsageChart from '../components/PlatformUsageChart.jsx';
import AnalysisActivityChart from '../components/AnalysisActivityChart.jsx';
import RecentActivityFeed from '../components/RecentActivityFeed.jsx';
import { mockCurrentUser } from '../data/users.js';
import { fetchPlatformHealth, getCachedPlatformHealth, FALLBACK_PLATFORMS } from '../data/platforms.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/responsive.css';

const HEALTH_POLL_INTERVAL = 30_000;

export default function Dashboard({ activeTab, setActiveTab }) {
  const navigate = useNavigate();
  const cachedData = getCachedPlatformHealth();
  const [platforms, setPlatforms] = useState(cachedData || FALLBACK_PLATFORMS);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);

  const handleSignOut = () => {
    authService.logout('superadmin');
    navigate('/');
  };

  useEffect(() => {
    let mounted = true;

    const loadOverviewData = async () => {
      try {
        const token = await authService.getSuperAdminAccessToken();
        if (token) {
          const res = await fetch('http://localhost:5000/api/admin/overview', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (mounted && data.success) {
              setDashboardStats(data.stats);
              setRecentUsers(data.recentUsers || []);
              setRecentActivities(data.recentActivities || []);
            }
          }
        }
      } catch (err) {
        console.warn('VoxReview: Dashboard overview fetch notice:', err.message);
      }
    };

    const loadHealth = async () => {
      try {
        const data = await fetchPlatformHealth();
        if (mounted) {
          setPlatforms(data);
          setBackendAvailable(true);
        }
      } catch (err) {
        console.warn('VoxReview: Dashboard health fetch failed:', err.message);
        if (mounted) setBackendAvailable(false);
      }
    };

    loadOverviewData();
    loadHealth();
    const interval = setInterval(() => {
      loadOverviewData();
      loadHealth();
    }, HEALTH_POLL_INTERVAL);

    return () => { mounted = false; clearInterval(interval); };
  }, []);

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
          <DashboardCards stats={dashboardStats} />

          {/* Backend connectivity warning */}
          {!backendAvailable && (
            <div className="health-warning-banner">
              <WifiOff size={15} />
              <span>Unable to reach health monitoring service. Platform statuses may be stale.</span>
            </div>
          )}

          {/* ── Row 2: Recent Users + Supported Review Platforms (unchanged) ── */}
          <div className="split-panels-row">
            <article className="admin-panel">
              <div className="panel-header">
                <h3>Recent Users &amp; Accounts</h3>
                <button className="panel-action-btn" onClick={() => setActiveTab('users')}>
                  View All
                </button>
              </div>
              <RecentUsersTable users={recentUsers.slice(0, 4)} />
            </article>

            {/* ── Supported Review Platforms — now using real data ── */}
            <article className="admin-panel">
              <div className="panel-header">
                <h3>Supported Review Platforms</h3>
                <button className="panel-action-btn" onClick={() => setActiveTab('platforms')}>
                  Manage
                </button>
              </div>
              <div className="platforms-list">
                {platforms.map((platform, index) => (
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
                  <p className="panel-subtitle">Analyses run per platform · live data</p>
                </div>
              </div>
              <PlatformUsageChart platforms={platforms} />
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
            <RecentActivityFeed activities={recentActivities} />
          </article>
        </section>
      </main>
    </div>
  );
}
