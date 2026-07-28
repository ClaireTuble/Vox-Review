import { Lock, Globe } from 'lucide-react';
import '../css/SavedAnalysesView.css';

export default function SavedAnalysesView({ isLoggedIn = false, onLoginClick, onSelectSaved }) {
  const savedItems = [
    {
      id: 1,
      targetTitle: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
      platform: 'Amazon',
      dominantEmotion: '😊 Happy',
      percentage: '45%',
      date: '2 hours ago'
    },
    {
      id: 2,
      targetTitle: 'Anker Magnetic Wireless Power Bank 10,000mAh',
      platform: 'Shopee',
      dominantEmotion: '😊 Happy',
      percentage: '62%',
      date: 'Yesterday'
    },
    {
      id: 3,
      targetTitle: 'Logitech MX Master 3S Ergonomic Mouse',
      platform: 'Lazada',
      dominantEmotion: '😒 Sarcastic',
      percentage: '28%',
      date: '3 days ago'
    }
  ];

  if (!isLoggedIn) {
    return (
      <div className="saved-view-container">
        <div className="saved-card" style={{ flexDirection: 'column', textAlign: 'center', padding: '24px 16px', gap: '12px' }}>
          <div className="idle-icon-wrapper" style={{ width: '48px', height: '48px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={24} color="#2563EB" />
          </div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B', margin: 0 }}>
            Saved Analyses &amp; History Locked
          </h3>
          <p style={{ fontSize: '11px', color: '#64748B', margin: 0, lineHeight: 1.4, maxWidth: '260px' }}>
            Log in to view your Saved Analyses, access Analysis History across platforms, and export PDF/CSV reports.
          </p>
          <button
            className="saved-action-btn"
            onClick={onLoginClick}
          >
            Log In / Register
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="saved-view-container">
      <div className="saved-view-header">
        <span className="saved-view-title">Saved Analyses</span>
        <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 600 }}>{savedItems.length} items</span>
      </div>

      <input 
        type="text" 
        className="saved-search-input" 
        placeholder="Search Analysis History by target or platform..."
      />

      <div className="saved-list">
        {savedItems.map((item) => (
          <div key={item.id} className="saved-card" onClick={() => onSelectSaved(item)}>
            <div className="saved-card-info">
              <span className="saved-card-title">{item.targetTitle}</span>
              <div className="saved-card-meta">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <Globe size={11} /> {item.platform}
                </span>
                <span>• {item.date}</span>
              </div>
            </div>
            <span className="saved-score-tag">{item.dominantEmotion} ({item.percentage})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
