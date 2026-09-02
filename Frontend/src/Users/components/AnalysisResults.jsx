import { useState } from 'react';
import {
  Sparkles, Trash2, Lock, BookmarkPlus,
  BatteryFull, Banknote, Package, Headphones, Heart, Wrench, MessageSquare
} from 'lucide-react';
import '../css/AnalysisResults.css';

/* ── Driver ID → Lucide icon ──────────────────────────────────── */
const DRIVER_ICON_MAP = {
  battery: BatteryFull,
  price: Banknote,
  delivery: Package,
  sound: Headphones,
  comfort: Heart,
  build: Wrench,
};

export default function AnalysisResults({ status = 'idle', isLoggedIn = false, onSaveRedirect, emotionData, scrapedReviews = [], onClearAnalysis, platform = '' }) {
  const [hoveredEmotion, setHoveredEmotion] = useState(null);
  const [selectedQuoteFilter, setSelectedQuoteFilter] = useState('all');
  const [guestNotice, setGuestNotice] = useState('');
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

  const getReviewDate = (review) => {
    if (typeof review === 'object' && review !== null) {
      return review.date || review.reviewDate || review.posted || '';
    }
    return '';
  };

  const getReviewHelpful = (review) => {
    if (typeof review === 'object' && review !== null) {
      return review.helpfulCount || review.helpful || review.likes || null;
    }
    return null;
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
          console.log('Rendering review:', r);
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
  const activeHover = hoveredEmotion || data.emotions[0];
  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  const filteredQuotes = selectedQuoteFilter === 'all'
    ? data.quotes
    : data.quotes.filter(q => q.emotion.toLowerCase() === selectedQuoteFilter.toLowerCase());

  const handleActionClick = (actionName) => {
    if (!isLoggedIn) {
      // Guest trying to save → redirect to login
      if (onSaveRedirect) onSaveRedirect();
      return;
    }
    if (actionName === 'Save Analysis') setUserToast('Analysis saved to your account!');
    else if (actionName === 'Export PDF') setUserToast('Exporting PDF Analysis Report...');
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
        >
          {!isLoggedIn ? <Lock size={13} /> : <BookmarkPlus size={13} />}
          <span>Save Analysis</span>
        </button>
      </div>

      {/* Guest lock notice */}
      {!isLoggedIn && guestNotice && (
        <div className="guest-lock-banner">
          <span className="guest-lock-text">
            <Lock size={13} />
            <span>{guestNotice}</span>
          </span>
          <button className="guest-unlock-btn" onClick={onSaveRedirect}>Log In</button>
        </div>
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
                    onMouseEnter={() => setHoveredEmotion(item)}
                    onClick={() => setHoveredEmotion(item)}
                  />
                );
              })}
            </svg>
            <div className="donut-center-info">
              <span className="donut-center-emoji emotion-icon-animated">{activeHover.emoji}</span>
              <span className="donut-center-score">{activeHover.percentage}%</span>
              <span className="donut-center-label">{activeHover.label}</span>
            </div>
          </div>

          <div className="donut-legend-grid">
            {data.emotions.map((item) => (
              <div
                key={item.id}
                className={`legend-item ${activeHover.id === item.id ? 'active' : ''}`}
                onMouseEnter={() => setHoveredEmotion(item)}
                onClick={() => setHoveredEmotion(item)}
              >
                <div className="legend-label-group">
                  <span className="legend-dot" style={{ backgroundColor: item.color }} />
                  <span>{item.emoji} {item.label}</span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>

        {activeHover && (
          <div className="emotion-intelligence-card">
            <div className="intel-card-header">
              <div className="intel-emotion-badge">
                <span className="emotion-icon-animated">{activeHover.emoji}</span>
                <span>Emotion Detected: {activeHover.label}</span>
              </div>
              <div className="intel-confidence-box">
                <span className="confidence-dot"></span>
                <span>Confidence: {activeHover.confidence || '96.7%'}</span>
              </div>
            </div>
            <div className="intel-keywords-section">
              <span className="intel-label">Common Keywords</span>
              <div className="keywords-tags-row">
                {(activeHover.keywords || ['"terrible"', '"waste of money"']).map((kw, i) => (
                  <span key={i} className="keyword-tag">{kw}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Emotion Drivers — Lucide category icons, emotion emojis kept */}
      <div className="analysis-glass-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Emotion Drivers
          </span>
          <span style={{ fontSize: '10px', color: 'var(--accent-color)', fontWeight: 600 }}>{data.drivers.length} Drivers</span>
        </div>

        <div className="aspects-grid">
          {data.drivers.map((driver) => {
            const DriverIcon = DRIVER_ICON_MAP[driver.id] || Wrench;
            return (
              <div key={driver.id} className="aspect-card">
                <div className="aspect-card-header">
                  <div className="aspect-title-group">
                    <span className="aspect-icon"><DriverIcon size={14} strokeWidth={2} /></span>
                    <span className="aspect-name">{driver.name}</span>
                  </div>
                  <div className="aspect-emotion-badge">
                    <span className="emotion-icon-sm">{driver.emoji}</span>
                    <span>{driver.emotion}</span>
                  </div>
                </div>
                <div className="aspect-progress-row">
                  <div className="aspect-bar-track">
                    <div
                      className="aspect-bar-fill"
                      style={{ width: `${driver.score}%`, background: '#2563EB' }}
                    />
                  </div>
                  <span className="aspect-score-text">{driver.score}%</span>
                </div>
              </div>
            );
          })}
        </div>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredQuotes.map((q) => (
            <div key={q.id} className="quote-bubble">
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
          ))}
        </div>
      </div>
    </div>
  );
}
