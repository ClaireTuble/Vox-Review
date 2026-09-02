import '../css/dashboard.css';

export default function AnalysisActivityChart({ activity = [] }) {
  const chartData = activity.map((item) => ({
    ...item,
    day: new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
  }));
  const max = Math.max(...chartData.map((d) => d.count), 1);

  return (
    <div className="activity-chart-wrap">
      {chartData.map((d) => {
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
