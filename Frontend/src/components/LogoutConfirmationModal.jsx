import { LogOut } from 'lucide-react';
import '../SuperAdmin/css/modal.css';

export default function LogoutConfirmationModal({
  onCancel,
  onConfirm,
  submitting = false,
  error = '',
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!submitting) onCancel();
      }}
    >
      <div
        className="modal-content-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirmation-title"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: '420px' }}
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <LogOut size={18} />
            </div>
            <div>
              <h3 id="logout-confirmation-title">Log Out</h3>
              <p className="modal-user-subtitle">Are you sure you want to log out on this device?</p>
            </div>
          </div>
        </div>
        {error && <p role="alert" className="platform-confirmation-error">{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px' }}>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            style={{
              border: '1px solid rgba(248, 113, 113, 0.35)',
              borderRadius: '8px',
              padding: '8px 14px',
              background: 'rgba(239, 68, 68, 0.16)',
              color: '#fca5a5',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {submitting ? 'Signing out…' : 'Log Out'}
          </button>
        </div>
      </div>
    </div>
  );
}
