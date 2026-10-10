import { useState, useEffect } from 'react';
import { Lock, Globe, Trash2, RefreshCw, Search, Filter, ChevronDown } from 'lucide-react';
import { clearAllPageAnalyses, getPageAnalyses, getPageKey, deleteAnalysisForPage } from '../../services/pageAnalysisStorage.js';
import {
  filterSavedAnalyses,
  SAVED_EMOTION_OPTIONS,
  SAVED_PLATFORM_OPTIONS,
  toggleSavedFilterSelection,
} from '../utils/savedAnalysisFilters.js';
import '../css/SavedAnalysesView.css';
import '../css/ExtensionConfirmationModal.css';

const ALL_PLATFORMS = SAVED_PLATFORM_OPTIONS;
const ALL_EMOTIONS = SAVED_EMOTION_OPTIONS;

export default function SavedAnalysesView({ isLoggedIn = false, onLoginClick, onSelectSaved, onRefreshSaved, onOpenSavedPage, onAnalyzeNewReviews, onSavedCountChange }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState([...ALL_PLATFORMS]);
  const [selectedEmotions, setSelectedEmotions] = useState([...ALL_EMOTIONS]);
  const [platformPopoverOpen, setPlatformPopoverOpen] = useState(false);
  const [emotionPopoverOpen, setEmotionPopoverOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const [refreshErrorMap, setRefreshErrorMap] = useState({});
  const [refreshMessageMap, setRefreshMessageMap] = useState({});
  const [pendingReviewMap, setPendingReviewMap] = useState({});
  const [openPromptId, setOpenPromptId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [analyzingNewId, setAnalyzingNewId] = useState(null);
  const [lastCheckedMap, setLastCheckedMap] = useState({});
  const [deleteError, setDeleteError] = useState('');
  const [clearAllError, setClearAllError] = useState('');
  const [showClearAllConfirmation, setShowClearAllConfirmation] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [savedItems, setSavedItems] = useState([]);

  const reloadSavedItems = async () => {
    const storedMap = await getPageAnalyses();
    const storedItems = Object.values(storedMap);
    setSavedItems(storedItems);
    onSavedCountChange?.(Object.keys(storedMap).length);
  };

  useEffect(() => {
    let isMounted = true;
    getPageAnalyses().then((storedMap) => {
      if (!isMounted) return;
      const storedItems = Object.values(storedMap);
      setSavedItems(storedItems);
      onSavedCountChange?.(Object.keys(storedMap).length);
    }).catch((error) => {
      if (import.meta.env.DEV) console.error('VoxReview: Could not load saved analyses:', error);
    });
    return () => { isMounted = false; };
  }, [onSavedCountChange]);

  const togglePlatform = (plat) => {
    setSelectedPlatforms((current) => toggleSavedFilterSelection(current, plat, ALL_PLATFORMS));
  };

  const toggleAllPlatforms = () => {
    setSelectedPlatforms([...ALL_PLATFORMS]);
  };

  const toggleEmotion = (emo) => {
    setSelectedEmotions((current) => toggleSavedFilterSelection(current, emo, ALL_EMOTIONS));
  };

  const toggleAllEmotions = () => {
    setSelectedEmotions([...ALL_EMOTIONS]);
  };

  const platformLabel = (() => {
    if (selectedPlatforms.length === 0 || selectedPlatforms.length === ALL_PLATFORMS.length) return 'All Platforms';
    if (selectedPlatforms.length === 0) return '0 Platforms';
    if (selectedPlatforms.length === 1) return selectedPlatforms[0];
    return `${selectedPlatforms.length} Platforms`;
  })();

  const emotionLabel = (() => {
    if (selectedEmotions.length === 0 || selectedEmotions.length === ALL_EMOTIONS.length) return 'All Emotions';
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
    const targetKey = getPageKey(itemToDelete.platform, itemToDelete.page_url) || itemToDelete.pageKey;
    try {
      await deleteAnalysisForPage(targetKey);
      await reloadSavedItems();
      setDeleteError('');
      setItemToDelete(null);
    } catch (error) {
      if (import.meta.env.DEV) console.error('VoxReview: Could not delete saved analysis:', error);
      setDeleteError('Unable to delete this saved analysis. Please try again.');
    }
  };

  const confirmClearAll = async () => {
    if (isClearingAll) return;
    setIsClearingAll(true);
    setClearAllError('');
    try {
      await clearAllPageAnalyses();
      await reloadSavedItems();
      setShowClearAllConfirmation(false);
    } catch (error) {
      if (import.meta.env.DEV) console.error('VoxReview: Could not clear saved analyses:', error);
      setClearAllError('Unable to clear saved analyses. Please try again.');
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleRefreshItem = async (e, item) => {
    e.stopPropagation();
    if (refreshingId) return;
    const itemKey = getPageKey(item.platform, item.page_url) || item.pageKey;

    setRefreshingId(itemKey);
    setRefreshErrorMap((prev) => ({ ...prev, [itemKey]: null }));
    setRefreshMessageMap((prev) => ({ ...prev, [itemKey]: null }));
    setOpenPromptId(null);

    try {
      const refreshed = await onRefreshSaved?.(item);
      if (refreshed?.needsOpen) {
        setOpenPromptId(itemKey);
        return;
      }
      if (!refreshed?.success) {
        throw new Error(refreshed?.error || 'Unable to refresh this analysis. Please check that the original page is available.');
      }
      setPendingReviewMap((prev) => ({ ...prev, [itemKey]: refreshed.newReviews || [] }));
      setLastCheckedMap((prev) => ({ ...prev, [itemKey]: refreshed.lastRefreshedAt || refreshed.record?.last_refreshed_at }));
      await reloadSavedItems();
      setRefreshMessageMap((prev) => ({ ...prev, [itemKey]: refreshed.message }));
    } catch (err) {
      if (import.meta.env.DEV) console.error('VoxReview: Could not rescan saved page:', err);
      setRefreshErrorMap((prev) => ({
        ...prev,
        [itemKey]: 'Unable to refresh this analysis. Please check that the original page is available.'
      }));
    } finally {
      setRefreshingId(null);
    }
  };

  const handleOpenProductPage = async (item) => {
    const itemKey = getPageKey(item.platform, item.page_url) || item.pageKey;
    setOpeningId(itemKey);
    setOpenPromptId(null);
    setRefreshErrorMap((prev) => ({ ...prev, [itemKey]: null }));
    try {
      const refreshed = await onOpenSavedPage?.(item);
      if (!refreshed?.success) throw new Error(refreshed?.error || 'Unable to refresh this analysis. Please check that the original page is available.');
      setPendingReviewMap((prev) => ({ ...prev, [itemKey]: refreshed.newReviews || [] }));
      setLastCheckedMap((prev) => ({ ...prev, [itemKey]: refreshed.lastRefreshedAt || refreshed.record?.last_refreshed_at }));
      await reloadSavedItems();
      setRefreshMessageMap((prev) => ({ ...prev, [itemKey]: refreshed.message }));
    } catch (error) {
      setRefreshErrorMap((prev) => ({
        ...prev,
        [itemKey]: error.message || 'Unable to refresh this analysis. Please check that the original page is available.',
      }));
    } finally {
      setOpeningId(null);
    }
  };

  const handleAnalyzeNewReviews = async (item) => {
    const itemKey = getPageKey(item.platform, item.page_url) || item.pageKey;
    const pendingReviews = pendingReviewMap[itemKey] || [];
    if (pendingReviews.length === 0 || analyzingNewId) return;
    setAnalyzingNewId(itemKey);
    setRefreshErrorMap((prev) => ({ ...prev, [itemKey]: null }));
    try {
      const result = await onAnalyzeNewReviews?.(item, pendingReviews);
      if (!result?.success) throw new Error(result?.error || 'Unable to analyze the new reviews.');
      setPendingReviewMap((prev) => ({ ...prev, [itemKey]: [] }));
      await reloadSavedItems();
      setRefreshMessageMap((prev) => ({ ...prev, [itemKey]: `${pendingReviews.length} new reviews analyzed` }));
    } catch (error) {
      setRefreshErrorMap((prev) => ({
        ...prev,
        [itemKey]: error.message || 'Unable to analyze the new reviews. Please try again.',
      }));
    } finally {
      setAnalyzingNewId(null);
    }
  };

  const formatLastChecked = (timestamp) => {
    if (!timestamp) return '';
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - Number(timestamp)) / 60000));
    if (elapsedMinutes < 1) return 'just now';
    if (elapsedMinutes < 60) return `${elapsedMinutes} ${elapsedMinutes === 1 ? 'minute' : 'minutes'} ago`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours} ${elapsedHours === 1 ? 'hour' : 'hours'} ago`;
    const elapsedDays = Math.floor(elapsedHours / 24);
    return `${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'} ago`;
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
            Log in to view your Saved Analyses and access Analysis History across platforms.
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

  const filteredItems = filterSavedAnalyses(savedItems, {
    searchQuery,
    platforms: selectedPlatforms,
    emotions: selectedEmotions,
  });

  return (
    <div className="saved-view-container">
      <div className="saved-view-header">
        <span className="saved-view-title">Saved Analyses</span>
        <div className="saved-view-header-actions">
          <span className="saved-count-chip">
            {savedItems.length} {savedItems.length === 1 ? 'item' : 'items'}
          </span>
          <button
            type="button"
            className="saved-clear-all-btn"
            onClick={() => { setClearAllError(''); setShowClearAllConfirmation(true); }}
            disabled={savedItems.length === 0 || isClearingAll}
            title={savedItems.length === 0 ? 'No saved analyses to clear' : 'Clear all saved analyses'}
          >
            <Trash2 size={12} className="saved-clear-icon" />
            <span>Clear All</span>
          </button>
        </div>
      </div>

      {deleteError && <p role="alert" className="saved-refresh-error-msg">{deleteError}</p>}
      {clearAllError && <p role="alert" className="saved-refresh-error-msg">{clearAllError}</p>}

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
                    checked={selectedPlatforms.length === 0 || selectedPlatforms.length === ALL_PLATFORMS.length}
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
                    onClick={() => setSelectedPlatforms([...ALL_PLATFORMS])}
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
                    checked={selectedEmotions.length === 0 || selectedEmotions.length === ALL_EMOTIONS.length}
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
                  onClick={() => setSelectedEmotions([...ALL_EMOTIONS])}
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
            <div key={getPageKey(item.platform, item.page_url) || item.pageKey || item.id} className="saved-card" onClick={() => onSelectSaved(item)}>
              <div className="saved-card-info">
                <span className="saved-card-title">{item.targetTitle}</span>
                <div className="saved-card-meta">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <Globe size={11} /> {item.platform}
                  </span>
                  <span>• {item.date === 'Just now' ? 'Last updated Just now' : `Last updated ${item.date}`}</span>
                </div>
                {(lastCheckedMap[getPageKey(item.platform, item.page_url) || item.pageKey] || item.last_refreshed_at) && (
                  <div className="saved-card-last-checked">
                    Last checked: {formatLastChecked(lastCheckedMap[getPageKey(item.platform, item.page_url) || item.pageKey] || item.last_refreshed_at)}
                  </div>
                )}

                <div className="saved-card-actions-bottom">
                  <button
                    type="button"
                    className={`saved-refresh-btn ${refreshingId === (getPageKey(item.platform, item.page_url) || item.pageKey) ? 'refreshing' : ''}`}
                    onClick={(e) => handleRefreshItem(e, item)}
                    disabled={refreshingId === (getPageKey(item.platform, item.page_url) || item.pageKey)}
                    title="Retrieve latest reviews from source page"
                  >
                    <RefreshCw size={11} className={refreshingId === (getPageKey(item.platform, item.page_url) || item.pageKey) ? 'spin' : ''} />
                    <span>{refreshingId === (getPageKey(item.platform, item.page_url) || item.pageKey) ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                </div>

                {refreshErrorMap[getPageKey(item.platform, item.page_url) || item.pageKey] && (
                  <div className="saved-refresh-error-msg">
                    {refreshErrorMap[getPageKey(item.platform, item.page_url) || item.pageKey]}
                  </div>
                )}
                {refreshMessageMap[getPageKey(item.platform, item.page_url) || item.pageKey] && (
                  <div className="saved-refresh-status-msg" role="status">
                    {refreshMessageMap[getPageKey(item.platform, item.page_url) || item.pageKey]}
                  </div>
                )}
                {pendingReviewMap[getPageKey(item.platform, item.page_url) || item.pageKey]?.length > 0 && (
                  <button
                    type="button"
                    className="saved-analyze-new-btn"
                    onClick={(event) => { event.stopPropagation(); void handleAnalyzeNewReviews(item); }}
                    disabled={analyzingNewId === (getPageKey(item.platform, item.page_url) || item.pageKey)}
                  >
                    {analyzingNewId === (getPageKey(item.platform, item.page_url) || item.pageKey)
                      ? 'Analyzing new reviews...'
                      : `Analyze ${pendingReviewMap[getPageKey(item.platform, item.page_url) || item.pageKey].length} New Reviews`}
                  </button>
                )}
                {openPromptId === (getPageKey(item.platform, item.page_url) || item.pageKey) && (
                  <div className="saved-open-page-prompt" role="group" aria-label="Open original product page">
                    <span>The original product page needs to be opened to refresh reviews.</span>
                    <div className="saved-open-page-actions">
                      <button
                        type="button"
                        className="saved-analyze-new-btn"
                        onClick={(event) => { event.stopPropagation(); void handleOpenProductPage(item); }}
                        disabled={openingId === (getPageKey(item.platform, item.page_url) || item.pageKey)}
                      >
                        {openingId === (getPageKey(item.platform, item.page_url) || item.pageKey) ? 'Opening...' : 'Open Product Page'}
                      </button>
                      <button
                        type="button"
                        className="saved-prompt-cancel-btn"
                        onClick={(event) => { event.stopPropagation(); setOpenPromptId(null); }}
                        disabled={openingId === (getPageKey(item.platform, item.page_url) || item.pageKey)}
                      >
                        Cancel
                      </button>
                    </div>
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

      {showClearAllConfirmation && (
        <div className="extension-modal-backdrop" role="presentation" onClick={() => !isClearingAll && setShowClearAllConfirmation(false)}>
          <div
            className="extension-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-all-analyses-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="clear-all-analyses-title">Clear All Saved Analyses?</h2>
            <p>Are you sure you want to delete all saved analyses? This action cannot be undone.</p>
            <div className="extension-modal-actions">
              <button
                type="button"
                className="extension-modal-button extension-modal-button-secondary"
                onClick={() => setShowClearAllConfirmation(false)}
                disabled={isClearingAll}
              >
                Cancel
              </button>
              <button
                type="button"
                className="extension-modal-button extension-modal-button-danger"
                onClick={confirmClearAll}
                disabled={isClearingAll}
              >
                {isClearingAll ? 'Deleting…' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
