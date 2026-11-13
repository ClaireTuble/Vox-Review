import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { isValidEmotionAnalysisData } from '../utils/emotionResultDisplay.js';

const analysisResultsSource = await readFile(
  new URL('./AnalysisResults.jsx', import.meta.url),
  'utf8',
);

const popupPageSource = await readFile(
  new URL('../pages/PopupPage.jsx', import.meta.url),
  'utf8',
);

const analysisResultsCss = await readFile(
  new URL('../css/AnalysisResults.css', import.meta.url),
  'utf8',
);

function validEmotionData(totalReviews = 0, additionalData = {}) {
  const categories = [
    ['happy', 'Happy', '😊'],
    ['sad', 'Sad', '😢'],
    ['anger', 'Anger', '😠'],
    ['disgust', 'Disgust', '🤢'],
    ['fear', 'Fear', '😨'],
    ['sarcastic', 'Sarcastic', '😒'],
  ];
  const emotions = categories.map(([id, label, emoji], index) => ({
    id,
    category: index + 1,
    label,
    emoji,
    count: index === 0 ? totalReviews : 0,
    percentage: index === 0 && totalReviews > 0 ? 100 : 0,
  }));
  return {
    totalReviews,
    dominantEmotion: totalReviews > 0
      ? { label: 'Happy', emoji: '😊', percentage: 100 }
      : { label: 'No included reviews', emoji: '—', percentage: 0 },
    emotions,
    quotes: Array.from({ length: totalReviews }, (_, index) => ({
      id: index + 1,
      emotion: 'Happy',
      text: `Review ${index + 1}`,
    })),
    drivers: [],
    skippedReviews: [],
    ...additionalData,
  };
}

function emotionDataWithCounts(counts, dominantLabel) {
  const totalReviews = counts.reduce((total, count) => total + count, 0);
  const data = validEmotionData(totalReviews);
  data.emotions.forEach((emotion, index) => {
    emotion.count = counts[index];
    emotion.percentage = totalReviews
      ? Math.floor((counts[index] / totalReviews) * 100 + 0.5)
      : 0;
  });
  const dominantEmotion = data.emotions.find((emotion) => emotion.label === dominantLabel);
  data.dominantEmotion = {
    label: dominantLabel,
    emoji: dominantEmotion?.emoji || '—',
    percentage: dominantEmotion?.percentage ?? 0,
  };
  return data;
}

test('Flagged Reviews options keep the main exclusion filter and render no closed panel', async () => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { default: AnalysisResults } = await vite.ssrLoadModule('/src/Users/components/AnalysisResults.jsx');
    const html = renderToStaticMarkup(React.createElement(AnalysisResults, {
      status: 'completed',
      isExclusionAvailable: true,
      emotionData: validEmotionData(2),
      reviewIntegrityEnabled: true,
      reviewIntegrityAssessment: [
        { reviewIndex: 0, assessmentStatus: 'Patterns Detected', triggeredRules: [{ id: 'RIA-B', plainName: 'Repeated Words & Phrases', explanation: 'Actual reason.' }] },
        { reviewIndex: 1, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
      ],
    }));
    const verdictPosition = html.indexOf('class="checks-verdict-banner');
    const filterStart = html.indexOf('class="emotion-analysis-filter-section"');
    const toolbarStart = html.indexOf('class="checks-options-toolbar"');
    const filter = html.slice(filterStart, toolbarStart);
    const toolbarEnd = html.indexOf('</section>', toolbarStart);
    const toolbar = html.slice(toolbarStart, toolbarEnd);

    assert.ok(filterStart >= 0);
    assert.ok(verdictPosition >= 0 && verdictPosition < filterStart);
    assert.ok(toolbarStart > filterStart);
    assert.match(html, /Patterns Flagged/);
    assert.match(html, /Caution/);
    assert.match(html, /Pattern Flags<\/span><span class="checks-metric-val text-amber">1/);
    assert.match(filter, /Exclude flagged reviews from emotion analysis/);
    assert.match(filter, /role="switch"/);
    assert.match(html, /aria-label="Review Integrity options and view"/);
    assert.doesNotMatch(html, /class="flagged-reviews-view"/);
    assert.doesNotMatch(html, /class="ria-config-list"/);
    assert.doesNotMatch(toolbar, /Exclude flagged reviews from emotion analysis/);

    const clearHtml = renderToStaticMarkup(React.createElement(AnalysisResults, {
      status: 'completed',
      isExclusionAvailable: true,
      emotionData: validEmotionData(1),
      reviewIntegrityEnabled: true,
      reviewIntegrityAssessment: [
        { reviewIndex: 0, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
      ],
    }));
    assert.match(clearHtml, /No Patterns Detected/);
    assert.match(clearHtml, /class="checks-verdict-badge">Clear/);
    assert.match(clearHtml, /Pattern Flags<\/span><span class="checks-metric-val text-emerald">0/);
  } finally {
    await vite.close();
  }
});

test('Topic Analysis explains multi-label percentages and unassigned reviews', () => {
  assert.match(analysisResultsSource, /share of reviews in the current topic view assigned to each topic/);
  assert.match(analysisResultsSource, /percentages may exceed 100%/);
  assert.match(analysisResultsSource, /No clear topic detected in the full analysis/);
  assert.match(analysisResultsSource, /reviewsWithoutTopics/);
});

test('AI Insights filters share one AND-based result pipeline and expose a working reset', () => {
  const filterBlock = analysisResultsSource.slice(
    analysisResultsSource.indexOf('filterReviewEvidenceEntries('),
    analysisResultsSource.indexOf('const hasActiveReviewFilters'),
  );
  assert.match(filterBlock, /emotion: selectedQuoteFilter/);
  assert.match(filterBlock, /priority: selectedPriorityFilter/);
  assert.match(filterBlock, /integrity: selectedIntegrityFilter/);
  assert.match(analysisResultsSource, /onChange=\{\(event\) => setSelectedPriorityFilter\(event\.target\.value\)\}/);
  assert.match(analysisResultsSource, /onChange=\{\(event\) => setSelectedIntegrityFilter\(event\.target\.value\)\}/);
  assert.match(analysisResultsSource, /setSelectedQuoteFilter\('all'\)/);
  assert.match(analysisResultsSource, /setSelectedPriorityFilter\('all'\)/);
  assert.match(analysisResultsSource, /setSelectedIntegrityFilter\('all'\)/);
  assert.match(analysisResultsSource, /setSelectedEmotion\(null\)/);
  assert.match(analysisResultsSource, /aria-label="Clear all review filters"/);
  assert.match(analysisResultsSource, /disabled=\{!hasActiveReviewFilters\}/);
  assert.match(analysisResultsSource, /Showing \{integrityFilteredEntries\.length\} of \{quoteEntries\.length\} reviews/);
  assert.match(analysisResultsCss, /\.review-filter-reset\s*\{[^}]*var\(--bg-stage\)[^}]*var\(--text-primary\)/);
  assert.match(popupPageSource, /sourceReviewIndex:\s*validReviewIndexes\[index\]/);
});

test('Exact Repeated-Text Check: one card after analysis, not two', () => {
  // PopupPage suppresses the pre-analysis card once analysisStatus is 'completed'
  assert.match(popupPageSource, /analysisStatus !== 'completed'/);
});

test('Flagged Reviews view shows only active records and all actual explanations', async () => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    plugins: [{
      name: 'open-flagged-reviews-for-render-test',
      enforce: 'pre',
      transform(source, id) {
        if (id.endsWith('/AnalysisResults.jsx')) {
          return source
            .replace(
              'const [activeReviewPanel, setActiveReviewPanel] = useState(null);',
              "const [activeReviewPanel, setActiveReviewPanel] = useState('flagged');",
            )
            .replace(
              'const [expandedFlaggedReviews, setExpandedFlaggedReviews] = useState({});',
              'const [expandedFlaggedReviews, setExpandedFlaggedReviews] = useState({ 0: true });',
            )
            .replace(
              'const [expandableFlaggedComments, setExpandableFlaggedComments] = useState({});',
              "const [expandableFlaggedComments, setExpandableFlaggedComments] = useState({ 'flagged-0': true });",
            );
        }
        return source;
      },
    }],
  });

  try {
    const { default: AnalysisResults } = await vite.ssrLoadModule('/src/Users/components/AnalysisResults.jsx');
    const html = renderToStaticMarkup(React.createElement(AnalysisResults, {
      status: 'completed',
      repeatedTextCheckEnabled: true,
      reviewIntegrityEnabled: true,
      scrapedReviews: [
        { text: 'Actual flagged review comment with enough detail to continue across several lines and demonstrate that the comment can be expanded without opening the integrity explanation panel. '.repeat(3) },
        { text: 'Unflagged review comment.' },
        { text: 'Unassessed review comment.' },
      ],
      isExclusionAvailable: true,
      emotionData: validEmotionData(3, {
        quotes: [
          { sourceReviewIndex: 1, text: 'Unflagged review comment.' },
          { sourceReviewIndex: 0, text: 'Actual flagged review comment with enough detail to continue across several lines and demonstrate that the comment can be expanded without opening the integrity explanation panel. '.repeat(3) },
          { sourceReviewIndex: 2, text: 'Unassessed review comment.' },
        ],
      }),
      reviewIntegrityAssessment: [
        {
          reviewIndex: 0,
          assessmentStatus: 'Patterns Detected',
          triggeredRules: [
            { id: 'RIA-B', plainName: 'Repeated Words & Phrases', explanation: 'First actual explanation.' },
            { id: 'RIA-C', plainName: 'Character Repetition', explanation: 'Second actual explanation.' },
          ],
        },
        { reviewIndex: 1, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
        {
          reviewIndex: 2,
          assessmentStatus: 'Unable to Assess',
          assessmentReason: 'missing_text',
          triggeredRules: [],
        },
      ],
    }));
    const flaggedStart = html.indexOf('id="flagged-reviews-region"');
    const flaggedEnd = html.indexOf('class="productivity-action-bar"', flaggedStart);
    const flaggedHtml = html.slice(flaggedStart, flaggedEnd);

    assert.ok(flaggedStart >= 0);
    assert.match(flaggedHtml, /Flagged Reviews \(1\)/);
    assert.match(flaggedHtml, /Comment #1/);
    assert.match(flaggedHtml, /class="review-expansion-control" aria-expanded="false">View more/);
    assert.match(analysisResultsSource, /lessLabel="View less"/);
    assert.match(flaggedHtml, /quote-text flagged-review-comment quote-text--collapsed/);
    assert.match(flaggedHtml, /Repeated Words &amp; Phrases/);
    assert.match(flaggedHtml, /RIA-B/);
    assert.match(flaggedHtml, /Character Repetition/);
    assert.match(flaggedHtml, /RIA-C/);
    assert.match(flaggedHtml, /First actual explanation\./);
    assert.match(flaggedHtml, /Second actual explanation\./);
    assert.match(flaggedHtml, /Actual flagged review comment with enough detail/);
    assert.doesNotMatch(flaggedHtml, /Review 2/);
    assert.doesNotMatch(flaggedHtml, /Review 3/);
    assert.doesNotMatch(flaggedHtml, /Unflagged review comment/);
    assert.doesNotMatch(flaggedHtml, /Unassessed review comment/);
    assert.doesNotMatch(flaggedHtml, /class="ria-config-list"/);
  } finally {
    await vite.close();
  }
});

test('disabled repeated-text checks do not apply stale duplicate results to review evidence', async () => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { default: AnalysisResults } = await vite.ssrLoadModule('/src/Users/components/AnalysisResults.jsx');
    const html = renderToStaticMarkup(React.createElement(AnalysisResults, {
      status: 'completed',
      repeatedTextCheckEnabled: false,
      reviewIntegrityEnabled: false,
      emotionData: validEmotionData(2, {
        suspiciousReviewDetection: {
          status: 'complete',
          evaluatedCount: 2,
          flaggedCount: 1,
          includedCount: 2,
          filteringApplied: false,
          results: [
            { reviewIndex: 0, label: 'Repeated Review' },
            { reviewIndex: 1, label: 'Likely Authentic' },
          ],
        },
      }),
    }));

    assert.doesNotMatch(html, /check-status-val/);
    assert.doesNotMatch(html, /review-integrity-badge--duplicate/);
  } finally {
    await vite.close();
  }
});

test('popup analysis keeps the main exclusion filter available for eligible Review Integrity flags', async () => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { default: AnalysisResults } = await vite.ssrLoadModule('/src/Users/components/AnalysisResults.jsx');
    const reviewIntegrityAssessment = Array.from({ length: 29 }, (_, reviewIndex) => ({
      reviewIndex,
      assessmentStatus: reviewIndex < 7 ? 'Patterns Detected' : 'No Selected Patterns Detected',
      triggeredRules: reviewIndex < 7
        ? [{ id: 'RIA-B', plainName: 'Repeated Words & Phrases', explanation: 'Repeated wording.' }]
        : [],
    }));
    const emotionData = validEmotionData(29, {
      analyzedReviewCount: 29,
      suspiciousReviewDetection: {
        status: 'complete',
        evaluatedCount: 29,
        flaggedCount: 0,
        includedCount: 29,
        filteringApplied: false,
      },
    });

    for (const platform of ['steam', 'googleplay', 'shopee', 'lazada']) {
      const html = renderToStaticMarkup(React.createElement(AnalysisResults, {
        status: 'completed',
        platform,
        repeatedTextCheckEnabled: true,
        isExclusionAvailable: true,
        emotionData,
        reviewIntegrityAssessment,
        reviewIntegrityEnabled: true,
        scrapedReviews: Array.from({ length: 29 }, (_, index) => ({ text: `Review ${index + 1}` })),
      }));
      const filterStart = html.indexOf('class="emotion-analysis-filter-section"');
      const toolbarPosition = html.indexOf('class="checks-options-toolbar"');
      const filterSection = html.slice(filterStart, html.indexOf('</div></section>', filterStart));

      assert.notEqual(filterStart, -1, `${platform}: filter section should render`);
      assert.ok(filterStart < toolbarPosition, `${platform}: main filter should precede options`);
      assert.match(filterSection, /Exclude flagged reviews from emotion analysis/);
      assert.match(filterSection, /Reviews included in emotion analysis/);
      assert.match(filterSection, /<span class="emotion-count-val">29<\/span>/);
      assert.match(filterSection, /Flagged reviews excluded from emotion analysis/);
      assert.match(filterSection, /<span class="emotion-count-val[^"]*">0<\/span>/);
      assert.match(filterSection, /Original reviews will remain visible/);
      assert.match(html, /class="checks-options-toolbar"/);
      assert.match(html, /Checked<\/span><span class="checks-metric-val">29/);
      assert.match(html, /Exact Dupes<\/span><span class="checks-metric-val text-emerald">0/);
      assert.match(html, /Pattern Flags<\/span><span class="checks-metric-val text-amber">7/);
    }
  } finally {
    await vite.close();
  }
});

test('completed analyses without valid emotion results show unavailable state, never sample data', async () => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { default: AnalysisResults } = await vite.ssrLoadModule('/src/Users/components/AnalysisResults.jsx');
    const cases = [
      ['null emotion data', null],
      ['missing emotion data', undefined],
      ['malformed emotion data', { totalReviews: 1420, emotions: [], quotes: null }],
      ['inconsistent count percentage', {
        ...emotionDataWithCounts([2, 1, 0, 0, 0, 0], 'Happy'),
        emotions: emotionDataWithCounts([2, 1, 0, 0, 0, 0], 'Happy').emotions.map((emotion) => (
          emotion.label === 'Happy' ? { ...emotion, percentage: 50 } : emotion
        )),
      }],
    ];

    for (const [label, emotionData] of cases) {
      const props = { status: 'completed' };
      if (label !== 'missing emotion data') props.emotionData = emotionData;
      const html = renderToStaticMarkup(React.createElement(AnalysisResults, props));
      assert.match(html, /AI Emotion Analysis Engine/, label);
      assert.match(html, /Emotion results unavailable/, label);
      assert.doesNotMatch(html, /1420|Battery easily lasts 30\+ hours|Microphone is terrible/, label);
    }

    const zeroResultsHtml = renderToStaticMarkup(React.createElement(AnalysisResults, {
      status: 'completed',
      emotionData: validEmotionData(),
    }));
    assert.doesNotMatch(zeroResultsHtml, /Emotion results unavailable/);
    assert.match(zeroResultsHtml, /No included reviews/);
    assert.doesNotMatch(zeroResultsHtml, /1420|Battery easily lasts 30\+ hours/);
  } finally {
    await vite.close();
  }
});

test('emotion summary validation enforces count percentages and dominant-label consistency', () => {
  const inconsistentTotal = emotionDataWithCounts([2, 1, 0, 0, 0, 0], 'Happy');
  inconsistentTotal.totalReviews = 4;
  assert.equal(isValidEmotionAnalysisData(inconsistentTotal), false);

  const inconsistentPercentage = emotionDataWithCounts([2, 1, 0, 0, 0, 0], 'Happy');
  inconsistentPercentage.emotions[0].percentage = 50;
  assert.equal(isValidEmotionAnalysisData(inconsistentPercentage), false);

  const inconsistentDominantLabel = emotionDataWithCounts([2, 1, 0, 0, 0, 0], 'Sad');
  assert.equal(isValidEmotionAnalysisData(inconsistentDominantLabel), false);

  const inconsistentDominantPercentage = emotionDataWithCounts([2, 1, 0, 0, 0, 0], 'Happy');
  inconsistentDominantPercentage.dominantEmotion.percentage = 50;
  assert.equal(isValidEmotionAnalysisData(inconsistentDominantPercentage), false);
});

test('emotion summary validation accepts tied dominant classes and half-up rounding boundaries', () => {
  const tiedDominantSummary = emotionDataWithCounts([2, 2, 0, 0, 0, 0], 'Happy');
  assert.equal(isValidEmotionAnalysisData(tiedDominantSummary), true);

  const otherValidTiedDominantSummary = emotionDataWithCounts([2, 2, 0, 0, 0, 0], 'Sad');
  assert.equal(isValidEmotionAnalysisData(otherValidTiedDominantSummary), true);

  const roundedBoundarySummary = emotionDataWithCounts([1, 1, 1, 1, 1, 3], 'Sarcastic');
  assert.equal(roundedBoundarySummary.emotions[0].percentage, 13);
  assert.equal(roundedBoundarySummary.emotions[5].percentage, 38);
  assert.equal(isValidEmotionAnalysisData(roundedBoundarySummary), true);

  roundedBoundarySummary.emotions[0].percentage += 5e-10;
  assert.equal(isValidEmotionAnalysisData(roundedBoundarySummary), true);
  roundedBoundarySummary.emotions[0].percentage += 2e-9;
  assert.equal(isValidEmotionAnalysisData(roundedBoundarySummary), false);

  roundedBoundarySummary.emotions[0].percentage = 12;
  assert.equal(isValidEmotionAnalysisData(roundedBoundarySummary), false);
});

test('review-integrity panel does not render assessment summaries in the results view', async () => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { default: AnalysisResults } = await vite.ssrLoadModule('/src/Users/components/AnalysisResults.jsx');
    const html = renderToStaticMarkup(React.createElement(AnalysisResults, {
      status: 'idle',
      repeatedTextCheckEnabled: true,
      qualityCheckStatus: 'ready',
      qualityCheckBadge: { label: 'Ready to run' },
      emotionData: validEmotionData(1),
      reviewIntegrityAssessment: [
        { reviewIndex: 0, assessmentStatus: 'No Selected Patterns Detected', triggeredRules: [] },
      ],
    }));

    assert.doesNotMatch(html, /checks-summary-statuses/);
    assert.doesNotMatch(html, /Assessment complete|Ready to run|Check complete/);
  } finally {
    await vite.close();
  }
});

test('Review Integrity configuration renders the six supported rules and current selections', async () => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    plugins: [{
      name: 'expand-review-integrity-config-for-render-test',
      enforce: 'pre',
      transform(source, id) {
        if (id.endsWith('/AnalysisResults.jsx')) {
          return source
            .replace(
              'const [activeReviewPanel, setActiveReviewPanel] = useState(null);',
              "const [activeReviewPanel, setActiveReviewPanel] = useState('rules');",
            );
        }
        return source;
      },
    }],
  });

  try {
    const { default: AnalysisResults } = await vite.ssrLoadModule('/src/Users/components/AnalysisResults.jsx');
    const html = renderToStaticMarkup(React.createElement(AnalysisResults, {
      status: 'completed',
      emotionData: validEmotionData(),
      enabledRiaRuleIds: ['RIA-A', 'RIA-B', 'RIA-C', 'RIA-D'],
      reviewIntegrityAssessment: [],
    }));

    assert.match(html, /Configure Review Integrity rules \(4 selected\)/);
    for (const ruleId of ['RIA-A', 'RIA-B', 'RIA-C', 'RIA-D', 'RIA-E', 'RIA-F']) {
      assert.match(html, new RegExp(`Enable ${ruleId}:`));
    }
    assert.equal((html.match(/aria-label="Enable RIA-/g) || []).length, 6);
    assert.match(html, /aria-label="Enable RIA-A:[^"]*" checked=""/);
    const riaECheckbox = html.match(/<input type="checkbox" aria-label="Enable RIA-E:[^"]*"[^>]*>/)?.[0];
    assert.ok(riaECheckbox);
    assert.doesNotMatch(riaECheckbox, /checked=/);
    assert.match(html, /Keep at least one rule selected/);
    assert.doesNotMatch(html, /id="flagged-reviews-region"/);
    assert.doesNotMatch(html, /bot detection|proves review authenticity/i);
  } finally {
    await vite.close();
  }
});

test('review-integrity results do not repeat screening statuses inside the View', () => {
  const additionalChecksStart = analysisResultsSource.indexOf('const additionalReviewChecksCard =');
  const additionalChecksEnd = analysisResultsSource.indexOf('const reviewIntegritySection =', additionalChecksStart);
  const additionalChecks = analysisResultsSource.slice(additionalChecksStart, additionalChecksEnd);
  assert.doesNotMatch(additionalChecks, /check-status-val|checks-summary-bar/);
  assert.doesNotMatch(additionalChecks, /Exact Repeated-Text Check/);
});

test('Exact Repeated-Text Check: limitations use progressive disclosure without repeated footers', () => {
  assert.doesNotMatch(analysisResultsSource, /Detected patterns do not prove that a review is fake or genuine/);
  // Screening labels and aggregate eligibility remain review-specific.
  assert.match(analysisResultsSource, /\{q\.suspiciousReviewLabel\}/);
  assert.match(analysisResultsSource, /· excluded from aggregates/);
  assert.match(analysisResultsSource, /· included in aggregates/);
});

test('main exclusion control remains independent of the flagged-review panels', () => {
  const additionalChecksStart = analysisResultsSource.indexOf('const additionalReviewChecksCard =');
  const additionalChecksEnd = analysisResultsSource.indexOf('const reviewIntegritySection =', additionalChecksStart);
  const additionalChecks = analysisResultsSource.slice(additionalChecksStart, additionalChecksEnd);

  assert.match(additionalChecks, /handleToggleExclude\?\.\(!isExcludeFlagged\)/);
  assert.match(additionalChecks, /Exclude flagged reviews from emotion analysis/);
  assert.match(additionalChecks, /exclusionUsable && \(/);
  assert.match(analysisResultsSource, /disabled=\{!exclusionUsable\}/);
  assert.doesNotMatch(additionalChecks, /checks-options-row|checks-summary-bar/);
  assert.match(additionalChecks, /toggleReviewPanel\('flagged'\)/);
  assert.match(additionalChecks, /toggleReviewPanel\('rules'\)/);
  assert.match(analysisResultsSource, /current === panel \? null : panel/);
  assert.match(popupPageSource, /analysisStatus !== 'completed'/);
});

test('Exclusion recalculates emotion data in memory without rerunning analysis', () => {
  const toggleStart = popupPageSource.indexOf('const handleToggleExcludeRepeated =');
  const toggleEnd = popupPageSource.indexOf('const handleToggleDetectionEnabled =', toggleStart);
  const toggleHandler = popupPageSource.slice(toggleStart, toggleEnd);

  assert.match(toggleHandler, /setExcludeFlaggedFromEmotion\(checked\)/);
  assert.match(toggleHandler, /buildEmotionData\(/);
  assert.match(toggleHandler, /setEmotionData\(nextEmotionData\)/);
  assert.doesNotMatch(toggleHandler, /handleAnalyzeClick|chrome\.runtime\.sendMessage/);
});

test('Review Integrity Assessment: simplified Flagged Reviews View displays only flagged reviews with accordion details', () => {
  assert.match(analysisResultsSource, /flagged-reviews-view/);
  assert.match(analysisResultsSource, /flagged-reviews-list/);
  assert.match(analysisResultsSource, /flagged-review-item/);
  assert.match(analysisResultsSource, /flagged-category-badge/);
  assert.match(analysisResultsSource, /flagged-rule-explanation/);
  assert.match(analysisResultsSource, /aria-expanded=\{isResultsExpanded\}/);
  assert.match(analysisResultsSource, /aria-controls="flagged-reviews-region"/);
  assert.match(analysisResultsSource, /toggleFlaggedReviewExpanded/);
  assert.match(analysisResultsSource, /expandedFlaggedReviews/);
  // Unflagged reviews are NOT in this view
  assert.doesNotMatch(analysisResultsSource, /showRiaUnflagged/);
  assert.doesNotMatch(analysisResultsSource, /ria-result-list--unflagged/);
});

test('Review Integrity Assessment: layout order follows Main Options Bar, Options/View Controls, Flagged Reviews View', () => {
  const mainFilterPos = analysisResultsSource.indexOf('className="emotion-analysis-filter-section"');
  const optionsToolbarPos = analysisResultsSource.indexOf('className="checks-options-toolbar"');
  const rulesPanelPos = analysisResultsSource.indexOf('className="ria-config-drawer"');
  const flaggedViewPos = analysisResultsSource.indexOf('id="flagged-reviews-region"');

  assert.ok(mainFilterPos > 0, 'Main Options/Filters Bar must be present');
  assert.ok(optionsToolbarPos > mainFilterPos, 'Options and View Controls must appear immediately below Main Options/Filters Bar');
  assert.ok(rulesPanelPos > optionsToolbarPos, 'Rule options must appear below Options and View Controls');
  assert.ok(flaggedViewPos > rulesPanelPos, 'Flagged Reviews View must appear below Options and View Controls');
});

test('Review Integrity Assessment: reviewIndex association is strictly preserved', () => {
  assert.match(analysisResultsSource, /Comment #\{result\.reviewIndex \+ 1\}/);
  assert.match(analysisResultsSource, /key=\{`flagged-\$\{result\.reviewIndex\}`\}/);
  assert.match(analysisResultsSource, /quote\.sourceReviewIndex === result\.reviewIndex/);
  assert.doesNotMatch(analysisResultsSource, /data\.quotes\?\.\[result\.reviewIndex\]/);
});

test('Review Integrity options use existing theme variables and compact styles', () => {
  assert.match(analysisResultsCss, /\.ria-config-list\s*\{[^}]*background:\s*var\(--bg-stage\)/);
  assert.match(analysisResultsCss, /\.ria-config-list\s*\{[^}]*border:\s*1px solid var\(--border-card\)/);
  assert.match(analysisResultsCss, /\.checks-options-action-btn\s*\{[^}]*width:\s*22px/);
});

test('Review Integrity options render only after analysis completes', () => {
  const sectionIndex = analysisResultsSource.indexOf('const reviewIntegritySection =');
  const idleStart = analysisResultsSource.indexOf("if (status === 'idle')");
  const analyzingStart = analysisResultsSource.indexOf("if (status === 'analyzing')");
  const completedStart = analysisResultsSource.indexOf('<div className="hero-emotion-banner compact">', analyzingStart);
  const idleBranch = analysisResultsSource.slice(idleStart, analyzingStart);
  const analyzingBranch = analysisResultsSource.slice(analyzingStart, completedStart);
  const completedBranch = analysisResultsSource.slice(completedStart);

  assert.ok(sectionIndex >= 0 && sectionIndex < idleStart);
  assert.match(idleBranch, /\{reviewIntegritySection\}/);
  assert.match(analyzingBranch, /\{reviewIntegritySection\}/);
  assert.match(completedBranch, /\{reviewIntegritySection\}/);
  assert.match(analysisResultsSource, /const reviewIntegritySection = status === 'completed'/);
});

test('analysis results section order strictly preserves product hierarchy', () => {
  const completedStart = analysisResultsSource.indexOf('<div className="hero-emotion-banner compact">');
  const completedContent = analysisResultsSource.slice(completedStart);

  const heroPos = completedContent.indexOf('hero-emotion-banner');
  const checksPos = completedContent.indexOf('{reviewIntegritySection}');
  const actionBarPos = completedContent.indexOf('productivity-action-bar');
  const donutPos = completedContent.indexOf('donut-chart-wrapper');
  const topicPos = completedContent.indexOf('What People Are Talking About');
  const priorityPos = completedContent.indexOf('AI Insights');

  assert.ok(heroPos >= 0, 'Hero banner must be present');
  assert.ok(checksPos > heroPos, 'Additional Review Checks must come immediately below Hero banner');
  assert.ok(actionBarPos > checksPos, 'Action bar must come after Additional Review Checks');
  assert.ok(donutPos > actionBarPos, 'Donut chart must come after Action bar');
  assert.ok(topicPos > donutPos, 'Topic analysis must come after Donut chart');
  assert.ok(priorityPos > topicPos, 'Priority analysis must come after Topic analysis');
});

test('Flagged Reviews controls expose independent settings and eye actions', () => {
  assert.match(analysisResultsSource, /className="additional-review-checks-card"/);
  assert.match(analysisResultsSource, /aria-label="Additional Review Checks"/);
  assert.match(analysisResultsSource, /aria-label=\{isResultsExpanded \? 'Hide flagged reviews' : 'View flagged reviews'\}/);
  assert.match(analysisResultsSource, /aria-label=\{showRiaConfig \? 'Close Review Integrity rule configuration' : 'Configure Review Integrity rules'\}/);
  assert.match(analysisResultsSource, /aria-expanded=\{isResultsExpanded\}/);
  assert.match(analysisResultsSource, /aria-expanded=\{showRiaConfig\}/);
  assert.doesNotMatch(analysisResultsSource, /Hide Results|View Results|showRiaUnflagged/);
});

test('Overall Emotion hides model badge when model metadata is absent without showing Model unavailable', () => {
  assert.doesNotMatch(analysisResultsSource, /Model unavailable/);
  assert.doesNotMatch(analysisResultsSource, /Confidence unavailable/);
  assert.match(analysisResultsSource, /dominantEmotionDisplay\.model && \(\s*<span className="hero-confidence-badge">\s*Model: \{dominantEmotionDisplay\.model\}\s*<\/span>\s*\)/);
});
