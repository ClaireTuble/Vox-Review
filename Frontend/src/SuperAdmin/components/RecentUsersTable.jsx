import '../css/tables.css';

export default function RecentUsersTable({ users }) {
  return (
    <div className="admin-table-container">
      <table className="admin-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {(!users || users.length === 0) ? (
            <tr>
              <td colSpan="4" style={{ textAlign: 'center', padding: '18px', color: '#64748b', fontSize: '0.88rem' }}>
                No recent users registered yet.
              </td>
            </tr>
          ) : (
            users.map((user) => {
              const statusStr = user.status || 'Active';
              const isInactive = String(statusStr).toLowerCase() === 'inactive';
              return (
                <tr key={user.id}>
                  <td>
                    <div className="table-user-cell">
                      <strong>{user.fullName || user.name || 'User'}</strong>
                      <span>{user.email}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`role-badge ${String(user.role || '').toLowerCase()}`}>{user.role}</span>
                  </td>
                  <td>
                    <span className={`user-status-pill status-${isInactive ? 'inactive' : 'active'}`}>
                      <span className="user-status-dot" />
                      <span>{statusStr}</span>
                    </span>
                  </td>
                  <td>{user.joined}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
