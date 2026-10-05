import assert from "node:assert/strict";
import test from "node:test";
import { getAnalysisActivitySummary, calculateDashboardStats } from "./adminDashboardController.js";

function dashboardWindow() {
  const today = new Date(Date.UTC(2026, 9, 2)); // Oct 2, 2026
  const since = new Date(today);
  since.setUTCDate(today.getUTCDate() - 6);
  return { today, since };
}

test("dashboard totals increment after Analyzed and chart only increments on its event day", () => {
  const { today, since } = dashboardWindow();
  const todayAtNoon = new Date(today);
  todayAtNoon.setUTCHours(12, 0, 0, 0);
  const tenDaysAgo = new Date(today);
  tenDaysAgo.setUTCDate(today.getUTCDate() - 10);
  const existingRows = [
    { activity_type: "Used", created_at: todayAtNoon.toISOString() },
    { activity_type: "Analyzed", created_at: tenDaysAgo.toISOString() },
  ];

  const before = getAnalysisActivitySummary(existingRows, since);
  const after = getAnalysisActivitySummary([
    ...existingRows,
    { activity_type: "Analyzed", created_at: todayAtNoon.toISOString() },
  ], since);
  const eventDay = todayAtNoon.toISOString().slice(0, 10);

  assert.equal(before.totalAnalyses, 1);
  assert.equal(after.totalAnalyses, 2);
  assert.equal(after.totalAnalyses - before.totalAnalyses, 1);
  assert.equal(before.analysisActivity.find((day) => day.date === eventDay).count, 0);
  assert.equal(after.analysisActivity.find((day) => day.date === eventDay).count, 1);
});

test("calculateDashboardStats handles no activity, 1 activity, multiple activities, and exact time periods", () => {
  const now = new Date(Date.UTC(2026, 9, 2, 12, 0, 0)); // Oct 2, 2026 12:00 UTC
  const users = [
    { user_id: 1, email: "u1@test.com" },
    { user_id: 2, email: "u2@test.com" },
    { user_id: 3, email: "u3@test.com" },
  ];

  // Case 1: No activity
  const statsNoActivity = calculateDashboardStats({
    canonicalRegularUsers: users,
    activities: [],
    supportedPlatformsCount: 4,
    now,
  });

  assert.equal(statsNoActivity.totalUsers, 3);
  assert.equal(statsNoActivity.activeUsers.week, 0);
  assert.equal(statsNoActivity.activeUsers.month, 0);
  assert.equal(statsNoActivity.totalAnalyses.week, 0);
  assert.equal(statsNoActivity.totalAnalyses.month, 0);
  assert.equal(statsNoActivity.totalAnalyses.allTime, 0);
  assert.deepEqual(statsNoActivity.platformUsage.week, {});
  assert.deepEqual(statsNoActivity.platformUsage.month, {});
  assert.equal(statsNoActivity.analysisActivity.week.length, 7);
  assert.equal(statsNoActivity.analysisActivity.month.length, 31); // October has 31 days

  // Case 2: One activity (Used Shopee today)
  const oneActivity = [
    { user_id: 1, platform: "Shopee", activity_type: "Used", created_at: now.toISOString() },
  ];
  const statsOneActivity = calculateDashboardStats({
    canonicalRegularUsers: users,
    activities: oneActivity,
    supportedPlatformsCount: 4,
    now,
  });

  assert.equal(statsOneActivity.totalUsers, 3);
  assert.equal(statsOneActivity.activeUsers.week, 1);
  assert.equal(statsOneActivity.activeUsers.month, 1);
  assert.equal(statsOneActivity.totalAnalyses.week, 0);
  assert.equal(statsOneActivity.totalAnalyses.month, 0);
  assert.equal(statsOneActivity.totalAnalyses.allTime, 0);
  assert.equal(statsOneActivity.platformUsage.week.Shopee, 1);
  assert.equal(statsOneActivity.platformUsage.month.Shopee, 1);

  // Case 3: Multiple activities with time boundary distinction
  // Date calculations:
  // Today: Oct 2, 2026
  // 3 days ago: Sep 29, 2026 (In This Week, In This Month? Sep is NOT current month Oct)
  // 1 day ago: Oct 1, 2026 (In This Week AND In This Month)
  // 15 days ago: Sep 17, 2026 (NOT in This Week, NOT in current month Oct)
  // 40 days ago: Aug 23, 2026 (All Time only)
  const todayIso = new Date(Date.UTC(2026, 9, 2, 10, 0, 0)).toISOString();
  const oct1Iso = new Date(Date.UTC(2026, 9, 1, 15, 0, 0)).toISOString();
  const sep29Iso = new Date(Date.UTC(2026, 8, 29, 10, 0, 0)).toISOString(); // 3 days ago (Sep 29)
  const sep17Iso = new Date(Date.UTC(2026, 8, 17, 10, 0, 0)).toISOString(); // 15 days ago (Sep 17)
  const aug23Iso = new Date(Date.UTC(2026, 7, 23, 10, 0, 0)).toISOString(); // 40 days ago

  const multiActivities = [
    // User 1
    { user_id: 1, platform: "Shopee", activity_type: "Used", created_at: todayIso },
    { user_id: 1, platform: "Shopee", activity_type: "Analyzed", created_at: todayIso },
    { user_id: 1, platform: "Lazada", activity_type: "Used", created_at: oct1Iso },
    { user_id: 1, platform: "Lazada", activity_type: "Analyzed", created_at: oct1Iso },
    // User 2 (activity 3 days ago - Sep 29: in 7-day week window, but Sep is prior month)
    { user_id: 2, platform: "Google Maps", activity_type: "Used", created_at: sep29Iso },
    { user_id: 2, platform: "Google Maps", activity_type: "Analyzed", created_at: sep29Iso },
    // User 3 (activities in prior month & 40 days ago)
    { user_id: 3, platform: "Steam", activity_type: "Used", created_at: sep17Iso },
    { user_id: 3, platform: "Steam", activity_type: "Analyzed", created_at: aug23Iso },
  ];

  const statsMulti = calculateDashboardStats({
    canonicalRegularUsers: users,
    activities: multiActivities,
    supportedPlatformsCount: 4,
    now,
  });

  // Active Users:
  // Week window (Sep 26 - Oct 2): User 1 (today, oct1), User 2 (sep29) -> 2 active users
  // Month window (Oct 1 - Oct 31): User 1 (today, oct1) -> 1 active user
  assert.equal(statsMulti.activeUsers.week, 2);
  assert.equal(statsMulti.activeUsers.month, 1);

  // Total Analyses:
  // Week: User 1 today, User 1 oct1, User 2 sep29 -> 3
  // Month: User 1 today, User 1 oct1 -> 2
  // All Time: User 1 today, User 1 oct1, User 2 sep29, User 3 aug23 -> 4
  assert.equal(statsMulti.totalAnalyses.week, 3);
  assert.equal(statsMulti.totalAnalyses.month, 2);
  assert.equal(statsMulti.totalAnalyses.allTime, 4);

  // Platform Usage ("Used" only):
  // Week: Shopee: 1 (User 1), Lazada: 1 (User 1), Google Maps: 1 (User 2)
  // Month: Shopee: 1 (User 1), Lazada: 1 (User 1)
  assert.equal(statsMulti.platformUsage.week.Shopee, 1);
  assert.equal(statsMulti.platformUsage.week.Lazada, 1);
  assert.equal(statsMulti.platformUsage.week["Google Maps"], 1);
  assert.equal(statsMulti.platformUsage.month.Shopee, 1);
  assert.equal(statsMulti.platformUsage.month.Lazada, 1);
  assert.equal(statsMulti.platformUsage.month["Google Maps"], undefined); // Sep 29 is not in Oct

  // Analysis Activity for Month (Oct 1..31):
  // Oct 1 count: 1 (User 1 Lazada Analyzed)
  // Oct 2 count: 1 (User 1 Shopee Analyzed)
  const oct1Activity = statsMulti.analysisActivity.month.find((d) => d.date === "2026-10-01");
  const oct2Activity = statsMulti.analysisActivity.month.find((d) => d.date === "2026-10-02");
  assert.equal(oct1Activity.count, 1);
  assert.equal(oct2Activity.count, 1);
});
