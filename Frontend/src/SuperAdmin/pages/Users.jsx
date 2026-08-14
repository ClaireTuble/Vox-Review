import { useState } from 'react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import SearchBar from '../components/SearchBar.jsx';
import TopActions from '../components/TopActions.jsx';
import UserRow from '../components/UserRow.jsx';
import { mockUsers, mockCurrentUser } from '../data/users.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/responsive.css';

export default function Users({ activeTab, setActiveTab, onSignOut }) {
  // Filter out any SuperAdmin entries — Manage Users shows regular users only
  const [users] = useState(mockUsers.filter((u) => u.role !== 'SuperAdmin'));

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Manage Users"
          subtitle="View and monitor regular VoxReview users and their platform activity."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="User Overview"
              subtitle="Monitor registered VoxReview users and their platform usage history."
            >
              <SearchBar />
            </TopActions>

            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Name / Email</th>
                    <th>Account Status</th>
                    <th>Registered</th>
                    <th>Platforms Used</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <UserRow key={user.id} user={user} />
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
