import { Users, Puzzle, BarChart3, Globe } from 'lucide-react';
import StatisticCard from './StatisticCard.jsx';
import '../css/cards.css';

const STAT_CONFIG = [
  { id: 'users', label: 'Total Registered Users', value: '8,420', change: '+12.5%', color: '#2563EB', icon: Users },
  { id: 'extension', label: 'Active Chrome Extensions', value: '6,140', change: '+18.2%', color: '#16A34A', icon: Puzzle },
  { id: 'reviews', label: 'Reviews Analyzed', value: '1,420,890', change: '+24.6%', color: '#2563EB', icon: BarChart3 },
  { id: 'platforms', label: 'Supported Platforms', value: '14 Active', change: 'Stable', color: '#2563EB', icon: Globe },
];

export default function DashboardCards() {
  return (
    <section className="stats-row" aria-label="Dashboard metrics">
      {STAT_CONFIG.map((stat) => (
        <StatisticCard key={stat.id} {...stat} />
      ))}
    </section>
  );
}
