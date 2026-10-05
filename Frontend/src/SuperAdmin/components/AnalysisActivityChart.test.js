import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateMonthlyActivity } from '../utils/analysisActivityAggregator.js';


test('aggregateMonthlyActivity returns empty array for empty activity list', () => {
  assert.deepEqual(aggregateMonthlyActivity([]), []);
  assert.deepEqual(aggregateMonthlyActivity(null), []);
});

test('aggregateMonthlyActivity produces 5 weekly buckets for a 31-day month', () => {
  // October (31 days)
  const activity = Array.from({ length: 31 }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return { date: `2026-10-${day}`, count: i + 1 }; // count equals day number
  });

  const buckets = aggregateMonthlyActivity(activity);
  assert.equal(buckets.length, 5);

  // Week 1: days 1..7 -> sum 1+2+3+4+5+6+7 = 28
  assert.equal(buckets[0].label, 'W1');
  assert.equal(buckets[0].fullLabel, 'Week 1');
  assert.equal(buckets[0].dateRange, 'Oct 1–7');
  assert.equal(buckets[0].count, 28);

  // Week 2: days 8..14 -> sum 8+9+10+11+12+13+14 = 77
  assert.equal(buckets[1].label, 'W2');
  assert.equal(buckets[1].fullLabel, 'Week 2');
  assert.equal(buckets[1].dateRange, 'Oct 8–14');
  assert.equal(buckets[1].count, 77);

  // Week 3: days 15..21 -> sum 15..21 = 126
  assert.equal(buckets[2].label, 'W3');
  assert.equal(buckets[2].fullLabel, 'Week 3');
  assert.equal(buckets[2].dateRange, 'Oct 15–21');
  assert.equal(buckets[2].count, 126);

  // Week 4: days 22..28 -> sum 22..28 = 175
  assert.equal(buckets[3].label, 'W4');
  assert.equal(buckets[3].fullLabel, 'Week 4');
  assert.equal(buckets[3].dateRange, 'Oct 22–28');
  assert.equal(buckets[3].count, 175);

  // Week 5: days 29..31 -> sum 29+30+31 = 90
  assert.equal(buckets[4].label, 'W5');
  assert.equal(buckets[4].fullLabel, 'Week 5');
  assert.equal(buckets[4].dateRange, 'Oct 29–31');
  assert.equal(buckets[4].count, 90);

  // Total analyses preserved with zero count loss
  const totalRaw = activity.reduce((sum, item) => sum + item.count, 0);
  const totalBuckets = buckets.reduce((sum, item) => sum + item.count, 0);
  assert.equal(totalBuckets, totalRaw);
});

test('aggregateMonthlyActivity omits Week 5 for a 28-day month (February non-leap)', () => {
  const activity = Array.from({ length: 28 }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return { date: `2027-02-${day}`, count: 1 };
  });

  const buckets = aggregateMonthlyActivity(activity);
  assert.equal(buckets.length, 4);
  assert.equal(buckets[0].dateRange, 'Feb 1–7');
  assert.equal(buckets[3].dateRange, 'Feb 22–28');
  assert.equal(buckets.find((b) => b.label === 'W5'), undefined);
});

test('aggregateMonthlyActivity handles zero-activity days correctly', () => {
  const activity = Array.from({ length: 30 }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return { date: `2026-09-${day}`, count: 0 };
  });

  const buckets = aggregateMonthlyActivity(activity);
  assert.equal(buckets.length, 5);
  buckets.forEach((bucket) => {
    assert.equal(bucket.count, 0);
  });
});
