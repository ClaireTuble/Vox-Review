import { useEffect, useRef } from 'react';
import { Loader2, Smartphone, LogOut, AlertTriangle, ShieldCheck } from 'lucide-react';
import { getSessionChoiceModalConfig } from '../utils/securitySettings.js';
import '../css/modal.css';
import '../css/settings.css';

/**
 * Confirmation modal for Super Admin post-password-change device session options.
 * Requires explicit user confirmation before executing either:
 * - Option A: Keep Devices Signed In
 * - Option B: Log Out All Devices
 */
export default function SessionChoiceConfirmationModal({
  variant, // 'keep_sessions' | 'logout_all'
  onCancel,
  onConfirm,
  isSubmitting = false,
}) {
  const isLogoutAll = variant === 'logout_all';
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    cancelBtnRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isSubmitting]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onCancel();
    }
  };

  const handleConfirmClick = () => {
    if (isSubmitting) return;
    onConfirm(variant);
  };

  const config = getSessionChoiceModalConfig(variant);
  const title = config.title;
  const message = config.message;

  const disclosureNote = isLogoutAll
    ? 'All active sessions and refresh tokens will be revoked across all browsers and devices. Your current session will end immediately.'
    : 'Note: Depending on Supabase Auth session security settings, other devices may be required to log in again with your new password.';

  return (
    <div
      className="modal-backdrop platform-disable-modal-backdrop"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <section
        className={`modal-content-card platform-disable-modal sa-session-choice-modal ${
          isLogoutAll ? 'variant-danger' : 'variant-info'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-choice-modal-title"
        aria-describedby="session-choice-modal-desc"
      >
        <header className="modal-header">
          <div className="modal-title-group">
            <span
              className={`modal-icon-badge ${
                isLogoutAll ? 'badge-danger-icon' : 'badge-info-icon'
              }`}
            >
              {isLogoutAll ? <LogOut size={20} /> : <Smartphone size={20} />}
            </span>
            <div>
              <h3 id="session-choice-modal-title">{title}</h3>
              <p className="modal-user-subtitle">
                {isLogoutAll
                  ? 'Sign out across all devices and browsers'
                  : 'Maintain active sessions where supported'}
              </p>
            </div>
          </div>
        </header>

        <div className="modal-body platform-disable-modal-body" style={{ padding: '20px 24px' }}>
          <p
            id="session-choice-modal-desc"
            style={{ color: '#e2e8f0', fontSize: '14px', lineHeight: '1.6', margin: 0 }}
          >
            {message}
          </p>

          <div
            className={`sa-session-modal-note ${
              isLogoutAll ? 'note-danger' : 'note-info'
            }`}
            style={{
              marginTop: '16px',
              padding: '12px 14px',
              borderRadius: '8px',
              background: isLogoutAll ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)',
              border: `1px solid ${
                isLogoutAll ? 'rgba(239, 68, 68, 0.25)' : 'rgba(99, 102, 241, 0.25)'
              }`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '13px',
              color: isLogoutAll ? '#fca5a5' : '#c7d2fe',
              lineHeight: '1.5',
            }}
          >
            {isLogoutAll ? (
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            ) : (
              <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            )}
            <span>{disclosureNote}</span>
          </div>
        </div>

        <footer className="platform-disable-modal-actions" style={{ padding: '16px 24px 20px' }}>
          <button
            ref={cancelBtnRef}
            type="button"
            className="platform-confirmation-cancel"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`platform-confirmation-submit ${
              isLogoutAll ? 'sa-btn-danger' : 'sa-confirmation-submit-primary'
            }`}
            onClick={handleConfirmClick}
            disabled={isSubmitting}
            style={
              !isLogoutAll
                ? {
                    background: '#4f46e5',
                    borderColor: '#4338ca',
                    color: '#ffffff',
                  }
                : undefined
            }
          >
            {isSubmitting && <Loader2 size={14} className="spin-icon" />}
            {isSubmitting
              ? isLogoutAll
                ? 'Logging Out…'
                : 'Confirming…'
              : isLogoutAll
              ? 'Yes, Log Out All'
              : 'Confirm and Continue'}
          </button>
        </footer>
      </section>
    </div>
  );
}
