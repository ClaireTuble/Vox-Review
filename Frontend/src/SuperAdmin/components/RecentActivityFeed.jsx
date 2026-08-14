// RecentActivityFeed — UI only, static mock data
import { ActivitySquare } from 'lucide-react';
import '../css/dashboard.css';
import '../css/tables.css';

const PLATFORM_COLORS = {
  'Shopee':            { bg: 'rgba(251,146,60,0.14)',   color: '#fb923c' },
  'Lazada':            { bg: 'rgba(192,132,252,0.14)',   color: '#c084fc' },
  'Google Maps':       { bg: 'rgba(96,165,250,0.14)',    color: '#60a5fa' },
  'Google Play Store': { bg: 'rgba(110,231,183,0.14)',   color: '#6ee7b7' },
};

// Mock recent activity — UI demo data only
const MOCK_RECENT = [
  { id: 1, user: 'Alex Rivera',     action: 'Analyzed reviews from', platform: 'Shopee',            time: '2 min ago' },
  { id: 2, user: 'Samantha Vance',  action: 'Analyzed reviews from', platform: 'Google Maps',        time: '14 min ago' },
  { id: 3, user: 'Elena Rostova',   action: 'Analyzed reviews from', platform: 'Lazada',             time: '31 min ago' },
  { id: 4, user: 'Alex Rivera',     action: 'Analyzed reviews from', platform: 'Google Play Store',  time: '1 hr ago' },
  { id: 5, user: 'Samantha Vance',  action: 'Analyzed reviews from', platform: 'Shopee',             time: '2 hrs ago' },
];

export default function RecentActivityFeed() {
  return (
    <ul className="activity-feed" aria-label="Recent user activity">
      {MOCK_RECENT.map((item) => {
        const c = PLATFORM_COLORS[item.platform] ?? { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' };
        return (
          <li key={item.id} className="activity-feed-item">
            <span className="activity-feed-icon">
              <ActivitySquare size={14} />
            </span>
            <div className="activity-feed-body">
              <span className="activity-feed-user">{item.user}</span>
              <span className="activity-feed-action">
                {item.action}{' '}
                <span
                  className="platform-pill"
                  style={{ background: c.bg, color: c.color }}
                >
                  {item.platform}
                </span>
              </span>
            </div>
            <span className="activity-feed-time">{item.time}</span>
          </li>
        );
      })}
    </ul>
  );
}
