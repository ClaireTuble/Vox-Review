import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import '../css/ExtensionConfirmationModal.css';

export default function ProfileChangesConfirmationModal({
  onCancel,
  onConfirm,
}) {
  const [isSaving, setIsSaving] = useState(false);

  const handleConfirm = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onConfirm();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="extension-modal-backdrop" role="presentation" onClick={isSaving ? undefined : onCancel}>
      <div
        className="extension-modal-card extension-profile-confirmation-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-save-confirmation-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="profile-save-confirmation-title">Are you sure you want to save these changes?</h2>
        <p>Your profile information and profile picture will be updated.</p>

        <div className="extension-modal-actions">
          <button type="button" className="extension-modal-button extension-modal-button-secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className="extension-modal-button extension-modal-button-primary" onClick={handleConfirm} disabled={isSaving}>
            {isSaving && <Loader2 size={13} className="extension-modal-spinner" />}
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
