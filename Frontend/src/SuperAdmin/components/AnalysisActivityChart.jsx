import { aggregateMonthlyActivity } from '../utils/analysisActivityAggregator.js';
import '../css/dashboard.css';

export { aggregateMonthlyActivity };


export default function AnalysisActivityChart({ activity = [], period = 'week' }) {
  const isMonthView = period === 'month' || activity.length > 7;

  let chartData = [];
  if (isMonthView) {
    const buckets = aggregateMonthlyActivity(activity);
    chartData = buckets.map((bucket) => ({
      key: bucket.key,
      day: bucket.label,
      fullLabel: bucket.fullLabel,
      dateRange: bucket.dateRange,
      count: bucket.count,
      tooltip: `${bucket.fullLabel} · ${bucket.dateRange} · ${bucket.count} ${bucket.count === 1 ? 'analysis' : 'analyses'}`,
    }));
  } else {
    chartData = activity.map((item, index) => {
      const parts = String(item?.date || '').split('-').map(Number);
      const dateObj = (parts.length === 3 && !parts.some(isNaN))
        ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
        : new Date(item?.date);

      const dayLabel = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
        : `Day ${index + 1}`;

      const fullDate = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
        : item?.date;

      const count = Number(item?.count) || 0;

      return {
        key: item?.date || `day-${index}`,
        day: dayLabel,
        fullLabel: dayLabel,
        dateRange: fullDate,
        count: count,
        tooltip: `${dayLabel} · ${fullDate} · ${count} ${count === 1 ? 'analysis' : 'analyses'}`,
      };
    });
  }

  const max = Math.max(...chartData.map((d) => d.count), 1);

  return (
    <div className={`activity-chart-wrap ${isMonthView ? 'month-view' : ''}`}>
      {chartData.map((d) => {
        const heightPct = Math.round((d.count / max) * 100);
        return (
          <div key={d.key} className="activity-bar-col">
            <span className="activity-bar-count">{d.count}</span>
            <div className="activity-bar-track">
              <div
                className="activity-bar-fill"
                style={{ height: `${heightPct}%` }}
                role="meter"
                aria-valuenow={d.count}
                aria-label={d.tooltip}
                title={d.tooltip}
              />
            </div>
            <span className="activity-bar-day">{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}
