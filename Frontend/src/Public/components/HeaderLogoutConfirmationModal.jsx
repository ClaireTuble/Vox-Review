import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import '../css/HeaderLogoutConfirmationModal.css';

export default function HeaderLogoutConfirmationModal({ onCancel, onConfirm }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleConfirm = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await onConfirm();
      onCancel();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const modalContent = (
    <div
      className="header-logout-modal-backdrop"
      role="presentation"
      onClick={isLoggingOut ? undefined : onCancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isLoggingOut) onCancel();
      }}
    >
      <div
        className="header-logout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="header-logout-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="header-logout-modal-close"
          onClick={onCancel}
          disabled={isLoggingOut}
          aria-label="Close modal"
        >
          <X size={16} />
        </button>

        <div className="header-logout-modal-body">
          <div className="header-logout-text-group">
            <h2 id="header-logout-modal-title">Are you sure you want to log out?</h2>
            <p className="header-logout-modal-subtitle">
              You will be signed out of your VoxReview account. You can sign in again anytime.
            </p>
          </div>
        </div>

        <div className="header-logout-modal-actions">
          <button
            type="button"
            className="header-logout-modal-cancel"
            onClick={onCancel}
            disabled={isLoggingOut}
          >
            Cancel
          </button>
          <button
            type="button"
            className="header-logout-modal-confirm"
            onClick={handleConfirm}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Logging out...' : 'Log Out'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
