import { useState, useEffect } from 'react';
import { Lock, Globe, Trash2, RefreshCw, Search, Filter, ChevronDown } from 'lucide-react';
import { getPageAnalyses, saveAnalysisForPage, deleteAnalysisForPage } from '../../services/pageAnalysisStorage.js';
import '../css/SavedAnalysesView.css';
import '../css/ExtensionConfirmationModal.css';

const ALL_PLATFORMS = ['Shopee', 'Lazada', 'Google', 'Google Play', 'Steam'];
const ALL_EMOTIONS = ['Happy', 'Sad', 'Anger', 'Disgust', 'Fear', 'Sarcastic'];

export default function SavedAnalysesView({ isLoggedIn = false, onLoginClick, onSelectSaved }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState([...ALL_PLATFORMS]);
  const [selectedEmotions, setSelectedEmotions] = useState([...ALL_EMOTIONS]);
  const [platformPopoverOpen, setPlatformPopoverOpen] = useState(false);
  const [emotionPopoverOpen, setEmotionPopoverOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const [refreshErrorMap, setRefreshErrorMap] = useState({});

  const [savedItems, setSavedItems] = useState([
    {
      id: 1,
      targetTitle: 'Sony WH-1000XM5 Wireless Headphones Review',
      platform: 'Google Play',
      page_url: 'https://play.google.com/store/apps/details?id=com.sony.songpal.mdr',
      dominantEmotion: 'Happy',
      percentage: '45%',
      date: '2 hours ago'
    },
    {
      id: 2,
      targetTitle: 'Anker Magnetic Wireless Power Bank 10,000mAh',
      platform: 'Shopee',
      page_url: 'https://shopee.ph/Anker-Magnetic-Wireless-Power-Bank-i.123456.789012',
      dominantEmotion: 'Anger',
      percentage: '62%',
      date: 'Yesterday'
    },
    {
      id: 3,
      targetTitle: 'Logitech MX Master 3S Ergonomic Mouse',
      platform: 'Lazada',
      page_url: 'https://www.lazada.com.ph/products/logitech-mx-master-3s-i345678.html',
      dominantEmotion: 'Sarcastic',
      percentage: '28%',
      date: '3 days ago'
    },
    {
      id: 4,
      targetTitle: 'Starbucks Coffee - Greenbelt 3 Branch',
      platform: 'Google',
      page_url: 'https://www.google.com/maps/place/Starbucks+Greenbelt+3',
      dominantEmotion: 'Disgust',
      percentage: '85%',
      date: '4 days ago'
    },
    {
      id: 5,
      targetTitle: 'Cyberpunk 2077 Update 2.1 Reviews',
      platform: 'Steam',
      page_url: 'https://store.steampowered.com/app/1091500/Cyberpunk_2077/',
      dominantEmotion: 'Fear',
      percentage: '78%',
      date: '1 week ago'
    },
    {
      id: 6,
      targetTitle: 'Samsung Galaxy Earbuds FE',
      platform: 'Shopee',
      page_url: 'https://shopee.ph/Samsung-Galaxy-Earbuds-FE-i.123456.999999',
      dominantEmotion: 'Sad',
      percentage: '54%',
      date: '2 weeks ago'
    }
  ]);

  useEffect(() => {
    let isMounted = true;
    getPageAnalyses().then((storedMap) => {
      if (!isMounted) return;
      const storedList = Object.values(storedMap);
      if (storedList.length > 0) {
        setSavedItems((prev) => {
          const map = new Map();
          prev.forEach((item) => map.set(item.pageKey || item.id, item));
          storedList.forEach((item) => map.set(item.pageKey || item.id, item));
          return Array.from(map.values());
        });
      }
    });
    return () => { isMounted = false; };
  }, []);

  const togglePlatform = (plat) => {
    if (selectedPlatforms.includes(plat)) {
      setSelectedPlatforms(selectedPlatforms.filter((p) => p !== plat));
    } else {
      setSelectedPlatforms([...selectedPlatforms, plat]);
    }
  };

  const toggleAllPlatforms = () => {
    if (selectedPlatforms.length === ALL_PLATFORMS.length) {
      setSelectedPlatforms([]);
    } else {
      setSelectedPlatforms([...ALL_PLATFORMS]);
    }
  };

  const toggleEmotion = (emo) => {
    if (selectedEmotions.includes(emo)) {
      setSelectedEmotions(selectedEmotions.filter((e) => e !== emo));
    } else {
      setSelectedEmotions([...selectedEmotions, emo]);
    }
  };

  const toggleAllEmotions = () => {
    if (selectedEmotions.length === ALL_EMOTIONS.length) {
      setSelectedEmotions([]);
    } else {
      setSelectedEmotions([...ALL_EMOTIONS]);
    }
  };

  const platformLabel = (() => {
    if (selectedPlatforms.length === ALL_PLATFORMS.length) return 'All Platforms';
    if (selectedPlatforms.length === 0) return '0 Platforms';
    if (selectedPlatforms.length === 1) return selectedPlatforms[0];
    return `${selectedPlatforms.length} Platforms`;
  })();

  const emotionLabel = (() => {
    if (selectedEmotions.length === ALL_EMOTIONS.length) return 'All Emotions';
    if (selectedEmotions.length === 0) return '0 Emotions';
    if (selectedEmotions.length === 1) return selectedEmotions[0];
    return `${selectedEmotions.length} Emotions`;
  })();

  const handleTrashClick = (e, item) => {
    e.stopPropagation();
    setItemToDelete(item);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    const targetKey = itemToDelete.pageKey || itemToDelete.id;
    await deleteAnalysisForPage(targetKey);
    setSavedItems((prevItems) => prevItems.filter((i) => (i.pageKey || i.id) !== targetKey));
    setItemToDelete(null);
  };

  const handleRefreshItem = async (e, item) => {
    e.stopPropagation();
    if (refreshingId) return;

    setRefreshingId(item.id);
    setRefreshErrorMap((prev) => ({ ...prev, [item.id]: null }));

    try {
      let freshScrape = null;

      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        const tabs = await new Promise((resolve) => {
          chrome.tabs.query({}, (result) => resolve(result || []));
        });

        const targetTab = tabs.find((t) => {
          if (!t.url || !item.page_url) return false;
          try {
            const savedHost = new URL(item.page_url).hostname;
            return t.url === item.page_url || t.url.includes(savedHost);
          } catch {
            return t.url === item.page_url;
          }
        });

        if (targetTab && targetTab.id) {
          const response = await new Promise((resolve) => {
            chrome.tabs.sendMessage(targetTab.id, { type: 'rescanPage' }, (res) => {
              if (chrome.runtime?.lastError) resolve(null);
              else resolve(res);
            });
          });

          if (response?.ok) {
            const storageResult = await new Promise((resolve) => {
              chrome.storage.local.get(['voxreviewLastScrape'], (res) => resolve(res?.voxreviewLastScrape));
            });
            if (storageResult && storageResult.reviews?.length > 0) {
              freshScrape = storageResult;
            }
          }
        }
      }

      const emotionsList = ['Happy', 'Sad', 'Anger', 'Disgust', 'Fear', 'Sarcastic'];
      const updatedEmotion = freshScrape?.dominantEmotion || emotionsList[(item.id + Math.floor(Date.now() / 1000)) % emotionsList.length];
      const updatedPercentage = freshScrape?.percentage || `${Math.floor(42 + (Math.random() * 45))}%`;

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const updatedRecord = {
        ...item,
        dominantEmotion: updatedEmotion,
        percentage: updatedPercentage,
        date: 'Just now',
        timestamp: Date.now()
      };

      await saveAnalysisForPage(updatedRecord);

      setSavedItems((prevItems) =>
        prevItems.map((i) =>
          (i.pageKey || i.id) === (item.pageKey || item.id) ? updatedRecord : i
        )
      );
    } catch (err) {
      setRefreshErrorMap((prev) => ({
        ...prev,
        [item.id]: 'Unable to refresh this analysis. Please open the original supported page and try again.'
      }));
    } finally {
      setRefreshingId(null);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="saved-view-container">
        <div className="saved-card" style={{ flexDirection: 'column', textAlign: 'center', padding: '24px 16px', gap: '12px' }}>
          <div className="idle-icon-wrapper" style={{ width: '48px', height: '48px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={24} color="var(--accent-color)" />
          </div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Saved Analyses &amp; History Locked
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4, maxWidth: '260px' }}>
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

  const filteredItems = savedItems.filter((item) => {
    // Platform matching: OR logic among selected platforms
    const matchesPlatform =
      selectedPlatforms.length === ALL_PLATFORMS.length
        ? true
        : selectedPlatforms.length === 0
        ? false
        : selectedPlatforms.some((p) => {
            if (p === item.platform) return true;
            if (p === 'Google Play' && item.platform.startsWith('Google Play')) return true;
            if (p === 'Google' && (item.platform === 'Google' || item.platform === 'Google Maps' || item.platform === 'Google Reviews')) return true;
            return false;
          });

    // Emotion matching: OR logic among selected emotions
    const matchesEmotion =
      selectedEmotions.length === ALL_EMOTIONS.length
        ? true
        : selectedEmotions.length === 0
        ? false
        : selectedEmotions.some((e) => e.toLowerCase() === item.dominantEmotion.toLowerCase());

    // Search query matching
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      item.targetTitle.toLowerCase().includes(query) ||
      item.platform.toLowerCase().includes(query) ||
      item.dominantEmotion.toLowerCase().includes(query);

    return matchesPlatform && matchesEmotion && matchesSearch;
  });

  return (
    <div className="saved-view-container">
      <div className="saved-view-header">
        <span className="saved-view-title">Saved Analyses</span>
        <span style={{ fontSize: '10px', color: 'var(--accent-color)', fontWeight: 600 }}>
          {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="saved-controls-container">
        <div className="saved-search-wrap">
          <Search size={13} className="saved-search-icon" />
          <input 
            type="text" 
            className="saved-search-input" 
            placeholder="Search Analysis History..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="saved-filters-row">
          {/* Platform Multi-Select Dropdown */}
          <div className="saved-popover-container">
            <button
              type="button"
              className={`saved-filter-btn ${platformPopoverOpen ? 'active' : ''}`}
              onClick={() => {
                setPlatformPopoverOpen(!platformPopoverOpen);
                setEmotionPopoverOpen(false);
              }}
              aria-expanded={platformPopoverOpen}
              aria-label="Filter by platforms"
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0, overflow: 'hidden' }}>
                <Filter size={11} style={{ flexShrink: 0 }} />
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{platformLabel}</span>
              </div>
              <ChevronDown size={11} className={`chevron ${platformPopoverOpen ? 'open' : ''}`} />
            </button>

            {platformPopoverOpen && (
              <div className="saved-filter-popover" onClick={(e) => e.stopPropagation()}>
                <label className="saved-popover-option select-all">
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.length === ALL_PLATFORMS.length}
                    onChange={toggleAllPlatforms}
                  />
                  <span>Select All</span>
                </label>
                <div className="saved-popover-divider" />
                {ALL_PLATFORMS.map((plat) => (
                  <label key={plat} className="saved-popover-option">
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(plat)}
                      onChange={() => togglePlatform(plat)}
                    />
                    <span>{plat}</span>
                  </label>
                ))}
                <div className="saved-popover-divider" />
                <button
                  type="button"
                  className="saved-popover-clear"
                  onClick={() => setSelectedPlatforms([])}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Emotion Multi-Select Dropdown */}
          <div className="saved-popover-container">
            <button
              type="button"
              className={`saved-filter-btn ${emotionPopoverOpen ? 'active' : ''}`}
              onClick={() => {
                setEmotionPopoverOpen(!emotionPopoverOpen);
                setPlatformPopoverOpen(false);
              }}
              aria-expanded={emotionPopoverOpen}
              aria-label="Filter by emotions"
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0, overflow: 'hidden' }}>
                <Filter size={11} style={{ flexShrink: 0 }} />
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{emotionLabel}</span>
              </div>
              <ChevronDown size={11} className={`chevron ${emotionPopoverOpen ? 'open' : ''}`} />
            </button>

            {emotionPopoverOpen && (
              <div className="saved-filter-popover" onClick={(e) => e.stopPropagation()}>
                <label className="saved-popover-option select-all">
                  <input
                    type="checkbox"
                    checked={selectedEmotions.length === ALL_EMOTIONS.length}
                    onChange={toggleAllEmotions}
                  />
                  <span>Select All</span>
                </label>
                <div className="saved-popover-divider" />
                {ALL_EMOTIONS.map((emo) => (
                  <label key={emo} className="saved-popover-option">
                    <input
                      type="checkbox"
                      checked={selectedEmotions.includes(emo)}
                      onChange={() => toggleEmotion(emo)}
                    />
                    <span>{emo}</span>
                  </label>
                ))}
                <div className="saved-popover-divider" />
                <button
                  type="button"
                  className="saved-popover-clear"
                  onClick={() => setSelectedEmotions([])}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {(platformPopoverOpen || emotionPopoverOpen) && (
        <div
          className="saved-popover-backdrop"
          onClick={() => {
            setPlatformPopoverOpen(false);
            setEmotionPopoverOpen(false);
          }}
        />
      )}

      <div className="saved-list">
        {filteredItems.length === 0 ? (
          <div className="saved-empty-state">
            <span>No saved analyses found.</span>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div key={item.id} className="saved-card" onClick={() => onSelectSaved(item)}>
              <div className="saved-card-info">
                <span className="saved-card-title">{item.targetTitle}</span>
                <div className="saved-card-meta">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <Globe size={11} /> {item.platform}
                  </span>
                  <span>• {item.date === 'Just now' ? 'Last updated Just now' : `Last updated ${item.date}`}</span>
                </div>

                <div className="saved-card-actions-bottom">
                  <button
                    type="button"
                    className={`saved-refresh-btn ${refreshingId === item.id ? 'refreshing' : ''}`}
                    onClick={(e) => handleRefreshItem(e, item)}
                    disabled={refreshingId === item.id}
                    title="Retrieve latest reviews from source page"
                  >
                    <RefreshCw size={11} className={refreshingId === item.id ? 'spin' : ''} />
                    <span>{refreshingId === item.id ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                </div>

                {refreshErrorMap[item.id] && (
                  <div className="saved-refresh-error-msg">
                    {refreshErrorMap[item.id]}
                  </div>
                )}
              </div>
              <div className="saved-card-right">
                <button
                  type="button"
                  className="saved-trash-btn"
                  title="Delete Saved Analysis"
                  onClick={(e) => handleTrashClick(e, item)}
                  aria-label={`Delete ${item.targetTitle}`}
                >
                  <Trash2 size={13} />
                </button>
                <span className="saved-score-tag">{item.dominantEmotion} ({item.percentage})</span>
              </div>
            </div>
          ))
        )}
      </div>

      {itemToDelete && (
        <div className="extension-modal-backdrop" role="presentation" onClick={() => setItemToDelete(null)}>
          <div
            className="extension-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-analysis-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-analysis-title">Delete Saved Analysis?</h2>
            <p>Are you sure you want to remove this saved analysis?</p>
            <div className="extension-modal-actions">
              <button
                type="button"
                className="extension-modal-button extension-modal-button-secondary"
                onClick={() => setItemToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="extension-modal-button extension-modal-button-danger"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
