import { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import SearchBar from '../components/SearchBar.jsx';
import TopActions from '../components/TopActions.jsx';
import UserRow from '../components/UserRow.jsx';
import UserHistoryModal from '../components/UserHistoryModal.jsx';
import { mockCurrentUser } from '../data/users.js';
import authService from '../../services/authService.js';
import '../css/dashboard.css';
import '../css/sidebar.css';
import '../css/header.css';
import '../css/cards.css';
import '../css/tables.css';
import '../css/modal.css';
import '../css/responsive.css';

export default function Users({ activeTab, setActiveTab, onSignOut }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedHistoryUser, setSelectedHistoryUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadUsers = async () => {
      try {
        const token = await authService.getSuperAdminAccessToken();
        if (!token) throw new Error('Super Admin session is no longer valid.');

        const response = await fetch('http://localhost:5000/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Unable to load users.');
        }

        if (mounted) setUsers(result.users || []);
      } catch (error) {
        if (mounted) setErrorMessage(error.message || 'Unable to load users.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadUsers();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="superadmin-page-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <main className="superadmin-viewport">
        <Header
          title="Manage Users"
          subtitle="View and monitor regular VoxReview users and their platform activity."
          user={mockCurrentUser}
          onNavigate={setActiveTab}
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
                    <th>Role</th>
                    <th>Account Status</th>
                    <th>Current Status</th>
                    <th>Last Seen</th>
                    <th>Platforms Used</th>
                    <th>Registered</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan="9">Loading users...</td></tr>
                  )}
                  {!isLoading && errorMessage && (
                    <tr><td colSpan="9">{errorMessage}</td></tr>
                  )}
                  {!isLoading && !errorMessage && users.length === 0 && (
                    <tr><td colSpan="9">No users registered yet.</td></tr>
                  )}
                  {!isLoading && !errorMessage && users.map((user) => (
                    <UserRow
                      key={user.user_id}
                      user={user}
                      onOpenHistory={(u) => setSelectedHistoryUser(u)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        {/* Modern Activity History Modal */}
        {selectedHistoryUser && (
          <UserHistoryModal
            user={selectedHistoryUser}
            onClose={() => setSelectedHistoryUser(null)}
          />
        )}
      </main>
    </div>
  );
}
