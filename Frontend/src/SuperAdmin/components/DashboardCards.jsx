import { useState } from 'react';
import { Users, Puzzle, BarChart3, Globe } from 'lucide-react';
import StatisticCard from './StatisticCard.jsx';
import { FALLBACK_PLATFORMS } from '../data/platforms.js';
import '../css/cards.css';

// FALLBACK_PLATFORMS is the canonical client-side registry of all supported
// platforms. When the API has not yet responded (stats is null), use its
// length as the floor so the card never flashes a misleading 0.
const CANONICAL_PLATFORM_COUNT = FALLBACK_PLATFORMS.length;

export default function DashboardCards({ stats }) {
  const [activeUsersPeriod, setActiveUsersPeriod] = useState('week');
  const [analysesPeriod, setAnalysesPeriod] = useState('week');

  const totalUsersVal = String(stats?.totalUsers ?? 0);

  // Active Users calculation: handle both object { week, month } and legacy numeric
  let activeUsersVal = 0;
  if (typeof stats?.activeUsers === 'object' && stats?.activeUsers !== null) {
    activeUsersVal = stats.activeUsers[activeUsersPeriod] ?? 0;
  } else if (typeof stats?.activeUsers === 'number') {
    activeUsersVal = stats.activeUsers;
  }

  // Total Analyses calculation: handle both object { week, month, allTime } and legacy numeric
  let totalAnalysesVal = 0;
  if (typeof stats?.totalAnalyses === 'object' && stats?.totalAnalyses !== null) {
    totalAnalysesVal = stats.totalAnalyses[analysesPeriod] ?? 0;
  } else if (typeof stats?.totalAnalyses === 'number') {
    totalAnalysesVal = stats.totalAnalyses;
  }

  // Supported Platforms: use the API value when available; otherwise fall back
  // to CANONICAL_PLATFORM_COUNT so the card never shows 0 due to a missing
  // field, loading state, or database query failure.
  const apiPlatformsCount = stats?.supportedPlatformsCount;
  const platformsVal = String(
    typeof apiPlatformsCount === 'number' && apiPlatformsCount > 0
      ? apiPlatformsCount
      : CANONICAL_PLATFORM_COUNT,
  );

  const STAT_CONFIG = [
    {
      id: 'total-users',
      title: 'Total Users',
      value: totalUsersVal,
      change: 'Lifetime',
      color: '#2563EB',
      icon: Users,
    },
    {
      id: 'active-users',
      title: 'Active Users',
      value: String(activeUsersVal),
      color: '#16A34A',
      icon: Puzzle,
      periodOptions: [
        { value: 'week', label: 'This Week' },
        { value: 'month', label: 'This Month' },
      ],
      selectedPeriod: activeUsersPeriod,
      onPeriodChange: setActiveUsersPeriod,
    },
    {
      id: 'analyses',
      title: 'Total Analyses',
      value: String(totalAnalysesVal),
      color: '#7C3AED',
      icon: BarChart3,
      periodOptions: [
        { value: 'week', label: 'This Week' },
        { value: 'month', label: 'This Month' },
        { value: 'allTime', label: 'All Time' },
      ],
      selectedPeriod: analysesPeriod,
      onPeriodChange: setAnalysesPeriod,
    },
    {
      id: 'platforms',
      title: 'Supported Platforms',
      value: platformsVal,
      change: 'Active',
      color: '#0891B2',
      icon: Globe,
    },
  ];

  return (
    <section className="stats-row" aria-label="Dashboard metrics">
      {STAT_CONFIG.map((stat) => (
        <StatisticCard key={stat.id} {...stat} />
      ))}
    </section>
  );
}
