import { useState } from 'react';
import {
  Sparkles, Trash2, Lock, BookmarkPlus,
  MessageSquare, Tag
} from 'lucide-react';
import { aggregateTopicsForReviews } from '../utils/reviewTopics.js';
import { calculateReviewPriorities, sortPriorityReviews } from '../utils/priorityEngine.js';
import '../css/AnalysisResults.css';

const EMOTION_CATEGORY_BY_ID = {
  happy: 1,
  sad: 2,
  anger: 3,
  disgust: 4,
  fear: 5,
  sarcastic: 6,
};
const PRIORITY_BADGES = {
  CRITICAL: { icon: '🔴', className: 'critical' },
  HIGH: { icon: '🟠', className: 'high' },
  MEDIUM: { icon: '🟡', className: 'medium' },
  LOW: { icon: '⚪', className: 'low' },
};

export default function AnalysisResults({ status = 'idle', isLoggedIn = false, onSaveRedirect, onSaveAnalysis, isSaving = false, hasSavedAnalysis = false, saveError = '', emotionData, topicAnalysis, scrapedReviews = [], onClearAnalysis, platform = '' }) {
  const [selectedEmotion, setSelectedEmotion] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedQuoteFilter, setSelectedQuoteFilter] = useState('all');
  const [quoteSortMode, setQuoteSortMode] = useState('priority');
  const [userToast, setUserToast] = useState('');

  const getPlatformName = (review, fallbackPlatform = '') => {
    const candidatePlatform = typeof review === 'object' && review !== null
      ? (review.platform || '').toLowerCase()
      : '';
    const resolvedPlatform = candidatePlatform || (fallbackPlatform || '').toLowerCase();
    if (resolvedPlatform === 'googleplay') return 'Google Play';
    if (resolvedPlatform === 'google') return 'Google';
    if (resolvedPlatform === 'lazada') return 'Lazada';
    if (resolvedPlatform === 'shopee') return 'Shopee';
    if (resolvedPlatform === 'steam') return 'Steam';
    if (resolvedPlatform === 'agoda') return 'Agoda';
    return 'Current Source';
  };

  const getReviewLabel = (review, fallbackPlatform = '') => {
    const platformName = getPlatformName(review, fallbackPlatform);
    return `${platformName} Review`;
  };

  const getReviewerName = (review, fallbackPlatform = '') => {
    const reviewerName = typeof review === 'object' && review !== null
      ? (review.reviewer || review.author || review.userName || review.reviewerName || '')
      : '';
    if (reviewerName) return reviewerName;
    const platformName = getPlatformName(review, fallbackPlatform);
    return `${platformName} Reviewer`;
  };

  const getReviewText = (review) => {
    if (typeof review === 'string') return review;
    if (typeof review === 'object' && review !== null) {
      return review.text || review.reviewText || review.comment || review.review || '';
    }
    return '';
  };

  const normalizedReviews = Array.isArray(scrapedReviews)
    ? scrapedReviews
    : Array.isArray(scrapedReviews?.reviews)
      ? scrapedReviews.reviews
      : [];

  console.log('Popup reviews:', normalizedReviews);
  console.log('Popup platform:', platform);

  /* ── Emotion dataset (driver icons resolved via DRIVER_ICON_MAP) ── */
  const defaultData = {
    totalReviews: normalizedReviews.length > 0 ? normalizedReviews.length : 1420,
    dominantEmotion: { label: 'Happy', emoji: '😊', percentage: 45, confidence: '98.4%' },
    emotions: [
      { id: 'happy', label: 'Happy', emoji: '😊', percentage: 45, count: 639, confidence: '98.4%', keywords: ['"amazing ANC"', '"super comfortable"', '"battery lasts forever"', '"worth it"'], color: '#EAB308' },
      { id: 'sad', label: 'Sad', emoji: '😢', percentage: 8, count: 113, confidence: '89.6%', keywords: ['"headache after 1 hr"', '"squeezes too tight"', '"wanted to love these"'], color: '#3B82F6' },
      { id: 'anger', label: 'Anger', emoji: '😠', percentage: 18, count: 255, confidence: '96.7%', keywords: ['"terrible"', '"waste of money"', '"very disappointed"', '"muffled mic"'], color: '#EF4444' },
      { id: 'disgust', label: 'Disgust', emoji: '🤢', percentage: 12, count: 170, confidence: '94.5%', keywords: ['"sweaty ear pads"', '"smells like plastic"', '"sticky cushion"'], color: '#16A34A' },
      { id: 'fear', label: 'Fear', emoji: '😨', percentage: 7, count: 101, confidence: '87.1%', keywords: ['"afraid it will break"', '"worried it is unsafe"', '"unsafe after one use"'], color: '#F97316' },
      { id: 'sarcastic', label: 'Sarcastic', emoji: '😒', percentage: 10, count: 142, confidence: '91.2%', keywords: ['"great if you love bricks"', '"brilliant case design"', '"sure why not"'], color: '#A855F7' },
    ],
    drivers: [
      { id: 'battery', name: 'Battery Performance', score: 92, emotion: 'Happy', emoji: '😊', color: '#EAB308' },
      { id: 'price', name: 'Price & Value', score: 68, emotion: 'Sarcastic', emoji: '😒', color: '#A855F7' },
      { id: 'delivery', name: 'Packaging & Delivery', score: 88, emotion: 'Happy', emoji: '😊', color: '#EAB308' },
      { id: 'sound', name: 'Audio & Sound Quality', score: 96, emotion: 'Happy', emoji: '😊', color: '#EAB308' },
      { id: 'comfort', name: 'Comfort & Ergonomics', score: 76, emotion: 'Sad', emoji: '😢', color: '#3B82F6' },
      { id: 'build', name: 'Build & Materials', score: 84, emotion: 'Happy', emoji: '😊', color: '#EAB308' },
    ],
    quotes: normalizedReviews.length > 0
      ? normalizedReviews.map((r, idx) => {
          const reviewText = getReviewText(r);
          return {
            id: idx + 1,
            emotion: 'Pending',
            emoji: '💬',
            driver: getReviewLabel(r, platform),
            text: reviewText,
            author: getReviewerName(r, platform),
          };
        })
      : [
          { id: 1, emotion: 'Happy', emoji: '😊', driver: 'Battery', text: 'Battery easily lasts 30+ hours of continuous travel ANC!', author: 'Review Source' },
          { id: 2, emotion: 'Anger', emoji: '😠', driver: 'Microphone', text: 'Microphone is terrible and picks up every background noise during Zoom calls.', author: 'Review Source' },
          { id: 3, emotion: 'Sarcastic', emoji: '😒', driver: 'Case', text: 'Love carrying a giant suitcase just to store my headphones.', author: 'Review Source' },
          { id: 4, emotion: 'Disgust', emoji: '🤢', driver: 'Cushions', text: 'Ear cushion leather gets hot and sticky after 20 minutes.', author: 'Review Source' },
          { id: 5, emotion: 'Sad', emoji: '😢', driver: 'Comfort', text: 'Headband squeezes a bit too tight for long listening sessions.', author: 'Review Source' },
          { id: 6, emotion: 'Fear', emoji: '😨', driver: 'Build', text: 'I am worried the product may break after just a few uses.', author: 'Review Source' },
        ],
  };

  const data = emotionData || defaultData;
  const activeEmotion = data.emotions.find((emotion) => emotion.id === selectedEmotion?.id) || data.emotions[0];
  const selectedCategory = selectedEmotion
    ? selectedEmotion.category ?? EMOTION_CATEGORY_BY_ID[selectedEmotion.id]
    : null;
  const topicReviewEntries = data.quotes.map((quote, index) => ({
    review: normalizedReviews[index] ?? quote,
    category: quote.category ?? EMOTION_CATEGORY_BY_ID[quote.emotion?.toLowerCase()],
    topicResultIndex: Number.isInteger(quote.topicResultIndex) ? quote.topicResultIndex : index,
  }));
  const emotionTopicReviewEntries = selectedCategory == null
    ? topicReviewEntries
    : topicReviewEntries.filter((entry) => entry.category === selectedCategory);
  const hasValidTopicResults = Array.isArray(topicAnalysis?.results) &&
    topicAnalysis.results.length === data.quotes.length &&
    topicAnalysis.results.every((result, index) => (
      (result?.reviewIndex == null || result.reviewIndex === index) &&
      Array.isArray(result?.topics) && result.topics.every((topic) => (
      typeof topic?.label === 'string' && typeof topic?.score === 'number'
      ))
    ));
  const topicStatus = hasValidTopicResults ? 'ready' : data.topicStatus;
  const scopedTopics = aggregateTopicsForReviews(topicReviewEntries, topicAnalysis, selectedCategory);
  const visibleTopics = scopedTopics.filter((topic) => topic.count > 0);
  const activeTopic = visibleTopics.find((topic) => topic.id === selectedTopic?.id) || visibleTopics[0];
  const topicSubtitle = selectedEmotion
    ? `Topics discussed in the ${emotionTopicReviewEntries.length} ${activeEmotion.label} reviews.`
    : 'Topics discussed across all analyzed reviews.';
  const activeKeywords = activeEmotion?.keywords || [];
  const topicKeywords = activeTopic?.keywords || [];
  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  const priorityReviews = data.quotes.map((quote, index) => ({
    ...quote,
    rating: quote.rating ?? normalizedReviews[index]?.rating,
    helpfulCount: quote.helpfulCount ?? normalizedReviews[index]?.helpfulCount,
  }));
  const reviewPriorities = calculateReviewPriorities(priorityReviews, topicAnalysis);
  const quoteEntries = data.quotes.map((quote, originalIndex) => ({
    quote,
    priority: reviewPriorities[originalIndex],
    sourceReview: normalizedReviews[originalIndex] ?? quote,
    originalIndex,
  }));
  const filteredQuoteEntries = selectedQuoteFilter === 'all'
    ? quoteEntries
    : quoteEntries.filter(({ quote }) => quote.emotion.toLowerCase() === selectedQuoteFilter.toLowerCase());
  const sortedQuoteEntries = sortPriorityReviews(filteredQuoteEntries, quoteSortMode);

  const selectEmotion = (emotion) => {
    const isAlreadySelected = selectedEmotion?.id === emotion.id;
    setSelectedEmotion(isAlreadySelected ? null : emotion);
    setSelectedQuoteFilter(isAlreadySelected ? 'all' : emotion.label.toLowerCase());
  };

  const handleActionClick = async (actionName) => {
    if (!isLoggedIn) {
      // Guest trying to save → redirect to login
      if (onSaveRedirect) onSaveRedirect();
      return;
    }
    if (actionName === 'Save Analysis') {
      const saved = await onSaveAnalysis?.();
      if (!saved) return;
      setUserToast('Analysis saved successfully.');
    } else if (actionName === 'Export PDF') setUserToast('Exporting PDF Analysis Report...');
    else if (actionName === 'Export CSV') setUserToast('Exporting CSV dataset...');
    setTimeout(() => setUserToast(''), 3000);
  };

  /* ── Idle ─────────────────────────────────────────────────── */
  if (status === 'idle') {
    return (
      <div className="analysis-section">
        <div className="analysis-glass-card" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 16px' }}>
          <div className="hero-emoji-ring" style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={32} color="var(--accent-color)" style={{ filter: 'drop-shadow(0 0 8px rgba(37,99,235,0.4))' }} />
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            AI Emotion Analysis Engine
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0, maxWidth: '280px' }}>
            Click <strong>"Analyze Detected Page"</strong> to evaluate reviews from the active page across emotion categories.
          </p>
        </div>
      </div>
    );
  }

  /* ── Analyzing skeleton ──────────────────────────────────── */
  if (status === 'analyzing') {
    return (
      <div className="analysis-section">
        <div className="analysis-glass-card">
          <div className="skeleton-box" style={{ height: '70px', borderRadius: '14px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
            <div className="skeleton-box skeleton-circle" />
            <div className="skeleton-box skeleton-line short" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="skeleton-box skeleton-line" />
            <div className="skeleton-box skeleton-line" />
            <div className="skeleton-box skeleton-line" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Completed ───────────────────────────────────────────── */
  return (
    <div className="analysis-section">

      {/* 1. Overall Emotion — emotion emoji kept, animated */}
      <div className="hero-emotion-banner compact">
        <div className="hero-emotion-header-row">
          <span className="hero-emoji emotion-icon-animated">{data.dominantEmotion.emoji}</span>
          <span className="hero-tag">Overall Emotion</span>
        </div>
        <div className="hero-emotion-body">
          <span className="hero-emotion-name">{data.dominantEmotion.label}</span>
          <div className="hero-emotion-metrics">
            <span className="hero-emotion-score">{data.dominantEmotion.percentage}%</span>
            <span className="hero-confidence-badge">
              High Confidence ({data.dominantEmotion.confidence || '98.4%'})
            </span>
          </div>
        </div>
      </div>

      {/* 2. Action Bar — Lucide icons only */}
      <div className="productivity-action-bar">
        <button className="action-tool-btn secondary-clear" onClick={onClearAnalysis}>
          <Trash2 size={13} />
          <span>Clear Analysis</span>
        </button>
        <button
          className={`action-tool-btn primary-save ${!isLoggedIn ? 'locked' : ''}`}
          onClick={() => handleActionClick('Save Analysis')}
          disabled={isSaving || hasSavedAnalysis}
          title={hasSavedAnalysis ? 'This analysis is saved. Rescan before saving an updated version.' : 'Save the current analysis for this page'}
        >
          {!isLoggedIn ? <Lock size={13} /> : <BookmarkPlus size={13} />}
          <span>{isSaving ? 'Saving…' : hasSavedAnalysis ? 'Saved' : 'Save Analysis'}</span>
        </button>
      </div>

      {saveError && (
        <p role="alert" style={{ color: '#b91c1c', fontSize: '11px', margin: 0 }}>
          {saveError}
        </p>
      )}

      {/* Auth toast */}
      {isLoggedIn && userToast && (
        <div style={{
          background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: '8px', padding: '6px 12px', fontSize: '11px',
          fontWeight: 600, color: '#34d399', textAlign: 'center',
        }}>
          {userToast}
        </div>
      )}

      {/* 3. Donut Chart — emotion emojis kept, animated */}
      <div className="analysis-glass-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Emotion Distribution
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Tap emotion to inspect keywords</span>
        </div>

        <div className="donut-chart-wrapper">
          <div className="donut-svg-container">
            <svg className="donut-svg" viewBox="0 0 120 120">
              {data.emotions.map((item, index) => {
                const prevPercent = data.emotions.slice(0, index).reduce((acc, e) => acc + e.percentage, 0);
                const strokeDasharray = `${(item.percentage / 100) * circumference} ${circumference}`;
                const strokeDashoffset = -((prevPercent / 100) * circumference);
                return (
                  <circle
                    key={item.id}
                    className="donut-segment"
                    cx="60" cy="60" r={radius}
                    fill="none" stroke={item.color} strokeWidth="14"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    onClick={() => selectEmotion(item)}
                  />
                );
              })}
            </svg>
            <div className="donut-center-info">
              <span className="donut-center-emoji emotion-icon-animated">{activeEmotion.emoji}</span>
              <span className="donut-center-score">{activeEmotion.percentage}%</span>
              <span className="donut-center-label">{activeEmotion.label}</span>
            </div>
          </div>

          <div className="donut-legend-grid">
            {data.emotions.map((item) => (
              <div
                key={item.id}
                className={`legend-item ${selectedEmotion?.id === item.id ? 'active' : ''}`}
                onClick={() => selectEmotion(item)}
                role="button"
                tabIndex={0}
              >
                <div className="legend-label-group">
                  <span className="legend-dot" style={{ backgroundColor: item.color }} />
                  <span>{item.emoji} {item.label}</span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>
                  {item.percentage}%
                  <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: 'var(--text-muted)' }}>
                    {item.count} reviews
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {activeEmotion && (
          <div className="emotion-intelligence-card">
            <div className="intel-card-header">
              <div className="intel-emotion-badge">
                <span className="emotion-icon-animated">{activeEmotion.emoji}</span>
                <span>Emotion Detected: {activeEmotion.label}</span>
              </div>
              <div className="intel-confidence-box">
                <span className="confidence-dot"></span>
                <span>Confidence: {activeEmotion.confidence || 'SVM'}</span>
              </div>
            </div>
            <div className="intel-keywords-section">
              <span className="intel-label">Common Keywords</span>
              <div className="keywords-tags-row">
                {activeKeywords.length > 0
                  ? activeKeywords.map((kw, i) => (
                      <span key={i} className="keyword-tag">{kw}</span>
                    ))
                  : (
                    <span className="keyword-empty-message">
                      {activeEmotion.count === 0
                        ? `No reviews were classified into ${activeEmotion.label}, so no common keywords are available for this emotion.`
                        : 'No meaningful emotion keywords found.'}
                    </span>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Independent review-topic classification */}
      <div className="analysis-glass-card">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            What People Are Talking About
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{topicSubtitle}</span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Tap a topic to inspect details</span>
        </div>

        {topicStatus === 'pending' && (
          <div className="topic-pending-container" role="status" aria-live="polite">
            <div className="topic-pending-header">
              <div className="topic-pulsing-dots" aria-hidden="true">
                <span className="topic-dot" />
                <span className="topic-dot" />
                <span className="topic-dot" />
              </div>
              <span className="topic-pending-title">Analyzing review topics…</span>
            </div>
            <p className="topic-pending-subtitle">
              This may take a few minutes. You can continue reviewing the emotion results.
            </p>
            <div className="topic-skeleton-grid" aria-hidden="true">
              <div className="topic-skeleton-card">
                <div className="topic-skeleton-row">
                  <div className="topic-skeleton-icon skeleton-box" />
                  <div className="topic-skeleton-label skeleton-box" />
                  <div className="topic-skeleton-count skeleton-box" />
                </div>
                <div className="topic-skeleton-bar skeleton-box" />
              </div>
              <div className="topic-skeleton-card">
                <div className="topic-skeleton-row">
                  <div className="topic-skeleton-icon skeleton-box" />
                  <div className="topic-skeleton-label skeleton-box" style={{ width: '55%' }} />
                  <div className="topic-skeleton-count skeleton-box" />
                </div>
                <div className="topic-skeleton-bar skeleton-box" style={{ width: '60%' }} />
              </div>
              <div className="topic-skeleton-card">
                <div className="topic-skeleton-row">
                  <div className="topic-skeleton-icon skeleton-box" />
                  <div className="topic-skeleton-label skeleton-box" style={{ width: '45%' }} />
                  <div className="topic-skeleton-count skeleton-box" />
                </div>
                <div className="topic-skeleton-bar skeleton-box" style={{ width: '40%' }} />
              </div>
            </div>
          </div>
        )}
        {topicStatus === 'unavailable' && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Topic insights are temporarily unavailable.
          </p>
        )}
        {topicStatus === 'disabled' && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0' }}>
            Review topic analysis is disabled by configuration.
          </p>
        )}
        {topicStatus === 'not-analyzed' && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0' }}>
            Topic predictions are not available for this saved analysis.
          </p>
        )}
        {topicStatus === 'ready' && selectedEmotion && emotionTopicReviewEntries.length === 0 && (
          <p className="keyword-empty-message">No reviews are available for this emotion.</p>
        )}
        {topicStatus === 'ready' && visibleTopics.length > 0 && <div className="aspects-grid">
          {visibleTopics.map((topic) => {
            return (
              <button
                key={topic.id}
                type="button"
                className={`aspect-card topic-card ${activeTopic?.id === topic.id ? 'active' : ''}`}
                onClick={() => setSelectedTopic(topic)}
              >
                <div className="aspect-card-header">
                  <div className="aspect-title-group">
                    <span className="aspect-icon"><Tag size={14} strokeWidth={2} /></span>
                    <span className="aspect-name">{topic.label}</span>
                  </div>
                  <span className="aspect-score-text topic-review-count">
                    {topic.count} {topic.count === 1 ? 'review' : 'reviews'}
                  </span>
                </div>
                <div className="aspect-progress-row">
                  <div className="aspect-bar-track">
                    <div
                      className="aspect-bar-fill"
                      style={{ width: `${topic.percentage}%`, background: '#2563EB' }}
                    />
                  </div>
                  <span className="aspect-score-text">{topic.percentage.toFixed(1)}%</span>
                </div>
              </button>
            );
          })}
        </div>}
        {topicStatus === 'ready' && emotionTopicReviewEntries.length > 0 && visibleTopics.length === 0 && (
          <p className="keyword-empty-message">
            {selectedEmotion
              ? 'No topics detected in the selected reviews.'
              : 'No topics detected in the analyzed reviews.'}
          </p>
        )}
        {!data.topicStatus && (!data.topics || data.topics.length === 0) && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0' }}>
            Topic analysis is not available for this saved analysis.
          </p>
        )}
        {topicStatus === 'ready' && activeTopic && (
          <div className="emotion-intelligence-card topic-detail-card">
            <div className="intel-card-header">
              <div className="intel-emotion-badge">
                <span className="aspect-icon"><Tag size={14} /></span>
                <span>Selected Topic: {activeTopic.label}</span>
              </div>
              <div className="intel-confidence-box">
                <span>
                  {activeTopic.percentage.toFixed(1)}% · {activeTopic.count} {activeTopic.count === 1 ? 'review' : 'reviews'}
                </span>
              </div>
            </div>
            <div className="intel-keywords-section">
              <span className="intel-label">Common Keywords</span>
              <div className="keywords-tags-row">
                {topicKeywords.length > 0
                  ? topicKeywords.map((keyword) => (
                    <span key={keyword} className="keyword-tag">{keyword}</span>
                  ))
                  : <span className="keyword-empty-message">{activeTopic.count === 0
                    ? 'No reviews were classified into this topic, so no common keywords are available.'
                    : 'No meaningful topic keywords found.'}</span>}
              </div>
            </div>
            {activeTopic.reviews?.length > 0 && (
              <div className="topic-evidence-section">
                <span className="intel-label">Representative Reviews</span>
                <div className="topic-evidence-list">
                  {activeTopic.reviews.map((review, index) => (
                    <div key={`${review}-${index}`} className="topic-evidence-item">
                      <p className="quote-text">"{review}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. AI Insights — filter buttons keep emotion emojis */}
      <div className="analysis-glass-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            AI Insights
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Filter Review Evidence</span>
        </div>

        <div className="quotes-filter-bar">
          <button
            className={`filter-chip ${selectedQuoteFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedQuoteFilter('all')}
          >
            All Evidence
          </button>
          {data.emotions.map((e) => (
            <button
              key={e.id}
              className={`filter-chip ${selectedQuoteFilter === e.label.toLowerCase() ? 'active' : ''}`}
              onClick={() => setSelectedQuoteFilter(e.label.toLowerCase())}
            >
              <span>{e.emoji}</span>
              <span>{e.label}</span>
            </button>
          ))}
        </div>

        <label className="review-sort-control">
          <span>Sort by:</span>
          <select
            aria-label="Sort reviews"
            value={quoteSortMode}
            onChange={(event) => setQuoteSortMode(event.target.value)}
          >
            <option value="priority">Priority</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sortedQuoteEntries.map(({ quote: q, priority }) => {
            const priorityBadge = PRIORITY_BADGES[priority.level];
            return (
            <div key={q.id ?? priority.reviewIndex} className="quote-bubble">
              <div className="review-priority-row">
                <span
                  className={`review-priority-badge review-priority-badge--${priorityBadge.className}`}
                  title={priority.explanation}
                  aria-label={`Priority: ${priority.level}`}
                >
                  <span aria-hidden="true">{priorityBadge.icon}</span>
                  <span>{priority.level}</span>
                </span>
                {import.meta.env.DEV && (
                  <span className="review-priority-debug">Score {priority.score}</span>
                )}
              </div>
              <p className="quote-text">"{q.text}"</p>
              <div className="quote-meta-row">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {q.emoji === '💬' ? <MessageSquare size={11} /> : <span>{q.emoji}</span>}
                  <span>{q.emotion} • {q.driver}</span>
                </span>
                <span>{q.author}</span>
              </div>
              {q.date && (
                <div className="quote-submeta-row">
                  <span>{q.date}</span>
                </div>
              )}
              {q.helpfulCount && (
                <div className="quote-submeta-row">
                  <span>{q.helpfulCount} found this helpful</span>
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
