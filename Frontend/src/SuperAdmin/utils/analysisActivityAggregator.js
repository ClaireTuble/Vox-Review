/**
 * Aggregates daily analysis activity into 4–5 weekly buckets for a calendar month.
 * - Week 1: Days 1–7
 * - Week 2: Days 8–14
 * - Week 3: Days 15–21
 * - Week 4: Days 22–28
 * - Week 5: Days 29–end of month (omitted when daysInMonth is 28)
 *
 * @param {Array<{ date: string, count: number }>} activity
 * @returns {Array<{ key: string, label: string, fullLabel: string, dateRange: string, count: number }>}
 */
export function aggregateMonthlyActivity(activity = []) {
  if (!Array.isArray(activity) || activity.length === 0) {
    return [];
  }

  let monthName = 'Month';
  let daysInMonth = 31;

  for (const item of activity) {
    if (item?.date) {
      const parts = String(item.date).split('-').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        monthName = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        daysInMonth = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
        break;
      }
    }
  }

  const countByDay = new Map();
  activity.forEach((item) => {
    if (!item?.date) return;
    const parts = String(item.date).split('-').map(Number);
    const day = parts.length === 3 && !isNaN(parts[2]) ? parts[2] : new Date(item.date).getUTCDate();
    if (!isNaN(day)) {
      countByDay.set(day, (countByDay.get(day) || 0) + (Number(item.count) || 0));
    }
  });

  const sumRange = (start, end) => {
    let sum = 0;
    for (let day = start; day <= end; day++) {
      sum += countByDay.get(day) || 0;
    }
    return sum;
  };

  const buckets = [
    {
      key: 'w1',
      label: 'W1',
      fullLabel: 'Week 1',
      dateRange: `${monthName} 1–7`,
      count: sumRange(1, 7),
    },
    {
      key: 'w2',
      label: 'W2',
      fullLabel: 'Week 2',
      dateRange: `${monthName} 8–14`,
      count: sumRange(8, 14),
    },
    {
      key: 'w3',
      label: 'W3',
      fullLabel: 'Week 3',
      dateRange: `${monthName} 15–21`,
      count: sumRange(15, 21),
    },
    {
      key: 'w4',
      label: 'W4',
      fullLabel: 'Week 4',
      dateRange: `${monthName} 22–28`,
      count: sumRange(22, 28),
    },
  ];

  if (daysInMonth > 28) {
    buckets.push({
      key: 'w5',
      label: 'W5',
      fullLabel: 'Week 5',
      dateRange: `${monthName} 29–${daysInMonth}`,
      count: sumRange(29, daysInMonth),
    });
  }

  return buckets;
}
