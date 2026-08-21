import { CheckCircle2, Globe, Star, MessageSquare } from 'lucide-react';
import '../css/DetectedPageCard.css';

const PLATFORM_LABELS = {
  shopee: { label: 'Shopee', cls: 'shopee' },
  lazada: { label: 'Lazada', cls: 'lazada' },
  google: { label: 'Google Reviews', cls: 'google' },
  googleplay: { label: 'Google Play', cls: 'googleplay' },
  steam: { label: 'Steam', cls: 'steam' },
  agoda: { label: 'Agoda', cls: 'agoda' },
  default: { label: 'Current Source', cls: 'default' },
};

export default function DetectedPageCard({
  platform = '',
  pageTitle = 'Detecting Product...',
  category = 'Product Reviews',
  rating = '--',
  productImage = null,
  reviewsCount = '0',
  reviewSource = 'Product Reviews',
  status = 'idle',             // 'idle' | 'analyzing' | 'completed'
  hasMultipleTargets = false,  // true when other targets were available
  onChangeTarget = null,       // callback → re-open selector
}) {
  const normalizedPlatform = String(platform || '').toLowerCase();
  const plat = PLATFORM_LABELS[normalizedPlatform] || PLATFORM_LABELS.default;
  const isCompleted = status === 'completed';
  
  console.log('DetectedPageCard props:', { platform, pageTitle, category, rating, reviewsCount, normalizedPlatform, platLabel: plat.label });


  // ── COMPLETED STATE ──────────────────────────────────────────────────────────
  if (isCompleted) {
    return (
      <div className="detected-page-card-container completed">
        {/* Row 1: CheckCircle Analysis Complete */}
        <div className="card-status-header">
          <CheckCircle2 size={15} color="#10b981" />
          <span className="status-label">Analysis Complete</span>
        </div>

        <div className="page-main-info" style={{ marginTop: '6px' }}>
          {/* Product Image */}
          <div className="page-img-wrapper">
            {productImage ? (
              <img src={productImage} alt={pageTitle} className="page-img-src" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
            ) : (
              <div className="page-img-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span className="img-subtext">Product Image</span>
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="page-details">
            <div className="platform-badge-row">
              <span className={`platform-badge ${plat.cls}`}>
                <Globe size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                {plat.label}
              </span>
              <span className="page-category-tag">{category}</span>
            </div>

            <h2 className="page-title-text" title={pageTitle}>
              {pageTitle}
            </h2>

            <div className="rating-stars-inline">
              {rating && rating !== '--' ? (
                <>
                  <Star size={12} color="#fbbf24" fill="#fbbf24" style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                  <span className="rating-num">{rating}</span>
                  <span className="review-count-bullet">·</span>
                </>
              ) : null}
              <span className="review-count-tag">{reviewsCount} Reviews</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── IDLE / ANALYZING STATE ───────────────────────────────────────────────────
  return (
    <div className="detected-page-card-container">
      <div className="page-main-info">
        {/* Product Image Placeholder or Image */}
        <div className="page-img-wrapper">
          {productImage ? (
            <img src={productImage} alt={pageTitle} className="page-img-src" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
          ) : (
            <div className="page-img-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <span className="img-subtext">Product Image</span>
            </div>
          )}
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
            {rating && rating !== '--' ? (
              <>
                <Star size={12} color="#fbbf24" fill="#fbbf24" style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                <span className="rating-num">{rating}</span>
                <span className="review-count-bullet">·</span>
              </>
            ) : null}
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
