import { Globe, Loader2 } from 'lucide-react';
import '../css/cards.css';

/** Derive status badge colors from a status string. */
function getStatusStyle(status) {
  switch (status) {
    case 'Working':
      return { bg: 'rgba(22,163,74,0.12)', color: '#16A34A' };
    case 'Warning':
      return { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' };
    case 'Error':
      return { bg: 'rgba(239,68,68,0.12)', color: '#EF4444' };
    case 'Not Implemented':
      return { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' };
    case 'Unavailable':
    default:
      return { bg: 'rgba(107,114,128,0.08)', color: '#9CA3AF' };
  }
}

export default function PlatformStatusCard({ platform, isChecking }) {
  const status = platform.status || platform.scrapingStatus || 'Unavailable';
  const style = platform.statusBg
    ? { background: platform.statusBg, color: platform.statusColor }
    : getStatusStyle(status);

  return (
    <div className="platform-row-item">
      <div className="platform-name-group">
        <span className="platform-icon"><Globe size={13} /></span>
        <span>{platform.name}</span>
      </div>
      <div className="platform-metrics">
        {isChecking ? (
          <span
            className="platform-status-badge"
            style={{
              background: 'rgba(59,130,246,0.12)',
              color: '#60a5fa',
              border: '1px solid rgba(59,130,246,0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Loader2 size={11} className="spin-icon" />
            Checking...
          </span>
        ) : (
          <span className="platform-status-badge" style={{ background: style.bg || style.background, color: style.color }}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
