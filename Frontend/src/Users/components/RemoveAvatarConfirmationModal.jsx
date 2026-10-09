import { Loader2 } from 'lucide-react';
import '../css/ExtensionConfirmationModal.css';

export default function RemoveAvatarConfirmationModal({
  onCancel,
  onConfirm,
  isRemoving = false,
}) {
  return (
    <div
      className="extension-modal-backdrop"
      role="presentation"
      onClick={isRemoving ? undefined : onCancel}
    >
      <div
        className="extension-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-avatar-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="remove-avatar-modal-title">Remove profile picture?</h2>
        <p>Are you sure you want to remove your current profile picture?</p>
        <div className="extension-modal-actions">
          <button
            type="button"
            className="extension-modal-button extension-modal-button-secondary"
            onClick={onCancel}
            disabled={isRemoving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="extension-modal-button extension-modal-button-danger"
            onClick={onConfirm}
            disabled={isRemoving}
          >
            {isRemoving && <Loader2 size={13} className="extension-modal-spinner" />}
            {isRemoving ? 'Removing…' : 'Remove Picture'}
          </button>
        </div>
      </div>
    </div>
  );
}
