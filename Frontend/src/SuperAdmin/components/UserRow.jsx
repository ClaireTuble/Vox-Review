import { History } from 'lucide-react';

import { formatRelativeTime } from '../utils/relativeTime.js';
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
  const accountStatus = user.account_status || user.status || 'Active';
  const currentStatus = user.current_status || 'Offline';
  const lastSeenText = user.last_seen_at
    ? formatRelativeTime(user.last_seen_at)
    : 'Never';

  const isAccountActive = String(accountStatus).toLowerCase() === 'active';
  const isCurrentOnline = String(currentStatus).toLowerCase() === 'online';

  const accountVariant = isAccountActive ? 'active' : 'inactive';
  const currentVariant = isCurrentOnline ? 'online' : 'offline';

  const activities = user.activities || [];
  const uniquePlatforms = Array.from(new Set(activities.map((a) => a.platform))).filter(Boolean);

  return (
    <tr>
      <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{user.user_id}</td>
      <td>
        <div className="table-user-cell">
          <strong style={{ color: 'var(--accent-color, #818cf8)' }}>@{user.username || user.email?.split('@')[0] || 'user'}</strong>
          <span>{user.full_name || 'Unnamed user'}</span>
          <span style={{ fontSize: '0.78rem', opacity: 0.7 }}>{user.email}</span>
        </div>
      </td>

      <td>{user.role}</td>
      <td>
        <span className={`user-status-pill status-${accountVariant}`}>
          <span className="user-status-dot" />
          <span>{accountStatus}</span>
        </span>
      </td>
      <td>
        <span className={`user-status-pill status-${currentVariant}`}>
          <span className="user-status-dot" />
          <span>{currentStatus}</span>
        </span>
      </td>
      <td style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>{lastSeenText}</td>


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
