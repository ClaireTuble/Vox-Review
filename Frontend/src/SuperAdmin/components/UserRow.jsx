import { CircleDot } from 'lucide-react';
import '../css/tables.css';

const PLATFORM_COLORS = {
  'Shopee': { bg: 'rgba(251,146,60,0.14)', color: '#fb923c' },
  'Lazada': { bg: 'rgba(147,51,234,0.14)', color: '#c084fc' },
  'Google Maps': { bg: 'rgba(59,130,246,0.14)', color: '#60a5fa' },
  'Google Play Store': { bg: 'rgba(52,211,153,0.14)', color: '#6ee7b7' },
};

export default function UserRow({ user }) {
  const statusStyle = user.status === 'Pending'
    ? { color: '#fbbf24' }   // amber for pending
    : { color: '#86efac' };  // green for active

  return (
    <tr>
      <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{user.id}</td>
      <td>
        <div className="table-user-cell">
          <strong>{user.username ? `@${user.username}` : user.name}</strong>
          <span>{user.email}</span>
        </div>
      </td>

      <td>
        <span className="status-dot-active" style={statusStyle}>
          <CircleDot size={10} />
          {user.status}
        </span>
      </td>
      <td>{user.joined}</td>
      <td>
        <div className="platforms-used-cell">
          {(user.platformsUsed && user.platformsUsed.length > 0)
            ? user.platformsUsed.map((p) => {
                const c = PLATFORM_COLORS[p] || { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' };
                return (
                  <span
                    key={p}
                    className="platform-pill"
                    style={{ background: c.bg, color: c.color }}
                  >
                    {p}
                  </span>
                );
              })
            : <span style={{ color: '#475569', fontSize: '11px' }}>None recorded</span>
          }
        </div>
      </td>

    </tr>
  );
}
