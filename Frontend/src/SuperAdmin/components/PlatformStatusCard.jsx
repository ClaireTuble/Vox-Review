import { Globe } from 'lucide-react';
import '../css/cards.css';

export default function PlatformStatusCard({ platform }) {
  return (
    <div className="platform-row-item">
      <div className="platform-name-group">
        <span className="platform-icon"><Globe size={13} /></span>
        <span>{platform.name}</span>
      </div>
      <div className="platform-metrics">
        <span className="response-time">{platform.responseTime}</span>
        <span className="platform-status-badge" style={{ background: platform.statusBg, color: platform.statusColor }}>
          {platform.status}
        </span>
      </div>
    </div>
  );
}
