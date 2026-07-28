import { BarChart3 } from 'lucide-react';
import '../css/cards.css';

export default function StatisticCard({ title, value, change, color, icon: Icon = BarChart3 }) {
  return (
    <article className="stat-card">
      <div className="stat-card-header">
        <span className="stat-icon" style={{ color }}>
          <Icon size={18} />
        </span>
        <span className="stat-badge">{change}</span>
      </div>
      <span className="stat-value" style={{ color }}>{value}</span>
      <span className="stat-label">{title}</span>
    </article>
  );
}
