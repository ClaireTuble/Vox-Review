import { Globe, AlertCircle, Layers, HelpCircle, Store, MapPin, Smartphone, Check } from 'lucide-react';
import '../css/UnsupportedSiteView.css';

const SUPPORTED_PLATFORMS = [
  {
    name: 'Shopee',
    Icon: Store,
    domain: 'shopee.ph',
  },
  {
    name: 'Lazada',
    Icon: Store,
    domain: 'lazada.com.ph',
  },
  {
    name: 'Google Maps',
    Icon: MapPin,
    domain: 'google.com/maps',
  },
  {
    name: 'Google Play Store',
    Icon: Smartphone,
    domain: 'play.google.com',
  },
];

/**
 * UnsupportedSiteView
 *
 * Shown in the popup when the active tab is not a supported platform.
 * Does NOT modify the underlying webpage in any way.
 */
export default function UnsupportedSiteView() {
  return (
    <div className="unsupported-view">

      {/* ── Icon header ── */}
      <div className="unsupported-icon-ring">
        <Globe size={28} className="unsupported-globe-icon" />
        <span className="unsupported-badge-x">
          <AlertCircle size={14} />
        </span>
      </div>

      {/* ── Heading ── */}
      <h2 className="unsupported-title">Website Not Supported</h2>

      {/* ── Main Message ── */}
      <p className="unsupported-body">
        This website is not supported by the extension yet.
      </p>

      <p className="unsupported-subtext">
        Please wait for further updates as we continue expanding support for more websites.
      </p>

      {/* ── Supported platforms list ── */}
      <div className="supported-platforms-section">
        <div className="supported-platforms-header">
          <Layers size={12} />
          <span>Currently Supported Websites</span>
        </div>

        <ul className="supported-platforms-list">
          {SUPPORTED_PLATFORMS.map((p) => {
            const PlatformIcon = p.Icon;
            return (
              <li key={p.name} className="supported-platform-item">
                <span className="platform-item-icon">
                  <PlatformIcon size={16} color="#2563EB" />
                </span>
                <div className="platform-item-info">
                  <span className="platform-item-name">{p.name}</span>
                  <span className="platform-item-domain">{p.domain}</span>
                </div>
                <span className="platform-item-check">
                  <Check size={14} color="#10B981" />
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── General Extension Instructions ── */}
      <div className="unsupported-guidance-card">
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
      </div>

      {/* ── Footer note ── */}
      <p className="unsupported-footer-note">
        Additional websites will be supported in future updates!
      </p>
    </div>
  );
}
