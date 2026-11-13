import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { canStartManualAnalysis } from '../utils/manualAnalysisAvailability.js';
import { isValidEmotionAnalysisData } from '../utils/emotionResultDisplay.js';

const popupPageSource = await readFile(new URL('./PopupPage.jsx', import.meta.url), 'utf8');
const analysisResultsSource = await readFile(
  new URL('../components/AnalysisResults.jsx', import.meta.url),
  'utf8',
);
const extensionPopupBundle = await readFile(
  new URL('../../../extension/assets/popup.js', import.meta.url),
  'utf8',
);
const savedAnalysesViewSource = await readFile(
  new URL('../components/SavedAnalysesView.jsx', import.meta.url),
  'utf8',
);

test('initializes scraped reviews before synchronizing the keyword request context', () => {
  const scrapedReviewsState = popupPageSource.indexOf(
    'const [scrapedReviews, setScrapedReviews] = useState([]);',
  );
  const contextReviewSet = popupPageSource.indexOf(
    'reviewSetSignature: getTopicReviewSetSignature(scrapedReviews)',
  );

  assert.notEqual(scrapedReviewsState, -1);
  assert.notEqual(contextReviewSet, -1);
  assert.ok(scrapedReviewsState < contextReviewSet);
  assert.match(
    popupPageSource,
    /useLayoutEffect\(\(\) => \{\s*topicKeywordContextRef\.current = \{\s*reviewSetSignature: getTopicReviewSetSignature\(scrapedReviews\)/,
  );
});

test('manual analysis guard allows unresolved availability but blocks disabled or ongoing analysis', () => {
  assert.equal(canStartManualAnalysis('idle', 'unknown'), true);
  assert.equal(canStartManualAnalysis('idle', 'checking'), true);
  assert.equal(canStartManualAnalysis('idle', 'available'), true);
  assert.equal(canStartManualAnalysis('idle', 'disabled'), false);
  assert.equal(canStartManualAnalysis('analyzing', 'available'), false);
  assert.match(
    popupPageSource,
    /if \(!canStartManualAnalysis\(analysisStatus, availabilityStatus\)\) return;/,
  );
  assert.match(
    popupPageSource,
    /const requestedReviews = Array\.isArray\(reviewsToAnalyze\) && reviewsToAnalyze\.length > 0\s*\? reviewsToAnalyze\s*:\s*scrapedReviews\.length > 0 \? scrapedReviews : lastScrapedReviewsRef\.current;/,
  );
});

test('screening options retain RIA and repeated-text controls without a duplicate exclusion toggle', () => {
  const detectionTitleStart = popupPageSource.indexOf('<strong className="check-option-title">Exact Repeated-Text Check</strong>');
  const detectionOptionStart = popupPageSource.lastIndexOf(
    '<label className="check-option-box">',
    detectionTitleStart,
  );
  const detectionOptionEnd = popupPageSource.indexOf('</label>', detectionOptionStart);
  const detectionOption = popupPageSource.slice(detectionOptionStart, detectionOptionEnd);

  assert.match(popupPageSource, /Exact Repeated-Text Check/);
  assert.doesNotMatch(popupPageSource, /Scan for exact duplicate text/);
  assert.doesNotMatch(extensionPopupBundle, /Scan for exact duplicate text/);
  assert.doesNotMatch(extensionPopupBundle, /Scan for identical review text in this analysis/);
  assert.doesNotMatch(extensionPopupBundle, /Exact Repeated Check/);
  assert.match(extensionPopupBundle, /Only reviews designated as exact duplicates are excluded/);
  assert.doesNotMatch(extensionPopupBundle, /Exclude identical reviews from overall emotion percentages/);
  assert.equal(
    (popupPageSource.match(/onChange=\{\(event\) => handleToggleDetectionEnabled\(event\.target\.checked\)\}/g) || []).length,
    1,
  );
  assert.match(detectionOption, /checked=\{suspiciousReviewDetectionEnabled\}/);
  assert.match(detectionOption, /handleToggleDetectionEnabled\(event\.target\.checked\)/);
  assert.match(popupPageSource, /checked=\{reviewIntegrityEnabled\}/);
  assert.doesNotMatch(popupPageSource, /<span className="quality-control-label">Exclude flagged reviews from emotion analysis/);
  assert.match(popupPageSource, /onToggleExcludeRepeated=\{handleToggleExcludeRepeated\}/);
  assert.doesNotMatch(popupPageSource, /Exclude identical reviews from overall emotion percentages/);
  assert.match(
    popupPageSource,
    /We couldn't check your reviews right now\. All collected reviews remain included in aggregate results\./,
  );
  assert.match(
    popupPageSource,
    /Compares identical normalized review text within the reviews available to this analysis/,
  );
  assert.match(
    popupPageSource,
    /Only reviews designated as exact duplicates are excluded from emotion, topic, and priority aggregates\. Other suspicious-pattern findings are not automatically excluded, and individual review records remain visible\./,
  );
  assert.match(popupPageSource, /'Ready to run'/);
  assert.match(popupPageSource, /'Not run'/);
  assert.match(popupPageSource, /'Checking\.\.\.'/);
  assert.match(popupPageSource, /'Check complete'/);
  assert.match(popupPageSource, /'Check unavailable'/);
  assert.match(popupPageSource, /analysisStatus !== 'completed'/);
});

test('restored popup analysis renders the emotion filter for eligible Review Integrity flags', async () => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: { external: ['react', 'react-dom', 'react-dom/server'] },
  });

  try {
    const { buildActiveAnalysisView } = await vite.ssrLoadModule('/src/Users/pages/PopupPage.jsx');
    const { default: AnalysisResults } = await vite.ssrLoadModule('/src/Users/components/AnalysisResults.jsx');
    const reviews = Array.from({ length: 29 }, (_, index) => ({
      text: `Unique popup review ${index + 1} describes a distinct product experience.`,
    }));
    const predictions = reviews.map((_, index) => (index % 6) + 1);
    const reviewIntegrityResults = reviews.map((_, reviewIndex) => ({
      reviewIndex,
      assessmentStatus: reviewIndex < 7 ? 'Patterns Detected' : 'No Selected Patterns Detected',
      triggeredRules: reviewIndex < 7
        ? [{ id: 'RIA-B', plainName: 'Repeated Words & Phrases', explanation: 'Repeated wording.' }]
        : [],
    }));
    const reviewIntegrityAssessment = { results: reviewIntegrityResults };
    const suspiciousReviewDetection = {
      status: 'complete',
      results: reviews.map((_, reviewIndex) => ({
        reviewIndex,
        label: 'Likely Authentic',
        score: 0,
        status: 'classified',
      })),
    };
    const platforms = [
      { platform: 'steam', pageKey: 'steam:app/123456', pageUrl: 'https://store.steampowered.com/app/123456/' },
      { platform: 'googleplay', pageKey: 'googleplay:com.sample.app', pageUrl: 'https://play.google.com/store/apps/details?id=com.sample.app' },
      { platform: 'shopee', pageKey: 'shopee:i.1.2', pageUrl: 'https://shopee.ph/product/1/2' },
      { platform: 'lazada', pageKey: 'lazada:i123456', pageUrl: 'https://www.lazada.com.ph/products/sample-i123456.html' },
    ];

    for (const { platform, pageKey, pageUrl } of platforms) {
      const { emotionData } = buildActiveAnalysisView({
        pageKey,
        platform,
        page_url: pageUrl,
        status: 'completed',
        reviews,
        svmResult: {
          predictions,
          results: predictions.map((category) => ({ category })),
        },
        suspiciousReviewDetection,
        reviewIntegrityAssessment,
        reviewIntegrityEnabled: true,
      });
      const html = renderToStaticMarkup(React.createElement(AnalysisResults, {
        status: 'completed',
        platform,
        emotionData,
        scrapedReviews: reviews,
        reviewIntegrityAssessment: reviewIntegrityResults,
        isExclusionAvailable: true,
        repeatedTextCheckEnabled: true,
      }));

      assert.equal(emotionData.analyzedReviewCount, 29, platform);
      assert.ok(html.indexOf('class="emotion-analysis-filter-section"') < html.indexOf('class="checks-options-toolbar"'), platform);
      assert.match(html, /Exclude flagged reviews from emotion analysis/, platform);
      assert.match(html, /emotion-filter-toggle-switch/, platform);
      assert.match(html, /emotion-filter-status-pill/, platform);
      assert.match(html, /Pattern Flags<\/span><span class="checks-metric-val text-amber">7/, platform);
      assert.match(html, /Reviews included in emotion analysis/, platform);
      assert.match(html, /Flagged reviews excluded from emotion analysis/, platform);
    }
  } finally {
    await vite.close();
  }
});

test('active analysis restores four LR predictions on initial analysis and rescan', async () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: { external: ['react', 'react-dom', 'react-dom/server'] },
  });

  try {
    const { buildActiveAnalysisView } = await vite.ssrLoadModule('/src/Users/pages/PopupPage.jsx');
    const reviews = [
      { text: 'The material feels sturdy and well made.' },
      { text: 'The delivery arrived later than expected.' },
      { text: 'The strap broke after only one day.' },
      { text: 'The color is different from the photos.' },
    ];
    const predictions = [1, 2, 3, 6];
    const modelProvenance = {
      modelIdentifier: 'logistic_regression',
      artifactSha256: 'a'.repeat(64),
      selectionConfiguration: { selectedWorker: 'logistic_regression' },
      reviewPredictions: predictions.map((prediction, reviewIndex) => ({
        reviewIndex,
        prediction,
      })),
    };

    for (const requestContext of ['popup-analyze', 'manual-rescan']) {
      const { record, emotionData } = buildActiveAnalysisView({
        pageKey: 'shopee:https://shopee.ph/product',
        platform: 'shopee',
        requestContext,
        status: 'completed',
        completedAt: '2026-01-15T10:00:00.000Z',
        reviews,
        svmResult: {
          predictions,
          results: predictions.map((category) => ({ category })),
          modelProvenance,
        },
      });

      assert.equal(isValidEmotionAnalysisData(emotionData), true, requestContext);
      assert.equal(emotionData.totalReviews, 4, requestContext);
      assert.equal(emotionData.dominantEmotion.model, 'Logistic Regression', requestContext);
      assert.deepEqual(record.reviewAnalysis.map(({ category }) => category), predictions, requestContext);
      assert.deepEqual(
        record.emotionModelProvenance.runs[0].reviewPredictions,
        modelProvenance.reviewPredictions,
        requestContext,
      );
    }
  } finally {
    await vite.close();
  }
});

test('active analysis without model provenance still restores valid predictions without throwing', async () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: { external: ['react', 'react-dom', 'react-dom/server'] },
  });

  try {
    const { buildActiveAnalysisView } = await vite.ssrLoadModule('/src/Users/pages/PopupPage.jsx');
    const { emotionData } = buildActiveAnalysisView({
      pageKey: 'shopee:https://shopee.ph/product',
      platform: 'shopee',
      status: 'completed',
      reviews: [
        { text: 'The material feels sturdy and well made.' },
        { text: 'The delivery arrived later than expected.' },
      ],
      svmResult: {
        predictions: [1, 2],
        results: [{ category: 1 }, { category: 2 }],
      },
    });

    assert.equal(isValidEmotionAnalysisData(emotionData), true);
    assert.equal(emotionData.totalReviews, 2);
    assert.equal(emotionData.dominantEmotion.model, null);
  } finally {
    await vite.close();
  }
});

test('completed active analysis without predictions remains completed and renders unavailable emotion state', async () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: { external: ['react', 'react-dom', 'react-dom/server'] },
  });

  try {
    const { getActiveAnalysisDisplayStatus } = await vite.ssrLoadModule(
      '/src/Users/pages/PopupPage.jsx',
    );
    const { default: AnalysisResults } = await vite.ssrLoadModule(
      '/src/Users/components/AnalysisResults.jsx',
    );
    const status = getActiveAnalysisDisplayStatus({
      status: 'completed',
      reviews: [{ text: 'A review without a prediction result.' }],
      svmResult: { predictions: [] },
    }, null);
    const markup = renderToStaticMarkup(React.createElement(AnalysisResults, {
      status,
      emotionData: null,
    }));

    assert.equal(status, 'completed');
    assert.match(markup, /AI Emotion Analysis Engine/);
    assert.match(markup, /Emotion results unavailable/);
    assert.doesNotMatch(markup, /Click "Analyze Detected Page"/);
  } finally {
    await vite.close();
  }
});

test('sanitized four-review LR response renders the emotion section without optional provenance', async () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: { external: ['react', 'react-dom', 'react-dom/server'] },
  });

  try {
    const { sanitizeActiveAnalysisState } = await vite.ssrLoadModule(
      '/src/services/legacyReviewPrivacyMigration.js',
    );
    const { buildActiveAnalysisView } = await vite.ssrLoadModule('/src/Users/pages/PopupPage.jsx');
    const { default: AnalysisResults } = await vite.ssrLoadModule(
      '/src/Users/components/AnalysisResults.jsx',
    );
    const predictions = [1, 2, 3, 6];
    const activeState = sanitizeActiveAnalysisState({
      pageKey: 'shopee:https://shopee.ph/product',
      page_url: 'https://shopee.ph/product/1/2',
      platform: 'shopee',
      status: 'completed',
      reviews: [
        { text: 'The material feels sturdy and well made.' },
        { text: 'The delivery arrived later than expected.' },
        { text: 'The strap broke after only one day.' },
        { text: 'The color is different from the photos.' },
      ],
      svmResult: {
        success: true,
        predictions,
        results: predictions.map((category) => ({
          category,
          emotionDrivers: [],
        })),
      },
    });
    const { emotionData } = buildActiveAnalysisView(activeState);

    assert.equal(isValidEmotionAnalysisData(emotionData), true);
    assert.equal(emotionData.totalReviews, 4);
    assert.equal(emotionData.dominantEmotion.model, null);
    const markup = renderToStaticMarkup(React.createElement(AnalysisResults, {
      status: 'completed',
      emotionData,
    }));
    assert.match(markup, /Overall Emotion/);
    for (const label of ['Happy', 'Sad', 'Anger', 'Disgust', 'Fear', 'Sarcastic']) {
      assert.match(markup, new RegExp(label));
    }
    assert.deepEqual(emotionData.quotes.map(({ text }) => text), [
      'The material feels sturdy and well made.',
      'The delivery [ORDER_ID] later than expected.',
      'The strap broke after only one day.',
      'The color is different from [NAME].',
    ]);
  } finally {
    await vite.close();
  }
});

test('unpacked extension popup bundle includes its runtime and current emotion UI', async () => {
  const popupHtml = await readFile(new URL('../../../extension/popup.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(
    new URL('../../../extension/manifest.json', import.meta.url),
    'utf8',
  ));
  await readFile(new URL('../../../extension/assets/rolldown-runtime.js', import.meta.url));
  await readFile(new URL('../../../extension/assets/svmRequest.js', import.meta.url));
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.match(popupHtml, /src="\.\/assets\/popup\.js"/);
  assert.match(extensionPopupBundle, /Overall Emotion/);
  assert.match(extensionPopupBundle, /AI Emotion Analysis Engine/);
  assert.match(extensionPopupBundle, /Configure Review Integrity rules/);
  assert.match(extensionPopupBundle, /emotion-analysis-filter-section/);
  assert.match(extensionPopupBundle, /Exclude flagged reviews from emotion analysis/);
  assert.match(extensionPopupBundle, /emotion-filter-toggle-switch/);
  assert.match(extensionPopupBundle, /Reviews included in emotion analysis/);
  assert.match(extensionPopupBundle, /Flagged reviews excluded from emotion analysis/);
});

test('Review Integrity Assessment uses sanitized input and remains transient', () => {
  assert.match(popupPageSource, /assessReviewIntegrity/);
  assert.match(popupPageSource, /sanitizeReviewText\(getReviewText\(review\)\)/);
  assert.match(popupPageSource, /const \[reviewIntegrityAssessment, setReviewIntegrityAssessment\] = useState\(null\)/);
  assert.match(popupPageSource, /reviewIntegrityAssessment=\{visibleReviewIntegrityAssessment\}/);
  assert.match(popupPageSource, /reviewSetSignature: integrityReviewSetSignature/);
  assert.ok(
    popupPageSource.indexOf('const reviewIntegrityResults = assessReviewIntegrity') <
      popupPageSource.indexOf("chrome.runtime.sendMessage({ type: 'startAnalysis', analysis }") ,
  );
  const analysisStart = popupPageSource.indexOf('const handleAnalyzeClick =');
  const assessmentStart = popupPageSource.indexOf('const reviewIntegrityResults = assessReviewIntegrity', analysisStart);
  const clearAtStart = popupPageSource.indexOf('setReviewIntegrityAssessment(null)', analysisStart);
  assert.ok(clearAtStart >= 0 && clearAtStart < assessmentStart);
  assert.match(popupPageSource.slice(analysisStart, assessmentStart), /setReviewIntegrityAssessment\(null\)/);
  assert.match(popupPageSource, /reviewIntegrityAssessment\.reviewSetSignature ===/);
});

test('Review Integrity Assessment rule selection: initialized with default rules A-D, re-evaluates in memory, preserves 1 active rule', () => {
  assert.match(popupPageSource, /DEFAULT_RIA_RULE_IDS/);
  assert.match(popupPageSource, /const \[enabledRiaRuleIds, setEnabledRiaRuleIds\] = useState\(DEFAULT_RIA_RULE_IDS\)/);
  assert.match(popupPageSource, /enabledRiaRuleIds=\{enabledRiaRuleIds\}/);
  assert.match(popupPageSource, /onToggleRiaRule=\{handleToggleRiaRule\}/);
  assert.match(popupPageSource, /const handleToggleRiaRule = useCallback/);
  assert.match(popupPageSource, /enabledRiaRuleIdsRef\.current/);
  assert.match(popupPageSource, /toggleReviewIntegrityRuleSelection\(current, ruleId\)/);
  assert.match(popupPageSource, /handleToggleReviewIntegrityEnabled\(true\)/);
  assert.match(popupPageSource, /enabledRuleIds: enabledRiaRuleIdsRef\.current/);
});

test('Review Integrity Assessment errors are visible and successful retry clears the error', () => {
  const toggleStart = popupPageSource.indexOf('const handleToggleReviewIntegrityEnabled =');
  const toggleEnd = popupPageSource.indexOf('const handleToggleRiaRule =', toggleStart);
  const toggleHandler = popupPageSource.slice(toggleStart, toggleEnd);

  assert.match(toggleHandler, /setReviewIntegrityError\(''\);/);
  assert.match(
    toggleHandler,
    /setReviewIntegrityError\('Review Integrity Assessment failed\. Try again after checking the selected rules\.'\)/,
  );
  assert.match(toggleHandler, /console\.error\('VoxReview: Review Integrity Assessment failed\.'/);
  assert.match(popupPageSource, /reviewIntegrityError=\{reviewIntegrityError\}/);
  assert.match(analysisResultsSource, /role="alert" className="analysis-error-message">[\s\S]*?\{reviewIntegrityError\}/);
});

test('PopupPage correctly imports useMemo from react', () => {
  assert.match(
    popupPageSource,
    /import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from\s*['"]react['"]/,
  );
});

test('priority analysis and restored quotes carry helpfulCount from aligned reviews', () => {
  assert.match(popupPageSource, /helpfulCount:\s*review\?\.helpfulCount\s*\?\?\s*null/);
  assert.match(
    popupPageSource,
    /helpfulCount:\s*savedReviews\[index\]\?\.helpfulCount\s*\?\?\s*quote\.helpfulCount\s*\?\?\s*null/,
  );
  assert.match(
    popupPageSource,
    /helpfulCount:\s*review\?\.helpfulCount\s*\?\?\s*existingQuote\.helpfulCount\s*\?\?\s*null/,
  );
});

test('cloud restore failures do not block restoration from local active-analysis state', () => {
  const cloudLookup = popupPageSource.indexOf(
    'existingAnalysis = await getAnalysisForPage(urlBasedPlatform, activeUrl);',
  );
  const cloudCatch = popupPageSource.indexOf(
    'Cloud Saved Analyses lookup failed; continuing with local page state.',
    cloudLookup,
  );
  const localLookup = popupPageSource.indexOf(
    'const activeAnalysis = await getActiveAnalysisForPage(context.pageKey);',
    cloudCatch,
  );

  assert.notEqual(cloudLookup, -1);
  assert.notEqual(cloudCatch, -1);
  assert.ok(cloudLookup < cloudCatch);
  assert.ok(cloudCatch < localLookup);
  assert.match(popupPageSource, /local page analysis can still be restored/);
});

test('active-analysis restoration catches local storage failures and resolves loading in finally', () => {
  assert.match(popupPageSource, /const activeAnalysis = await getActiveAnalysisForPage\(context\.pageKey\);/);
  assert.match(
    popupPageSource,
    /catch \(error\) \{\s*if \(isCurrentRestore\(\)\) \{\s*setScrapedHasError\(true\);[\s\S]*?Could not restore the current page analysis from local storage/,
  );
  assert.match(
    popupPageSource,
    /finally \{\s*if \(isCurrentTabRequest\(\)\) setHasResolvedActiveTab\(true\);/,
  );
  assert.match(popupPageSource, /activeTabRestoreRequestRef\.current === requestId/);
  assert.match(popupPageSource, /lastAuthUserIdRef\.current === requestUserId/);
  assert.match(popupPageSource, /analysisResolvedPageKeyRef\.current = null;\s*setHasResolvedActiveTab\(false\);\s*setEmotionData\(null\);/);
});

test('Saved Analyses configuration errors render in the component rather than from an effect', () => {
  const effectStart = savedAnalysesViewSource.indexOf('useEffect(() => {');
  const effectEnd = savedAnalysesViewSource.indexOf('const togglePlatform', effectStart);
  const savedAnalysesEffect = savedAnalysesViewSource.slice(effectStart, effectEnd);
  assert.match(
    savedAnalysesViewSource,
    /if \(supabaseConfigurationError\) \{\s*return \(\s*<div className="saved-view-container">/,
  );
  assert.doesNotMatch(savedAnalysesEffect, /return \(\s*<div/);
});
