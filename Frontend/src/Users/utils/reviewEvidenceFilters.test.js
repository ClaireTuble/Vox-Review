import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterReviewEvidenceEntries,
  getReviewIntegrityState,
} from './reviewEvidenceFilters.js';

const entries = [
  {
    id: 'sad-high-flagged',
    quote: { emotion: 'Sad', sourceReviewIndex: 5 },
    priority: { level: 'HIGH' },
    originalIndex: 0,
  },
  {
    id: 'sad-low-clear',
    quote: { emotion: 'Sad', sourceReviewIndex: 2 },
    priority: { level: 'LOW' },
    originalIndex: 1,
  },
  {
    id: 'happy-high-flagged',
    quote: { emotion: 'Happy', sourceReviewIndex: 3 },
    priority: { level: 'HIGH' },
    originalIndex: 2,
  },
  {
    id: 'sad-high-unable',
    quote: { emotion: 'Sad', sourceReviewIndex: 4 },
    priority: { level: 'HIGH' },
    originalIndex: 3,
  },
];

const integrityById = {
  'sad-high-flagged': { isPatternFlagged: true },
  'sad-low-clear': { isNoPatternDetected: true },
  'happy-high-flagged': { isExactDupe: true },
  'sad-high-unable': { isUnableToAssess: true },
};

const getIntegrity = (entry) => integrityById[entry.id];

test('emotion, priority, and integrity filters intersect and preserve independent selections', () => {
  const filters = { emotion: 'sad', priority: 'HIGH', integrity: 'flagged' };
  assert.deepEqual(
    filterReviewEvidenceEntries(entries, filters, getIntegrity).map(({ id }) => id),
    ['sad-high-flagged'],
  );
  assert.deepEqual(
    filterReviewEvidenceEntries(entries, { ...filters, integrity: 'unable' }, getIntegrity)
      .map(({ id }) => id),
    ['sad-high-unable'],
  );
  assert.deepEqual(
    filterReviewEvidenceEntries(entries, { emotion: 'sad' }, getIntegrity)
      .map(({ id }) => id),
    ['sad-high-flagged', 'sad-low-clear', 'sad-high-unable'],
  );
});

test('clearing filters restores all entries and unmatched combinations return empty results', () => {
  assert.deepEqual(
    filterReviewEvidenceEntries(entries, {}, getIntegrity),
    entries,
  );
  assert.deepEqual(
    filterReviewEvidenceEntries(
      entries,
      { emotion: 'fear', priority: 'CRITICAL', integrity: 'flagged' },
      getIntegrity,
    ),
    [],
  );
});

test('integrity state uses the source review index after non-substantive rows are removed', () => {
  const quote = {
    sourceReviewIndex: 5,
    suspiciousReviewLabel: 'Repeated Review',
  };
  const riaResults = Array.from({ length: 6 }, (_, reviewIndex) => ({
    reviewIndex,
    assessmentStatus: reviewIndex === 5
      ? 'Patterns Detected'
      : 'No Selected Patterns Detected',
    triggeredRules: reviewIndex === 5 ? [{ id: 'RIA-B', plainName: 'Repeated wording' }] : [],
  }));
  const duplicateResults = Array.from({ length: 6 }, (_, reviewIndex) => ({
    reviewIndex,
    label: reviewIndex === 5 ? 'Repeated Review' : 'Likely Authentic',
  }));

  const state = getReviewIntegrityState(
    0,
    quote,
    riaResults,
    true,
    { results: duplicateResults },
    true,
  );

  assert.equal(state.isPatternFlagged, true);
  assert.equal(state.isExactDupe, true);
  assert.deepEqual(state.triggeredRuleIds, ['RIA-B']);
});
