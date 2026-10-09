// PlatformUsageChart — UI only, demo data via props
import '../css/dashboard.css';

const PLATFORM_COLORS = {
  'Shopee':            { bar: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
  'Lazada':            { bar: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
  'Google Maps':       { bar: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  'Google Play Store': { bar: '#6ee7b7', bg: 'rgba(110,231,183,0.12)' },
};

export default function PlatformUsageChart({ platforms }) {
  const max = Math.max(...platforms.map((p) => p.usageCount ?? 0), 1);

  return (
    <div className="overview-chart-panel">
      {platforms.map((p) => {
        const pct = Math.round(((p.usageCount ?? 0) / max) * 100);
        const colors = PLATFORM_COLORS[p.name] ?? { bar: '#93c5fd', bg: 'rgba(147,197,253,0.12)' };
        return (
          <div key={p.name} className="usage-bar-row">
            <span className="usage-bar-label">{p.name}</span>
            <div className="usage-bar-track">
              <div
                className="usage-bar-fill"
                style={{ width: `${pct}%`, background: colors.bar }}
                aria-valuenow={p.usageCount}
                role="meter"
              />
            </div>
            <span className="usage-bar-count" style={{ color: colors.bar }}>
              {p.usageCount ?? 0}
            </span>
          </div>
        );
      })}
    </div>
  );
}
