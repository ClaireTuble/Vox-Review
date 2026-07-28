import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { mockCurrentUser } from '../data/users.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/responsive.css';

export default function Analytics({ activeTab, setActiveTab, onSignOut }) {
  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Analytics"
          subtitle="Inspect usage patterns, review volume, and platform health."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <div className="panel-header">
              <h2>Analytics Overview</h2>
            </div>
            <EmptyState
              title="Analytics views coming soon"
              description="Charts and reporting modules will be wired here as the backend API becomes available."
            />
          </article>
        </section>
      </main>
    </div>
  );
}
