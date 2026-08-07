import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { mockCurrentUser } from '../data/users.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/responsive.css';

export default function Settings({ activeTab, setActiveTab, onSignOut }) {
  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="System Settings"
          subtitle="Maintain platform defaults, engine options, and operational guardrails."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          {/* Settings left blank for now */}
        </section>
      </main>
    </div>
  );
}
