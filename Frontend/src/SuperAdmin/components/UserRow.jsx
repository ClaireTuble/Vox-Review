import { CircleDot } from 'lucide-react';
import '../css/tables.css';

export default function UserRow({ user, onEdit }) {
  return (
    <tr>
      <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{user.id}</td>
      <td>
        <div className="table-user-cell">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
      </td>
      <td>
        <span className={`role-badge ${user.role.toLowerCase()}`}>{user.role}</span>
      </td>
      <td>
        <span className="status-dot-active">
          <CircleDot size={10} />
          {user.status}
        </span>
      </td>
      <td>{user.joined}</td>
      <td>
        <button className="table-action-btn" onClick={() => onEdit(user)}>
          Edit
        </button>
      </td>
    </tr>
  );
}
