import '../css/tables.css';

export default function TopActions({ title, subtitle, primaryLabel, onPrimaryAction, children }) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="panel-subtitle">{subtitle}</p>}
      </div>
      <div className="panel-actions">
        {children}
        {primaryLabel && (
          <button className="panel-primary-btn" onClick={onPrimaryAction}>
            {primaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
