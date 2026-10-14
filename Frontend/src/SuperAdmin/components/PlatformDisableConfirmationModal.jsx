import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import '../css/modal.css';
import '../css/settings.css';

export default function PlatformDisableConfirmationModal({
  platformName,
  onCancel,
  onConfirm,
}) {
  const [confirmationPassword, setConfirmationPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!confirmationPassword.trim()) {
      setError('Enter your Super Admin password to confirm this action.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onConfirm(confirmationPassword);
    } catch (submitError) {
      setError(submitError?.message || 'Unable to verify your confirmation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop platform-disable-modal-backdrop" role="presentation">
      <section
        className="modal-content-card platform-disable-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-disable-title"
      >
        <header className="modal-header">
          <div className="modal-title-group">
            <span className="modal-icon-badge"><ShieldCheck size={18} /></span>
            <div>
              <h3 id="platform-disable-title">Disable {platformName}?</h3>
              <p className="modal-user-subtitle">This will prevent users from analyzing reviews from this platform.</p>
            </div>
          </div>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body platform-disable-modal-body">
            <label className="platform-confirmation-label" htmlFor="platform-confirmation-password">
              Enter your Super Admin password to confirm
            </label>
            <input
              id="platform-confirmation-password"
              className="platform-confirmation-input"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              value={confirmationPassword}
              onChange={(event) => {
                setConfirmationPassword(event.target.value);
                setError('');
              }}
              disabled={isSubmitting}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'platform-confirmation-error' : undefined}
            />
            {error && (
              <p id="platform-confirmation-error" className="platform-confirmation-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <footer className="platform-disable-modal-actions">
            <button
              type="button"
              className="platform-confirmation-cancel"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="platform-confirmation-submit"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 size={14} className="spin-icon" />}
              {isSubmitting ? 'Verifying…' : 'Disable Platform'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
