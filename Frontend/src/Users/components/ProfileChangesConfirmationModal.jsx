import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import '../css/ExtensionConfirmationModal.css';

export default function ProfileChangesConfirmationModal({
  changes,
  onCancel,
  onConfirm,
}) {
  const [isSaving, setIsSaving] = useState(false);
  const changeCount = changes.length;
  const isSingleChange = changeCount === 1;
  const singleChange = changes[0];

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
        aria-labelledby="profile-changes-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="profile-changes-title">
          {isSingleChange
            ? `Update your ${singleChange.label.toLowerCase()}?`
            : 'Save these changes?'}
        </h2>
        <p>Your profile information will be updated.</p>

        <div className="extension-profile-change-list">
          {changes.map((change) => (
            <div className="extension-profile-change" key={change.label}>
              {!isSingleChange && (
                <span className="extension-profile-change-label">{change.label}</span>
              )}
              <div className="extension-profile-change-values">
                <span className="ecm-old">{change.prefix}{change.currentValue || 'Not set'}</span>
                <ArrowRight size={12} className="ecm-arrow" aria-hidden="true" />
                <span className="ecm-new">{change.prefix}{change.nextValue || 'Not set'}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="extension-modal-actions">
          <button type="button" className="extension-modal-button extension-modal-button-secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className="extension-modal-button extension-modal-button-primary" onClick={handleConfirm} disabled={isSaving}>
            {isSaving && <Loader2 size={13} className="extension-modal-spinner" />}
            {isSaving ? 'Saving…' : isSingleChange ? 'Confirm' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
