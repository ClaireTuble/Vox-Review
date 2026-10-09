const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

function formatUnit(value, unit) {
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
}

export function formatRelativeTime(timestamp, now = Date.now()) {
  const timestampMs = timestamp instanceof Date
    ? timestamp.getTime()
    : new Date(timestamp).getTime();
  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(timestampMs) || !Number.isFinite(nowMs)) return '—';

  const elapsedMs = nowMs - timestampMs;
  if (elapsedMs < MINUTE_MS) return 'Just now';
  if (elapsedMs < HOUR_MS) return formatUnit(Math.floor(elapsedMs / MINUTE_MS), 'min');
  if (elapsedMs < DAY_MS) return formatUnit(Math.floor(elapsedMs / HOUR_MS), 'hour');
  if (elapsedMs < WEEK_MS) return formatUnit(Math.floor(elapsedMs / DAY_MS), 'day');
  if (elapsedMs < MONTH_MS) return formatUnit(Math.floor(elapsedMs / WEEK_MS), 'week');
  return formatUnit(Math.floor(elapsedMs / MONTH_MS), 'month');
}