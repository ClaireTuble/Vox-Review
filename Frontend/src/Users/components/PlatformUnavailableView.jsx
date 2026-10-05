import { AlertTriangle, RefreshCw } from 'lucide-react';
import '../css/PlatformUnavailableView.css';

export default function PlatformUnavailableView({
  platformName,
  status,
  onCheckAgain,
  isChecking = false,
}) {
  const isUnavailable = status === 'disabled';
  const title = isUnavailable
    ? 'Analysis Unavailable'
    : status === 'unverified'
      ? 'Availability Could Not Be Verified'
      : 'Checking Platform Availability';

  return (
    <section className="platform-unavailable-view" role="status" aria-live="polite">
      <div className="platform-unavailable-icon" aria-hidden="true">
        {isChecking ? <RefreshCw size={25} className="platform-availability-spin" /> : <AlertTriangle size={25} />}
      </div>
      <h2 className="platform-unavailable-title">{title}</h2>
      <p className="platform-unavailable-message">
        {isUnavailable
          ? `Analysis for ${platformName} is currently disabled by the administrator. Please try again later or contact your system administrator for more information.`
          : status === 'unverified'
            ? `VoxReview could not verify whether analysis is available for ${platformName}.`
            : `VoxReview is checking whether analysis is available for ${platformName}.`}
      </p>
      {isUnavailable && (
        <p className="platform-unavailable-secondary">
          Please contact your system administrator for more information.
        </p>
      )}
      <div className="platform-unavailable-actions">
        <button
          type="button"
          className="platform-unavailable-check"
          onClick={onCheckAgain}
          disabled={isChecking}
        >
          <RefreshCw size={13} className={isChecking ? 'platform-availability-spin' : ''} />
          Check Again
        </button>
      </div>
      {status === 'unverified' && (
        <p className="platform-unavailable-secondary" role="alert">
          Platform availability could not be verified. Analysis is paused until it can be checked.
        </p>
      )}
    </section>
  );
}
