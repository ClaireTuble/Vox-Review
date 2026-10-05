import assert from 'node:assert/strict';
import test from 'node:test';
import { getActivityDeduplicationKey } from './userActivityController.js';

const base = {
  userId: 'user-1',
  platform: 'Steam',
  productUrl: 'https://store.steampowered.com/app/570/Dota_2/',
  productTitle: 'Dota 2',
};

test('Used keeps the existing product-based deduplication key', () => {
  const key = getActivityDeduplicationKey({ ...base, activityType: 'Used' });
  assert.equal(key, `user-1:Steam:Used:url:${base.productUrl}`);
});

test('Analyzed deduplicates retries of one run but permits a new Rescan run', () => {
  const firstRun = getActivityDeduplicationKey({ ...base, activityType: 'Analyzed', analysisRunId: 'run-1' });
  const retry = getActivityDeduplicationKey({ ...base, activityType: 'Analyzed', analysisRunId: 'run-1' });
  const rescan = getActivityDeduplicationKey({ ...base, activityType: 'Analyzed', analysisRunId: 'run-2' });

  assert.equal(firstRun, retry);
  assert.notEqual(firstRun, rescan);
});

test('Analyzed without a run ID retains legacy product-based deduplication', () => {
  const key = getActivityDeduplicationKey({ ...base, activityType: 'Analyzed' });
  assert.equal(key, `user-1:Steam:Analyzed:url:${base.productUrl}`);
});
