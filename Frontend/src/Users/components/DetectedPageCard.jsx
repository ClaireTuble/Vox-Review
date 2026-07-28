import { CheckCircle2, Globe, Star, MessageSquare } from 'lucide-react';
import '../css/DetectedPageCard.css';

const PLATFORM_LABELS = {
  amazon: { label: 'Amazon', cls: 'amazon' },
  shopee: { label: 'Shopee', cls: 'shopee' },
  lazada: { label: 'Lazada', cls: 'lazada' },
};

export default function DetectedPageCard({
  platform = 'amazon',
  pageTitle = 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
  category = 'Electronics / Audio',
  rating = '4.7',
  reviewsCount = '1,420',
  reviewSource = 'Product Reviews',
  status = 'idle',             // 'idle' | 'analyzing' | 'completed'
  hasMultipleTargets = false,  // true when other targets were available
  onChangeTarget = null,       // callback → re-open selector
}) {
  const plat = PLATFORM_LABELS[platform] || PLATFORM_LABELS.amazon;
  const isCompleted = status === 'completed';

  // ── COMPLETED STATE ──────────────────────────────────────────────────────────
  if (isCompleted) {
    return (
      <div className="detected-page-card-container completed">
        {/* Row 1: CheckCircle Analysis Complete */}
        <div className="card-status-header">
          <CheckCircle2 size={15} color="#10b981" />
          <span className="status-label">Analysis Complete</span>
        </div>

        {/* Row 2: Platform & Rating */}
        <div className="completed-info-row">
          <span className={`platform-badge ${plat.cls}`}>
            <Globe size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            {plat.label}
          </span>
          <div className="rating-group">
            <Star size={12} color="#fbbf24" fill="#fbbf24" style={{ marginRight: '3px', verticalAlign: 'middle' }} />
            <span className="rating-num">{rating}</span>
            <span className="rating-dot-sep">·</span>
            <span className="review-count-tag">{reviewsCount} reviews</span>
          </div>
        </div>

        {/* Row 3: Product Title */}
        <h2 className="page-title-text" title={pageTitle}>
          {pageTitle}
        </h2>

        {/* Row 4: Category + Review Source */}
        <div className="card-bottom-row">
          <span className="page-category-tag">{category}</span>
          <span className="review-source-chip">{reviewSource}</span>
        </div>
      </div>
    );
  }

  // ── IDLE / ANALYZING STATE ───────────────────────────────────────────────────
  return (
    <div className="detected-page-card-container">
      <div className="page-main-info">
        {/* Product Image Placeholder */}
        <div className="page-img-wrapper">
          <div className="page-img-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span className="img-subtext">Product Image</span>
          </div>
        </div>

        {/* Product Details */}
        <div className="page-details">
          {/* Platform badge (left) + Category tag (right) */}
          <div className="platform-badge-row">
            <span className={`platform-badge ${plat.cls}`}>
              <Globe size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              {plat.label}
            </span>
            <span className="page-category-tag">{category}</span>
          </div>

          {/* Product Title */}
          <h2 className="page-title-text" title={pageTitle}>
            {pageTitle}
          </h2>

          {/* Rating row */}
          <div className="rating-stars-inline">
            <Star size={12} color="#fbbf24" fill="#fbbf24" style={{ marginRight: '3px', verticalAlign: 'middle' }} />
            <span className="rating-num">{rating}</span>
            <span className="review-count-bullet">·</span>
            <span className="review-count-tag">{reviewsCount} Reviews</span>
          </div>
        </div>
      </div>

      {/* "Change Target" button */}
      {hasMultipleTargets && onChangeTarget && (
        <div className="change-target-bar">
          <span className="change-target-hint">
            <span className="review-source-chip">{reviewSource}</span>
          </span>
          <button className="change-target-btn" onClick={onChangeTarget}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            Change Target
          </button>
        </div>
      )}
    </div>
  );
}
