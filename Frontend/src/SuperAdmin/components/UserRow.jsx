import { CircleDot, History } from 'lucide-react';
import '../css/tables.css';
import '../css/modal.css';

const PLATFORM_BADGE_STYLES = {
  'Shopee':            { bg: 'rgba(251,146,60,0.15)',   color: '#fb923c', border: '1px solid rgba(251,146,60,0.25)' },
  'Lazada':            { bg: 'rgba(192,132,252,0.15)',   color: '#c084fc', border: '1px solid rgba(192,132,252,0.25)' },
  'Google Maps':       { bg: 'rgba(96,165,250,0.15)',    color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' },
  'Google Play Store': { bg: 'rgba(110,231,183,0.15)',   color: '#6ee7b7', border: '1px solid rgba(110,231,183,0.25)' },
  'Steam':             { bg: 'rgba(129,140,248,0.15)',   color: '#818cf8', border: '1px solid rgba(129,140,248,0.25)' },
};

export default function UserRow({ user, onOpenHistory }) {
  const statusStyle = user.status === 'Pending'
    ? { color: '#fbbf24' }   // amber for pending
    : { color: '#86efac' };  // green for active

  const activities = user.activities || [];
  const uniquePlatforms = Array.from(new Set(activities.map((a) => a.platform))).filter(Boolean);

  return (
    <tr>
      <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{user.user_id}</td>
      <td>
        <div className="table-user-cell">
          <strong>{user.full_name || 'Unnamed user'}</strong>
          <span>{user.email}</span>
        </div>
      </td>

      <td>{user.role}</td>
      <td>
        <span className="status-dot-active" style={statusStyle}>
          <CircleDot size={10} />
          {user.status || 'Active'}
        </span>
      </td>

      {/* Platforms Used Column — Styled exactly as in the requested photo */}
      <td>
        {uniquePlatforms.length > 0 ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {uniquePlatforms.map((plat) => {
              const style = PLATFORM_BADGE_STYLES[plat] || {
                bg: 'rgba(148,163,184,0.15)',
                color: '#94a3b8',
                border: '1px solid rgba(148,163,184,0.25)',
              };
              return (
                <span
                  key={plat}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 14px',
                    borderRadius: '20px',
                    backgroundColor: style.bg,
                    color: style.color,
                    border: style.border,
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                  }}
                >
                  {plat}
                </span>
              );
            })}
          </div>
        ) : (
          <span style={{ color: '#64748b', fontSize: '0.85rem' }}>None</span>
        )}
      </td>

      <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>

      {/* Rightmost Action Column: View History */}
      <td>
        <button
          className="btn-view-history"
          onClick={() => onOpenHistory && onOpenHistory(user)}
          title="View user activity history"
        >
          <History size={14} />
          <span>View History</span>
        </button>
      </td>
    </tr>
  );
}
