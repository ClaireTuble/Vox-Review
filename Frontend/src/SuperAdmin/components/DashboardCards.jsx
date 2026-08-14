import { Users, Puzzle, BarChart3, Globe } from 'lucide-react';
import StatisticCard from './StatisticCard.jsx';
import '../css/cards.css';

const STAT_CONFIG = [
  { id: 'total-users',  title: 'Total Users',        value: '3',        change: '+3',     color: '#2563EB', icon: Users },
  { id: 'active-users', title: 'Active Users',        value: '2',        change: '+2',     color: '#16A34A', icon: Puzzle },
  { id: 'analyses',     title: 'Total Analyses',      value: '47',       change: '+12',    color: '#7C3AED', icon: BarChart3 },
  { id: 'platforms',    title: 'Supported Platforms', value: '4 Active', change: 'Stable', color: '#0891B2', icon: Globe },
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
