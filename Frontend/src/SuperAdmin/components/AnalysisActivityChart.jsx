// AnalysisActivityChart — UI only, static mock data
import '../css/dashboard.css';

// Mock: analyses per day for the last 7 days
const MOCK_ACTIVITY = [
  { day: 'Mon', count: 5 },
  { day: 'Tue', count: 9 },
  { day: 'Wed', count: 7 },
  { day: 'Thu', count: 12 },
  { day: 'Fri', count: 6 },
  { day: 'Sat', count: 4 },
  { day: 'Sun', count: 4 },
];

export default function AnalysisActivityChart() {
  const max = Math.max(...MOCK_ACTIVITY.map((d) => d.count), 1);

  return (
    <div className="activity-chart-wrap">
      {MOCK_ACTIVITY.map((d) => {
        const heightPct = Math.round((d.count / max) * 100);
        return (
          <div key={d.day} className="activity-bar-col">
            <span className="activity-bar-count">{d.count}</span>
            <div className="activity-bar-track">
              <div
                className="activity-bar-fill"
                style={{ height: `${heightPct}%` }}
                role="meter"
                aria-valuenow={d.count}
                aria-label={`${d.day}: ${d.count} analyses`}
              />
            </div>
            <span className="activity-bar-day">{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}
