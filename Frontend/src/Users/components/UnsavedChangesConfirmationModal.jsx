import '../css/ExtensionConfirmationModal.css';

export default function UnsavedChangesConfirmationModal({ onStay, onLeave }) {
  return (
    <div className="extension-modal-backdrop" role="presentation" onClick={onStay}>
      <div
        className="extension-modal-card extension-profile-confirmation-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="unsaved-changes-title">Unsaved Changes</h2>
        <p>You have unsaved changes. Are you sure you want to leave? Your changes will not be saved.</p>
        <div className="extension-modal-actions">
          <button
            type="button"
            className="extension-modal-button extension-modal-button-secondary"
            onClick={onStay}
          >
            Stay
          </button>
          <button
            type="button"
            className="extension-modal-button extension-modal-button-danger"
            onClick={onLeave}
          >
            Leave Without Saving
          </button>
        </div>
      </div>
    </div>
  );
}
