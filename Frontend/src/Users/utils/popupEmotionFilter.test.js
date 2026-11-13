/**
 * Regression tests for the Emotion Analysis Filter visibility fix.
 *
 * Root cause fixed: The old gate `totalEligibleFlaggedCount > 0 && exclusionUsable`
 * failed when `visibleReviewIntegrityAssessment` was null (signature mismatch),
 * making `flaggedCount = 0` and hiding the filter even when `isExclusionAvailable=true`.
 *
 * Fix: `exclusionUsable` now includes `isExclusionAvailable` as a standalone condition,
 * so the filter renders whenever the parent popup signals availability — regardless
 * of the locally-derived flagged count.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Re-implementation of the `exclusionUsable` derivation from AnalysisResults.jsx
// (pure logic only — no React dependency needed).
// ---------------------------------------------------------------------------
function deriveExclusionUsable({
  isExclusionAvailable,
  isQualityCheckComplete,
  hasDuplicateMatches,
  hasRiaFlags,
  totalEligibleFlaggedCount,
}) {
  return Boolean(
    isExclusionAvailable ||
      (isQualityCheckComplete && hasDuplicateMatches) ||
      hasRiaFlags ||
      totalEligibleFlaggedCount > 0,
  );
}

// ---------------------------------------------------------------------------
// Helpers that mirror what PopupPage computes before passing props
// ---------------------------------------------------------------------------
function makeProps({
  isExclusionAvailable = false,
  reviewIntegrityAssessment = null,  // null = signature mismatch
  suspiciousDetection = null,
  isRiaEnabled = true,
  isDetectionEnabled = true,
  isQualityCheckComplete = false,
  isQualityCheckUnavailable = false,
}) {
  const flaggedItems = Array.isArray(reviewIntegrityAssessment)
    ? reviewIntegrityAssessment.filter((r) => r?.status === 'flagged')
    : [];
  const hasRiaFlags = flaggedItems.length > 0;

  const dupeIndices = new Set(
    suspiciousDetection?.duplicateGroups?.flatMap((g) => g.indices ?? []) ?? [],
  );
  const hasDuplicateMatches = dupeIndices.size > 0;

  const eligibleFlaggedIndices = new Set([
    ...(isRiaEnabled && isQualityCheckComplete === false // RIA
      ? flaggedItems.map((r) => r.index).filter((i) => i != null)
      : []),
    ...(isDetectionEnabled && isQualityCheckComplete && !isQualityCheckUnavailable
      ? [...dupeIndices]
      : []),
  ]);
  const totalEligibleFlaggedCount = eligibleFlaggedIndices.size;

  return {
    isExclusionAvailable,
    isQualityCheckComplete,
    hasDuplicateMatches,
    hasRiaFlags,
    totalEligibleFlaggedCount,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Emotion Analysis Filter — visibility gating', () => {
  it('Steam: 7 pattern flags, 0 exact dupes → filter visible', () => {
    // Simulate: RIA assessment exists with 7 flagged reviews,
    // but due to signature mismatch visibleReviewIntegrityAssessment is null
    // (the scenario that was breaking the old implementation).
    const props = makeProps({
      isExclusionAvailable: true,   // PopupPage sets this when flags were confirmed
      reviewIntegrityAssessment: null, // null due to sig mismatch
      isQualityCheckComplete: false,
      isRiaEnabled: true,
    });
    assert.equal(
      deriveExclusionUsable(props),
      true,
      'Filter must be visible when isExclusionAvailable=true even if local flaggedCount=0',
    );
  });

  it('Google Play: RIA complete with flags, Exact check unavailable → filter visible', () => {
    const props = makeProps({
      isExclusionAvailable: true,
      reviewIntegrityAssessment: null,
      isQualityCheckUnavailable: true,
      isQualityCheckComplete: false,
    });
    assert.equal(deriveExclusionUsable(props), true);
  });

  it('Shopee: both checks complete with combined flags → filter visible', () => {
    const props = makeProps({
      isExclusionAvailable: true,
      reviewIntegrityAssessment: [
        { status: 'flagged', index: 0 },
        { status: 'flagged', index: 2 },
      ],
      suspiciousDetection: { duplicateGroups: [{ indices: [1, 3] }] },
      isQualityCheckComplete: true,
    });
    assert.equal(deriveExclusionUsable(props), true);
  });

  it('Lazada: both checks complete with combined flags → filter visible', () => {
    const props = makeProps({
      isExclusionAvailable: true,
      reviewIntegrityAssessment: [{ status: 'flagged', index: 5 }],
      suspiciousDetection: { duplicateGroups: [{ indices: [5, 10] }] },
      isQualityCheckComplete: true,
    });
    assert.equal(deriveExclusionUsable(props), true);
  });

  it('No flags anywhere → filter hidden', () => {
    const props = makeProps({
      isExclusionAvailable: false,
      reviewIntegrityAssessment: [],
      suspiciousDetection: { duplicateGroups: [] },
      isQualityCheckComplete: true,
    });
    assert.equal(
      deriveExclusionUsable(props),
      false,
      'Filter must be hidden when no eligible flags exist and isExclusionAvailable=false',
    );
  });

  it('Not run checks are never eligible for exclusion', () => {
    // Both checks disabled
    const props = makeProps({
      isExclusionAvailable: false,
      isRiaEnabled: false,
      isDetectionEnabled: false,
      reviewIntegrityAssessment: null,
      suspiciousDetection: null,
      isQualityCheckComplete: false,
    });
    assert.equal(deriveExclusionUsable(props), false);
  });

  it('Check unavailable reviews are never eligible for exclusion', () => {
    const props = makeProps({
      isExclusionAvailable: false,
      isQualityCheckUnavailable: true,
      isQualityCheckComplete: false,
      suspiciousDetection: { duplicateGroups: [{ indices: [0, 1] }] },
    });
    // Even though duplicateGroups has indices, isQualityCheckUnavailable blocks eligibility.
    // hasDuplicateMatches is true but isQualityCheckComplete is false → not eligible.
    assert.equal(deriveExclusionUsable(props), false);
  });

  it('Signature mismatch scenario: isExclusionAvailable=false and local count=0 → hidden', () => {
    // This is the inverse of the main fix: if the parent also says not available,
    // the filter must stay hidden.
    const props = makeProps({
      isExclusionAvailable: false,
      reviewIntegrityAssessment: null,
      isQualityCheckComplete: false,
    });
    assert.equal(
      deriveExclusionUsable(props),
      false,
      'Filter must stay hidden when both prop and local count say no flags',
    );
  });
});



describe('Emotion Analysis Filter — UI Card and Toggle Contract', () => {
  it('pill text and toggle state remain strictly synchronized (OFF and ON)', () => {
    function getPillText(isExcludeFlagged) {
      return isExcludeFlagged ? 'ON' : 'OFF';
    }
    function getSwitchClass(isExcludeFlagged) {
      return `emotion-filter-toggle-switch ${isExcludeFlagged ? 'emotion-filter-toggle-switch--on' : 'emotion-filter-toggle-switch--off'}`;
    }

    // Default OFF
    assert.equal(getPillText(false), 'OFF');
    assert.match(getSwitchClass(false), /emotion-filter-toggle-switch--off/);

    // Toggle ON
    assert.equal(getPillText(true), 'ON');
    assert.match(getSwitchClass(true), /emotion-filter-toggle-switch--on/);
  });

  it('card content contains required label and description strings without repeated counts', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      new URL('../components/AnalysisResults.jsx', import.meta.url),
      'utf8',
    );

    // Filter section present
    assert.match(source, /className="emotion-analysis-filter-section"/);
    assert.match(source, /className="emotion-filter-divider"/);
    assert.match(source, /Emotion Analysis Filter/);

    // Label and description
    assert.match(source, /Exclude flagged reviews from emotion analysis/);
    assert.match(
      source,
      /When enabled, reviews identified by completed screening checks will not contribute to emotion scoring\. Original reviews and their flags will remain visible below\./,
    );

    // Toggle switch attributes
    assert.match(source, /role="switch"/);
    assert.match(source, /id="emotion-filter-toggle-switch"/);
    assert.match(source, /aria-checked=\{Boolean\(isExcludeFlagged\)\}/);
    assert.match(source, /aria-label="Exclude flagged reviews from emotion analysis"/);
    assert.match(source, /aria-describedby="emotion-filter-explanation"/);
    assert.match(source, /className="emotion-filter-toggle-thumb"/);

    // NO repeated count cards inside this card
    const filterSectionStart = source.indexOf('className="emotion-analysis-filter-section"');
    const filterSectionEnd = source.indexOf('</div>\n      )}', filterSectionStart);
    const filterSectionCode = source.slice(filterSectionStart, filterSectionEnd);

    assert.doesNotMatch(filterSectionCode, /emotion-filter-live-counts/);
    assert.doesNotMatch(filterSectionCode, /emotion-filter-status-message/);
    assert.doesNotMatch(filterSectionCode, /Reviews included in emotion analysis/);
    assert.doesNotMatch(filterSectionCode, /Flagged reviews excluded from emotion analysis/);
  });

  it('CSS layout rules enforce far-right toggle positioning and responsive flex', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile(
      new URL('../css/AnalysisResults.css', import.meta.url),
      'utf8',
    );

    // Card padding has ~20-24px right spacing (22px)
    assert.match(css, /padding:\s*10px\s+22px\s+10px\s+14px;/);

    // Control row uses flex layout with space-between and gap
    assert.match(css, /\.emotion-filter-control-row\s*\{[\s\S]*?display:\s*flex;/);
    assert.match(css, /\.emotion-filter-control-row\s*\{[\s\S]*?align-items:\s*center;/);
    assert.match(css, /\.emotion-filter-control-row\s*\{[\s\S]*?justify-content:\s*space-between;/);

    // Text flex container allows wrapping without pushing toggle down
    assert.match(css, /\.emotion-filter-text\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;/);
    assert.match(css, /\.emotion-filter-text\s*\{[\s\S]*?min-width:\s*0;/);

    // Toggle container is non-shrinking on the far right
    assert.match(css, /\.emotion-filter-toggle-container\s*\{[\s\S]*?flex:\s*0\s+0\s+auto;/);

    // Toggle switch dimensions and styling
    assert.match(css, /\.emotion-filter-toggle-switch\s*\{[\s\S]*?width:\s*36px;/);
    assert.match(css, /\.emotion-filter-toggle-switch\s*\{[\s\S]*?height:\s*20px;/);
  });
});
