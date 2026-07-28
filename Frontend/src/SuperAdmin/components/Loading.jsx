import '../css/cards.css';

export default function Loading({ label = 'Loading dashboard data…' }) {
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <p>{label}</p>
    </div>
  );
}
