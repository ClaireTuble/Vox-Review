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
          <article className="admin-panel">
            <div className="panel-header">
              <h2>VoxReview System Settings</h2>
            </div>
            <div className="settings-form">
              <div className="form-field-group">
                <label>AI Model Engine</label>
                <input className="auth-input" defaultValue="Gemini 1.5 Pro & Custom Sentiment Engine" readOnly />
              </div>
              <div className="form-field-group">
                <label>Max Reviews per Analysis Batch</label>
                <input className="auth-input" defaultValue="2,500 reviews" readOnly />
              </div>
              <div className="form-field-group">
                <label>Guest Mode Analysis Rate Limit</label>
                <input className="auth-input" defaultValue="5 requests / hour" readOnly />
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
