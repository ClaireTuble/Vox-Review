import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import '../css/ExtensionConfirmationModal.css';

export default function LogoutConfirmationModalExtension({ onCancel, onConfirm }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleConfirm = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await onConfirm();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="extension-modal-backdrop" role="presentation" onClick={isLoggingOut ? undefined : onCancel}>
      <div
        className="extension-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="extension-logout-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="extension-logout-title">Are you sure you want to log out?</h2>
        <p>You will be signed out of VoxReview on this device.</p>
        <div className="extension-modal-actions">
          <button type="button" className="extension-modal-button extension-modal-button-secondary" onClick={onCancel} disabled={isLoggingOut}>
            Cancel
          </button>
          <button type="button" className="extension-modal-button extension-modal-button-danger" onClick={handleConfirm} disabled={isLoggingOut}>
            {isLoggingOut && <Loader2 size={13} className="extension-modal-spinner" />}
            {isLoggingOut ? 'Logging out…' : 'Log Out'}
          </button>
        </div>
      </div>
    </div>
  );
}
