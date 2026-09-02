import { X, ExternalLink, History, Calendar, Globe } from 'lucide-react';
import '../css/modal.css';

const PLATFORM_COLORS = {
  'Shopee':            { bg: 'rgba(251,146,60,0.15)',   color: '#fb923c', border: '1px solid rgba(251,146,60,0.25)' },
  'Lazada':            { bg: 'rgba(192,132,252,0.15)',   color: '#c084fc', border: '1px solid rgba(192,132,252,0.25)' },
  'Google Maps':       { bg: 'rgba(96,165,250,0.15)',    color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' },
  'Google Play Store': { bg: 'rgba(110,231,183,0.15)',   color: '#6ee7b7', border: '1px solid rgba(110,231,183,0.25)' },
  'Steam':             { bg: 'rgba(129,140,248,0.15)',   color: '#818cf8', border: '1px solid rgba(129,140,248,0.25)' },
};

function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default function UserHistoryModal({ user, onClose }) {
  if (!user) return null;

  const activities = (user.activities || []).slice(0, 7);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <History size={18} />
            </div>
            <div>
              <h3>Activity History</h3>
              <p className="modal-user-subtitle">
                <strong>{user.full_name || 'User'}</strong> ({user.email}) &bull; User ID: {user.user_id}
              </p>
            </div>
          </div>

          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {activities.length === 0 ? (
            <div className="modal-empty-state">
              <History size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p>No platform activities recorded yet for this user.</p>
            </div>
          ) : (
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Website / Platform</th>
                    <th>Product Title</th>
                    <th>Activity Type</th>
                    <th>Date &amp; Time</th>
                    <th>Product URL</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((act, index) => {
                    const c = PLATFORM_COLORS[act.platform] || {
                      bg: 'rgba(148,163,184,0.15)',
                      color: '#94a3b8',
                      border: '1px solid rgba(148,163,184,0.25)',
                    };
                    const isAnalyzed = act.activity_type === 'Analyzed';

                    return (
                      <tr key={act.id || index}>
                        <td>
                          <span
                            className="history-plat-pill"
                            style={{ background: c.bg, color: c.color, border: c.border }}
                          >
                            <Globe size={11} style={{ marginRight: '5px' }} />
                            {act.platform}
                          </span>
                        </td>

                        <td>
                          <span className="history-product-title">
                            {act.product_title || '—'}
                          </span>
                        </td>

                        <td>
                          <span className={`history-type-tag ${isAnalyzed ? 'type-analyzed' : 'type-used'}`}>
                            {act.activity_type || 'Used'}
                          </span>
                        </td>

                        <td className="history-time-cell">
                          <Calendar size={12} style={{ marginRight: '6px', opacity: 0.6 }} />
                          {formatDateTime(act.created_at)}
                        </td>

                        <td>
                          {act.product_url ? (
                            <a
                              href={act.product_url}
                              target="_blank"
                              rel="noreferrer"
                              className="history-url-link"
                            >
                              <span>Open Link</span>
                              <ExternalLink size={12} />
                            </a>
                          ) : (
                            <span className="history-url-none">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
