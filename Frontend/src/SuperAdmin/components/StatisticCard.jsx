import { BarChart3 } from 'lucide-react';
import '../css/cards.css';

export default function StatisticCard({
  title,
  value,
  change,
  color,
  icon: Icon = BarChart3,
  periodOptions,
  selectedPeriod,
  onPeriodChange,
}) {
  return (
    <article className="stat-card">
      <div className="stat-card-header">
        <span className="stat-icon" style={{ color }}>
          <Icon size={18} />
        </span>
        {periodOptions && periodOptions.length > 0 ? (
          <select
            className="stat-period-select"
            value={selectedPeriod}
            onChange={(e) => onPeriodChange && onPeriodChange(e.target.value)}
            aria-label={`${title} period filter`}
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="stat-badge">{change}</span>
        )}
      </div>
      <span className="stat-value" style={{ color }}>{value}</span>
      <span className="stat-label">{title}</span>
    </article>
  );
}
