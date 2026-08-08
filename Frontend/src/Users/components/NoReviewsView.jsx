import { MessageSquareDashed, RefreshCw, HelpCircle } from 'lucide-react';
import '../css/NoReviewsView.css';

/**
 * NoReviewsView
 *
 * Shown when the current tab IS on a supported website, but the active page
 * is not a product/review page, or no customer reviews/comments were detected.
 */
export default function NoReviewsView({ platform = '', onRescan, isRescanning = false }) {
  return (
    <div className="no-reviews-view">

      {/* ── Icon header ── */}
      <div className="no-reviews-icon-ring">
        <MessageSquareDashed size={32} className="no-reviews-main-icon" />
      </div>

      {/* ── Heading ── */}
      <h2 className="no-reviews-title">No Product Reviews Detected</h2>

      {/* ── Main Message ── */}
      <p className="no-reviews-body">
        No product reviews detected. Please open a product page with customer reviews.
      </p>

      {/* ── General How to Use the Extension Section ── */}
      <div className="no-reviews-guidance-card">
        <div className="guidance-card-header">
          <HelpCircle size={13} />
          <span>How to Use the Extension</span>
        </div>
        <ol className="guidance-steps-list">
          <li>Open a supported website.</li>
          <li>Navigate to the page containing the product, app, place, or reviews you want to analyze.</li>
          <li>Open the extension.</li>
          <li>Click the appropriate analysis/action button.</li>
          <li>Wait for the extension to analyze the available reviews/comments.</li>
          <li>View the generated results.</li>
        </ol>
        <p className="guidance-footer-note">
          VoxReview currently supports Shopee, Lazada, Google Maps, and Google Play Store. Additional websites will be supported in future updates.
        </p>
      </div>

      {/* ── Rescan Action button ── */}
      {onRescan && (
        <button
          className={`no-reviews-rescan-btn ${isRescanning ? 'rescanning' : ''}`}
          onClick={onRescan}
          disabled={isRescanning}
        >
          <RefreshCw size={14} className={isRescanning ? 'spin' : ''} />
          <span>{isRescanning ? 'Scanning Page…' : 'Rescan Page'}</span>
        </button>
      )}
    </div>
  );
}
