// RecentActivityFeed — UI only, static mock data
import { ActivitySquare } from 'lucide-react';
import '../css/dashboard.css';
import '../css/tables.css';

const PLATFORM_COLORS = {
  'Shopee':            { bg: 'rgba(251,146,60,0.14)',   color: '#fb923c' },
  'Lazada':            { bg: 'rgba(192,132,252,0.14)',   color: '#c084fc' },
  'Google Maps':       { bg: 'rgba(96,165,250,0.14)',    color: '#60a5fa' },
  'Google Play Store': { bg: 'rgba(110,231,183,0.14)',   color: '#6ee7b7' },
  'Steam':             { bg: 'rgba(129,140,248,0.14)',   color: '#818cf8' },
};

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Just now';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (diffMs < 0 || diffMs < 60000) return 'Just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export default function RecentActivityFeed({ activities }) {
  const items = (activities && activities.length > 0) ? activities : [];

  if (items.length === 0) {
    return (
      <div style={{ padding: '16px', color: '#94a3b8', fontSize: '0.9rem' }}>
        No recent user activity recorded yet.
      </div>
    );
  }

  return (
    <ul className="activity-feed" aria-label="Recent user activity">
      {items.map((item) => {
        const platformName = item.platform || 'Shopee';
        const c = PLATFORM_COLORS[platformName] ?? { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' };
        const actionLabel = item.activity_type ? `${item.activity_type} platform` : (item.action || 'Used platform');
        const timeAgo = item.created_at ? formatTimeAgo(item.created_at) : (item.time || 'Just now');

        return (
          <li key={item.id} className="activity-feed-item">
            <span className="activity-feed-icon">
              <ActivitySquare size={14} />
            </span>
            <div className="activity-feed-body">
              <span className="activity-feed-user">{item.user}</span>
              <span className="activity-feed-action">
                {actionLabel}{' '}
                <span
                  className="platform-pill"
                  style={{ background: c.bg, color: c.color }}
                >
                  {platformName}
                </span>
              </span>
            </div>
            <span className="activity-feed-time">{timeAgo}</span>
          </li>
        );
      })}
    </ul>
  );
}
