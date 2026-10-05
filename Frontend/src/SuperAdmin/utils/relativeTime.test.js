import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRelativeTime } from './relativeTime.js';

const NOW = Date.UTC(2026, 9, 1, 12);
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(milliseconds) {
  return formatRelativeTime(NOW - milliseconds, NOW);
}

test('formats seconds and recent timestamps as Just now', () => {
  assert.equal(ago(0), 'Just now');
  assert.equal(ago(59 * 1000), 'Just now');
});

test('formats one and multiple minutes with correct grammar', () => {
  assert.equal(ago(MINUTE), '1 min ago');
  assert.equal(ago(2 * MINUTE), '2 mins ago');
  assert.equal(ago(59 * MINUTE), '59 mins ago');
});

test('formats one and multiple hours with correct grammar', () => {
  assert.equal(ago(HOUR), '1 hour ago');
  assert.equal(ago(2 * HOUR), '2 hours ago');
  assert.equal(ago(23 * HOUR), '23 hours ago');
});

test('formats one and multiple days with correct grammar', () => {
  assert.equal(ago(DAY), '1 day ago');
  assert.equal(ago(2 * DAY), '2 days ago');
  assert.equal(ago(6 * DAY), '6 days ago');
});

test('formats weeks and months with singular and plural forms', () => {
  assert.equal(ago(7 * DAY), '1 week ago');
  assert.equal(ago(14 * DAY), '2 weeks ago');
  assert.equal(ago(21 * DAY), '3 weeks ago');
  assert.equal(ago(30 * DAY), '1 month ago');
  assert.equal(ago(60 * DAY), '2 months ago');
  assert.equal(ago(90 * DAY), '3 months ago');
});

test('formats future timestamps as Just now and invalid dates safely', () => {
  assert.equal(formatRelativeTime(NOW + MINUTE, NOW), 'Just now');
  assert.equal(formatRelativeTime('not-a-date', NOW), '—');
});