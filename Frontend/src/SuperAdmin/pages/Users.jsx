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
  const [users] = useState(mockUsers);

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Manage Users"
          subtitle="Review account activity, update roles, and oversee user access."
          user={mockCurrentUser}
        />

        <section className="admin-content-grid">
          <article className="admin-panel">
            <TopActions
              title="User Management Hub"
              subtitle="Manage platform users, update roles, and review extension activity logs."
              primaryLabel="Add New User"
              onPrimaryAction={() => window.alert('Add new user modal placeholder')}
            >
              <SearchBar />
            </TopActions>

            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Name / Email</th>
                    <th>Role</th>
                    <th>Account Status</th>
                    <th>Joined Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <UserRow key={user.id} user={user} onEdit={() => window.alert(`Editing user ${user.name}`)} />
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
