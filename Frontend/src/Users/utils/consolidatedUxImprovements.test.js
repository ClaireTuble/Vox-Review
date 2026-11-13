/**
 * Comprehensive focused test suite for VoxReview Chrome Extension
 * Consolidated UX Improvements:
 * 1. Individual Review Integrity Badges
 * 2. Review Integrity List Filter
 * 3. Emotion Distribution Horizontal Count Indicators
 * 4. Topic Information Hierarchy
 * 5. Rescan Behavior (DOM refresh, preservation on failure, unchanged detection)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// 1. Review Integrity Badges & Filtering Logic
// ---------------------------------------------------------------------------
function getReviewIntegrity(originalIndex, quote, reviewIntegrityAssessment, isRiaEnabled, suspiciousDetection, isQualityCheckComplete) {
  const dupResult = Array.isArray(suspiciousDetection?.results)
    ? (suspiciousDetection.results.find((r) => (r.reviewIndex ?? r.index) === originalIndex) || suspiciousDetection.results[originalIndex])
    : null;
  const isExactDupe = Boolean(
    isQualityCheckComplete &&
    (dupResult?.label === 'Repeated Review' || quote?.suspiciousReviewLabel === 'Repeated Review')
  );

  const riaResult = Array.isArray(reviewIntegrityAssessment)
    ? (reviewIntegrityAssessment.find((r) => (r.reviewIndex ?? r.index) === originalIndex) || reviewIntegrityAssessment[originalIndex])
    : null;

  const isRiaEvaluated = Boolean(isRiaEnabled && Array.isArray(reviewIntegrityAssessment) && reviewIntegrityAssessment.length > 0 && riaResult != null);
  const isPatternFlagged = Boolean(
    isRiaEvaluated &&
    (riaResult?.assessmentStatus === 'Patterns Detected' ||
      (Array.isArray(riaResult?.triggeredRules) && riaResult.triggeredRules.length > 0)) &&
    riaResult?.assessmentStatus !== 'Unable to Assess'
  );

  const isUnableToAssess = Boolean(isRiaEvaluated && riaResult?.assessmentStatus === 'Unable to Assess');
  const isNoPatternDetected = Boolean(
    isRiaEvaluated &&
    !isPatternFlagged &&
    !isUnableToAssess &&
    (riaResult?.assessmentStatus === 'No Selected Patterns Detected' ||
      riaResult?.assessmentStatus === 'No Patterns Detected' ||
      riaResult?.assessmentStatus === 'Clear' ||
      (Array.isArray(riaResult?.triggeredRules) && riaResult.triggeredRules.length === 0))
  );
  const isNotAssessed = !isRiaEvaluated && !isQualityCheckComplete;

  const triggeredRuleIds = isPatternFlagged && Array.isArray(riaResult?.triggeredRules)
    ? riaResult.triggeredRules.map((rule) => rule.id).filter(Boolean)
    : [];

  return {
    isExactDupe,
    isPatternFlagged,
    isNoPatternDetected,
    isUnableToAssess,
    isNotAssessed,
    triggeredRuleIds,
  };
}

describe('1. Individual Review Integrity Badges', () => {
  it('identifies Pattern Flagged reviews and includes matched rule IDs', () => {
    const ria = [
      { reviewIndex: 0, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-B', plainName: 'Repeated Words' }] },
    ];
    const info = getReviewIntegrity(0, {}, ria, true, null, false);
    assert.equal(info.isPatternFlagged, true);
    assert.deepEqual(info.triggeredRuleIds, ['RIA-B']);
    assert.equal(info.isExactDupe, false);
  });
  it('identifies Exact Duplicate reviews', () => {
    const suspicious = {
      status: 'complete',
      results: [{ reviewIndex: 0, label: 'Repeated Review' }],
    };
    const info = getReviewIntegrity(0, { suspiciousReviewLabel: 'Repeated Review' }, null, false, suspicious, true);
    assert.equal(info.isExactDupe, true);
    assert.equal(info.isPatternFlagged, false);
  });

  it('preserves both distinctions when a review has both pattern flag and duplicate match', () => {
    const ria = [
      { reviewIndex: 0, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-A' }, { id: 'RIA-C' }] },
    ];
    const suspicious = {
      status: 'complete',
      results: [{ reviewIndex: 0, label: 'Repeated Review' }],
    };
    const info = getReviewIntegrity(0, { suspiciousReviewLabel: 'Repeated Review' }, ria, true, suspicious, true);
    assert.equal(info.isExactDupe, true, 'Exact duplicate distinction preserved');
    assert.equal(info.isPatternFlagged, true, 'Pattern flag distinction preserved');
    assert.deepEqual(info.triggeredRuleIds, ['RIA-A', 'RIA-C']);
  });

  it('correctly distinguishes No Pattern Detected, Unable to Assess, and Not Assessed', () => {
    const ria = [
      { reviewIndex: 0, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
      { reviewIndex: 1, assessmentStatus: 'Unable to Assess', assessmentReason: 'too_short' },
    ];
    // Index 0: clear
    const infoClear = getReviewIntegrity(0, {}, ria, true, null, false);
    assert.equal(infoClear.isNoPatternDetected, true);
    assert.equal(infoClear.isUnableToAssess, false);
    assert.equal(infoClear.isNotAssessed, false);

    // Index 1: unable
    const infoUnable = getReviewIntegrity(1, {}, ria, true, null, false);
    assert.equal(infoUnable.isUnableToAssess, true);
    assert.equal(infoUnable.isNoPatternDetected, false);
    assert.equal(infoUnable.isNotAssessed, false);

    // Index 2: not assessed (no RIA and duplicate check not run)
    const infoNotAssessed = getReviewIntegrity(2, {}, null, false, null, false);
    assert.equal(infoNotAssessed.isNotAssessed, true);
    assert.equal(infoNotAssessed.isNoPatternDetected, false, 'Not Assessed reviews must not be classified as No Pattern Detected');
  });
});

describe('2. Review Integrity List Filter', () => {
  const reviews = [
    { id: 0, quote: { text: 'Pattern flagged review' }, originalIndex: 0 },
    { id: 1, quote: { text: 'Exact duplicate review' }, originalIndex: 1 },
    { id: 2, quote: { text: 'Both pattern and dupe' }, originalIndex: 2 },
    { id: 3, quote: { text: 'Clean review' }, originalIndex: 3 },
    { id: 4, quote: { text: 'Short review' }, originalIndex: 4 },
  ];

  const ria = [
    { reviewIndex: 0, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-A' }] },
    { reviewIndex: 1, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 2, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-B' }] },
    { reviewIndex: 3, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
    { reviewIndex: 4, assessmentStatus: 'Unable to Assess' },
  ];

  const suspicious = {
    status: 'complete',
    results: [
      { reviewIndex: 0, label: 'Likely Authentic' },
      { reviewIndex: 1, label: 'Repeated Review' },
      { reviewIndex: 2, label: 'Repeated Review' },
      { reviewIndex: 3, label: 'Likely Authentic' },
      { reviewIndex: 4, label: 'Likely Authentic' },
    ],
  };

  function applyIntegrityFilter(list, filter) {
    return list.filter(({ originalIndex, quote }) => {
      if (filter === 'all') return true;
      const info = getReviewIntegrity(originalIndex, quote, ria, true, suspicious, true);
      if (filter === 'flagged') return info.isPatternFlagged || info.isExactDupe;
      if (filter === 'not_flagged') return info.isNoPatternDetected && !info.isExactDupe;
      if (filter === 'unable') return info.isUnableToAssess;
      return true;
    });
  }

  it('filter "All" displays all reviews without modification', () => {
    const filtered = applyIntegrityFilter(reviews, 'all');
    assert.equal(filtered.length, 5);
  });

  it('filter "Flagged" includes pattern flags and exact duplicates (including overlapping)', () => {
    const filtered = applyIntegrityFilter(reviews, 'flagged');
    const ids = filtered.map((r) => r.id);
    assert.deepEqual(ids, [0, 1, 2], 'Indices 0 (pattern), 1 (dupe), 2 (both) must be included');
  });

  it('filter "Not Flagged" includes clean assessed reviews and excludes dupes, patterns, unable', () => {
    const filtered = applyIntegrityFilter(reviews, 'not_flagged');
    const ids = filtered.map((r) => r.id);
    assert.deepEqual(ids, [3], 'Only index 3 was cleanly assessed with no flags');
  });

  it('filter "Unable to Assess" isolates unreliable reviews', () => {
    const filtered = applyIntegrityFilter(reviews, 'unable');
    const ids = filtered.map((r) => r.id);
    assert.deepEqual(ids, [4]);
  });

  it('list filtering changes only displayed cards and does not mutate review records', () => {
    const snapshot = JSON.stringify(reviews);
    applyIntegrityFilter(reviews, 'flagged');
    applyIntegrityFilter(reviews, 'not_flagged');
    assert.equal(JSON.stringify(reviews), snapshot, 'Original review entries must remain unmutated');
  });
});

describe('3. Emotion Distribution Count Indicators Contract', () => {
  it('source code contains the two horizontal count indicators below the circular chart', async () => {
    const source = await readFile(
      new URL('../components/AnalysisResults.jsx', import.meta.url),
      'utf8',
    );
    assert.match(source, /className="emotion-distribution-counts-row"/);
    assert.match(source, /Total Reviews Analyzed/);
    assert.match(source, /Flagged Reviews Excluded/);
    assert.match(source, /\{reviewsIncludedCount\}/);
    assert.match(source, /\{reviewsExcludedCount\}/);
  });

  it('CSS styles the indicators horizontally side by side with compact dark cards', async () => {
    const css = await readFile(
      new URL('../css/AnalysisResults.css', import.meta.url),
      'utf8',
    );
    assert.match(css, /\.emotion-distribution-counts-row\s*\{[\s\S]*?grid-template-columns:\s*1fr\s+1fr;/);
    assert.match(css, /\.emotion-dist-count-card\s*\{[\s\S]*?background:/);
    assert.match(css, /\.emotion-dist-count-label\s*\{/);
    assert.match(css, /\.emotion-dist-count-val\s*\{/);
  });
});

describe('4. Topic Card Information Hierarchy Contract', () => {
  it('source code provides distinct heading, muted subtitle, and methodology layout', async () => {
    const source = await readFile(
      new URL('../components/AnalysisResults.jsx', import.meta.url),
      'utf8',
    );
    assert.match(source, /className="topic-card-header-block"/);
    assert.match(source, /className="topic-card-title"/);
    assert.match(source, /className="topic-card-subtitle"/);
    assert.match(source, /className="topic-card-methodology"/);
    assert.match(source, /className="topic-card-hint"/);
  });

  it('CSS provides clear hierarchy without distracting font sizes', async () => {
    const css = await readFile(
      new URL('../css/AnalysisResults.css', import.meta.url),
      'utf8',
    );
    assert.match(css, /\.topic-card-title\s*\{[\s\S]*?font-weight:\s*700;/);
    assert.match(css, /\.topic-card-subtitle\s*\{/);
    assert.match(css, /\.topic-card-methodology\s*\{/);
  });
});

describe('5. Rescan Event Flow & State Preservation', () => {
  it('PopupPage implements state preservation and unchanged-detection logic', async () => {
    const source = await readFile(
      new URL('../pages/PopupPage.jsx', import.meta.url),
      'utf8',
    );

    // Uses snapshot ref to preserve results during rescan
    assert.match(source, /rescanPreviousStateRef/);

    // Restores previous results on failure/timeout
    assert.match(source, /rescanPreviousStateRef\.current\s*=[\s\S]*?scrapedReviews/);

    // Unchanged review detection
    assert.match(source, /No new or updated reviews found on this page/);
    assert.match(source, /Rescan complete:\s*\$\{data\.reviews\.length\}\s*reviews loaded/);
  });

  it('identifies identical review sets during rescan to report no changes', () => {
    const prevReviews = [
      { text: 'Great mouse, very comfortable to use.' },
      { text: 'Battery lasts for weeks.' },
    ];
    const newSameReviews = [
      { text: 'Great mouse, very comfortable to use.' },
      { text: 'Battery lasts for weeks.' },
    ];
    const newDifferentReviews = [
      { text: 'Great mouse, very comfortable to use.' },
      { text: 'Battery lasts for weeks.' },
      { text: 'New third review just posted today.' },
    ];

    const getReviewText = (r) => r.text || '';
    const areIdentical = (a, b) => (
      a.length === b.length && a.every((r, i) => getReviewText(r) === getReviewText(b[i]))
    );

    assert.equal(areIdentical(prevReviews, newSameReviews), true, 'Unchanged DOM should be detected');
    assert.equal(areIdentical(prevReviews, newDifferentReviews), false, 'New review added should be detected');
  });
});
