import { Users, Puzzle, BarChart3, Globe } from 'lucide-react';
import StatisticCard from './StatisticCard.jsx';
import '../css/cards.css';

export default function DashboardCards({ stats }) {
  const totalUsersStr = String(stats?.totalUsers ?? '1');
  const activeUsersStr = String(stats?.activeUsers ?? '1');
  const platformsStr = `${stats?.supportedPlatformsCount ?? 5} Active`;

  const STAT_CONFIG = [
    { id: 'total-users',  title: 'Total Users',        value: totalUsersStr,  change: `+${totalUsersStr}`, color: '#2563EB', icon: Users },
    { id: 'active-users', title: 'Active Users',        value: activeUsersStr, change: `+${activeUsersStr}`, color: '#16A34A', icon: Puzzle },
    { id: 'analyses',     title: 'Total Analyses',      value: '47',           change: '+12',               color: '#7C3AED', icon: BarChart3 },
    { id: 'platforms',    title: 'Supported Platforms', value: platformsStr,   change: 'Stable',            color: '#0891B2', icon: Globe },
  ];

  return (
    <section className="stats-row" aria-label="Dashboard metrics">
      {STAT_CONFIG.map((stat) => (
        <StatisticCard key={stat.id} {...stat} />
      ))}
    </section>
  );
}
