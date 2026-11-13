import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Sparkles, Trash2, Lock, BookmarkPlus,
  MessageSquare, Tag, AlertTriangle, Filter,
  Eye, SlidersHorizontal, ShieldCheck, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  createTopicReviewEntries,
  getTopicAssignmentCounts,
  getSelectedTopicView,
} from '../utils/reviewTopics.js';
import {
  getEmotionResultDisplay,
  isValidEmotionAnalysisData,
} from '../utils/emotionResultDisplay.js';
import {
  filterEligibleReviewEntries,
  isReviewEligibleForAggregates,
} from '../utils/reviewAggregateEligibility.js';
import {
  calculateReviewPriorities,
  sortPriorityReviews,
} from '../utils/priorityEngine.js';
import {
  filterReviewEvidenceEntries,
  getReviewIntegrityState,
} from '../utils/reviewEvidenceFilters.js';
import { REVIEW_INTEGRITY_RULES, DEFAULT_RIA_RULE_IDS, ALL_RIA_RULE_IDS } from '../utils/reviewIntegrityAssessment.js';
import '../css/AnalysisResults.css';
import '../css/ExtensionConfirmationModal.css';

const RIA_RULE_OPTIONS = ALL_RIA_RULE_IDS
  .map((ruleId) => Object.values(REVIEW_INTEGRITY_RULES).find((rule) => rule.id === ruleId))
  .filter(Boolean);

const EMOTION_CATEGORY_BY_ID = {
  happy: 1,
  sad: 2,
  anger: 3,
  disgust: 4,
  fear: 5,
  sarcastic: 6,
};
const PRIORITY_BADGES = {
  CRITICAL: { icon: '🔴', className: 'critical' },
  HIGH: { icon: '🟠', className: 'high' },
  MEDIUM: { icon: '🟡', className: 'medium' },
  LOW: { icon: '⚪', className: 'low' },
};

function ExpandableReviewText({
  reviewKey,
  text,
  isExpanded,
  showControl,
  onExpandedChange,
  onOverflowChange,
  className = '',
  moreLabel = 'Show more',
  lessLabel = 'Show less',
}) {
  const textRef = useRef(null);
  const checkOverflow = useCallback(() => {
    const element = textRef.current;
    if (!element) return;

    element.classList.add('quote-text--measure-collapsed');
    const hasOverflow = element.scrollHeight > element.clientHeight + 1;
    element.classList.remove('quote-text--measure-collapsed');
    onOverflowChange(reviewKey, hasOverflow);
  }, [onOverflowChange, reviewKey]);

  useLayoutEffect(() => {
    checkOverflow();
    const element = textRef.current;
    if (!element) return undefined;

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(checkOverflow);
    observer?.observe(element);
    window.addEventListener('resize', checkOverflow);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [checkOverflow, isExpanded, text]);

  return (
    <>
      <p
        ref={textRef}
        className={`quote-text ${className}${isExpanded ? '' : ' quote-text--collapsed'}`}
      >
        "{text}"
      </p>
      {showControl && (
        <button
          type="button"
          className="review-expansion-control"
          aria-expanded={isExpanded}
          onClick={() => onExpandedChange(reviewKey)}
        >
          {isExpanded ? lessLabel : moreLabel}
        </button>
      )}
    </>
  );
}

export default function AnalysisResults({
  status = 'idle',
  analysisError = '',
  isLoggedIn = false,
  onSaveRedirect,
  onOpenLogin,
  onSaveAnalysis,
  isSaving = false,
  hasSavedAnalysis = false,
  saveError = '',
  emotionData,
  reviewIntegrityAssessment = null,
  reviewIntegrityError = '',
  topicAnalysis,
  analysisProgress = null,
  onCancelAnalysis,
  scrapedReviews = [],
  onClearAnalysis,
  platform = '',
  repeatedTextCheckEnabled = false,
  qualityCheckStatus = 'not_run',
  excludeRepeatedFromEmotion = false,
  onToggleExcludeRepeated,
  isExclusionAvailable = false,
  suspiciousReviewDetectionEnabled,
  excludeFlaggedFromEmotion,
  reviewIntegrityEnabled = true,
  enabledRiaRuleIds = DEFAULT_RIA_RULE_IDS,
  onToggleRiaRule,
}) {
  const hasValidEmotionData = isValidEmotionAnalysisData(emotionData);
  const data = hasValidEmotionData
    ? emotionData
    : {
        totalReviews: 0,
        dominantEmotion: { label: 'No included reviews', emoji: '—', percentage: 0 },
        emotions: [],
        quotes: [],
        drivers: [],
        skippedReviews: [],
      };

  const [selectedEmotion, setSelectedEmotion] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedQuoteFilter, setSelectedQuoteFilter] = useState('all');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('all');
  const [selectedIntegrityFilter, setSelectedIntegrityFilter] = useState('all');
  const [userToast, setUserToast] = useState('');
  const [expandedReviews, setExpandedReviews] = useState({});
  const [expandableReviews, setExpandableReviews] = useState({});
  const [showGuestSaveModal, setShowGuestSaveModal] = useState(false);
  const [showSaveSnapshotModal, setShowSaveSnapshotModal] = useState(false);
  const [snapshotLabelInput, setSnapshotLabelInput] = useState('');
  const [snapshotNotesInput, setSnapshotNotesInput] = useState('');
  const [activeReviewPanel, setActiveReviewPanel] = useState(null);
  const [expandedFlaggedReviews, setExpandedFlaggedReviews] = useState({});
  const [expandedFlaggedComments, setExpandedFlaggedComments] = useState({});
  const [expandableFlaggedComments, setExpandableFlaggedComments] = useState({});

  const isResultsExpanded = activeReviewPanel === 'flagged';
  const showRiaConfig = activeReviewPanel === 'rules';

  const toggleReviewPanel = useCallback((panel) => {
    setActiveReviewPanel((current) => (current === panel ? null : panel));
  }, []);

  const toggleFlaggedReviewExpanded = useCallback((reviewIndex) => {
    setExpandedFlaggedReviews((prev) => ({
      ...prev,
      [reviewIndex]: !prev[reviewIndex],
    }));
  }, []);
  const toggleFlaggedCommentExpanded = useCallback((commentKey) => {
    setExpandedFlaggedComments((current) => ({
      ...current,
      [commentKey]: !current[commentKey],
    }));
  }, []);
  const handleFlaggedCommentOverflowChange = useCallback((commentKey, hasOverflow) => {
    setExpandableFlaggedComments((current) => (
      current[commentKey] === hasOverflow
        ? current
        : { ...current, [commentKey]: hasOverflow }
    ));
  }, []);

  const quotesFilterBarRef = useRef(null);
  const [canScrollQuotesLeft, setCanScrollQuotesLeft] = useState(false);
  const [canScrollQuotesRight, setCanScrollQuotesRight] = useState(false);

  const updateQuotesScrollState = useCallback(() => {
    const el = quotesFilterBarRef.current;
    if (!el) return;
    const hasScrollableContent = el.scrollWidth > el.clientWidth + 2;
    setCanScrollQuotesLeft(hasScrollableContent && el.scrollLeft > 2);
    setCanScrollQuotesRight(hasScrollableContent && (el.scrollLeft + el.clientWidth < el.scrollWidth - 2));
  }, []);

  useEffect(() => {
    updateQuotesScrollState();
    const el = quotesFilterBarRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        const canScroll = (e.deltaY > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 2) ||
                          (e.deltaY < 0 && el.scrollLeft > 2);
        if (canScroll) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
          updateQuotesScrollState();
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    const onResize = () => updateQuotesScrollState();
    window.addEventListener('resize', onResize);

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateQuotesScrollState();
      });
      resizeObserver.observe(el);
    }

    const frameId = requestAnimationFrame(() => {
      updateQuotesScrollState();
    });

    return () => {
      cancelAnimationFrame(frameId);
      if (resizeObserver) resizeObserver.disconnect();
      el.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', onResize);
    };
  }, [updateQuotesScrollState, emotionData?.emotions]);

  const scrollQuotesBar = (direction) => {
    const el = quotesFilterBarRef.current;
    if (!el) return;
    const scrollAmount = 140;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const handleReviewOverflowChange = useCallback((reviewKey, hasOverflow) => {
    setExpandableReviews((current) => (
      current[reviewKey] === hasOverflow
        ? current
        : { ...current, [reviewKey]: hasOverflow }
    ));
  }, []);
  const toggleReviewExpanded = useCallback((reviewKey) => {
    setExpandedReviews((current) => ({ ...current, [reviewKey]: !current[reviewKey] }));
  }, []);

  const getReviewText = (review) => {
    if (typeof review === 'string') return review;
    if (typeof review === 'object' && review !== null) {
      return review.text || review.reviewText || review.comment || review.review || '';
    }
    return '';
  };

  const normalizedReviews = Array.isArray(scrapedReviews)
    ? scrapedReviews
    : Array.isArray(scrapedReviews?.reviews)
      ? scrapedReviews.reviews
      : [];

  console.log('Popup review data loaded:', {
    reviewCount: normalizedReviews.length,
    platform,
  });

  const suspiciousDetection = data.suspiciousReviewDetection;
  const isDetectionEnabled = repeatedTextCheckEnabled ?? suspiciousReviewDetectionEnabled ?? (
    suspiciousDetection?.status === 'complete'
  );
  const isQualityCheckComplete = isDetectionEnabled && suspiciousDetection?.status === 'complete';

  const isRiaEnabled = reviewIntegrityEnabled;
  const flaggedReviews = isRiaEnabled && Array.isArray(reviewIntegrityAssessment)
    ? reviewIntegrityAssessment.filter((result) => (
        result?.assessmentStatus !== 'Unable to Assess'
        && Array.isArray(result?.triggeredRules)
        && result.triggeredRules.length > 0
      ))
    : [];

  const flaggedCount = flaggedReviews.length;

  const isExcludeFlagged = excludeRepeatedFromEmotion ?? excludeFlaggedFromEmotion ?? Boolean(suspiciousDetection?.filteringApplied || suspiciousDetection?.filteringEnabled);
  const handleToggleExclude = onToggleExcludeRepeated;
  const hasDuplicateMatches = Boolean(
    isQualityCheckComplete && suspiciousDetection?.flaggedCount > 0
  );
  const hasRiaFlags = Boolean(
    reviewIntegrityEnabled && Array.isArray(reviewIntegrityAssessment) && flaggedCount > 0
  );
  const eligibleFlaggedIndices = useMemo(() => {
    const indices = new Set();
    if (isQualityCheckComplete) {
      if (Array.isArray(suspiciousDetection?.results)) {
        suspiciousDetection.results.forEach((r, idx) => {
          if (r?.label === 'Repeated Review') indices.add(r?.reviewIndex ?? idx);
        });
      } else if (suspiciousDetection?.flaggedCount > 0 && Array.isArray(data.quotes)) {
        data.quotes.forEach((q, idx) => {
          if (q.suspiciousReviewLabel === 'Repeated Review') {
            indices.add(q.sourceReviewIndex ?? q.topicResultIndex ?? idx);
          }
        });
      }
    }
    if (isRiaEnabled && Array.isArray(reviewIntegrityAssessment)) {
      reviewIntegrityAssessment.forEach((r, idx) => {
        if (r?.assessmentStatus === 'Patterns Detected' || (Array.isArray(r?.triggeredRules) && r.triggeredRules.length > 0)) {
          if (r?.assessmentStatus !== 'Unable to Assess') {
            indices.add(r?.reviewIndex ?? idx);
          }
        }
      });
    }
    return indices;
  }, [isQualityCheckComplete, suspiciousDetection, isRiaEnabled, reviewIntegrityAssessment, data.quotes]);

  const totalEligibleFlaggedCount = eligibleFlaggedIndices.size > 0
    ? eligibleFlaggedIndices.size
    : (isQualityCheckComplete ? (suspiciousDetection?.flaggedCount || 0) : 0) + (isRiaEnabled ? flaggedCount : 0);

  const exclusionUsable = Boolean(
    isExclusionAvailable || (isQualityCheckComplete && hasDuplicateMatches) || hasRiaFlags || (totalEligibleFlaggedCount > 0)
  );

  const totalAssessed = Array.isArray(reviewIntegrityAssessment) ? reviewIntegrityAssessment.length : 0;
  const totalDupes = isQualityCheckComplete && Number.isSafeInteger(suspiciousDetection?.flaggedCount)
    ? suspiciousDetection.flaggedCount
    : 0;
  const hasRiaAssessment = isRiaEnabled && Array.isArray(reviewIntegrityAssessment);
  const hasChecksRun = isQualityCheckComplete || hasRiaAssessment;
  const checksUnavailable = Boolean(
    reviewIntegrityError ||
    qualityCheckStatus === 'unavailable' ||
    suspiciousDetection?.status === 'unavailable' ||
    suspiciousDetection?.status === 'invalid' ||
    (hasRiaAssessment && totalAssessed > 0 &&
      reviewIntegrityAssessment.every((result) => result?.assessmentStatus === 'Unable to Assess'))
  );
  const verdictClass = totalEligibleFlaggedCount > 0
    ? 'caution'
    : checksUnavailable
      ? 'unavailable'
      : hasChecksRun
        ? 'clean'
        : 'not-run';
  const verdictTitle = verdictClass === 'caution'
    ? 'Patterns Flagged'
    : verdictClass === 'unavailable'
      ? 'Checks Incomplete'
      : verdictClass === 'clean'
        ? 'No Patterns Detected'
        : 'Checks Not Run';
  const verdictBadge = verdictClass === 'caution'
    ? 'Caution'
    : verdictClass === 'unavailable'
      ? 'Unavailable'
      : verdictClass === 'clean'
        ? 'Clear'
        : 'Not Run';
  const verdictSubtext = verdictClass === 'caution'
    ? `${totalEligibleFlaggedCount} pattern flag${totalEligibleFlaggedCount === 1 ? '' : 's'}. Patterns alone cannot confirm whether a review is fake or genuine.`
    : verdictClass === 'unavailable'
      ? 'One or more checks could not complete, so results may be incomplete.'
      : verdictClass === 'clean'
        ? 'No patterns were detected by the completed checks.'
        : 'Run a review check to see whether any patterns were flagged.';
  const checkedCount = suspiciousDetection?.evaluatedCount || totalAssessed || normalizedReviews.length;

  const totalAnalyzedReviews = data.analyzedReviewCount ||
    (Array.isArray(data.quotes) ? data.quotes.length : 0) ||
    data.totalReviews;

  const reviewsExcludedCount = isExcludeFlagged
    ? (Number.isSafeInteger(data.excludedReviewCount)
        ? data.excludedReviewCount
        : Number.isSafeInteger(suspiciousDetection?.excludedCount)
          ? suspiciousDetection.excludedCount
          : totalEligibleFlaggedCount)
    : 0;

  const reviewsIncludedCount = isExcludeFlagged
    ? data.totalReviews
    : (data.unfilteredEmotionSummary?.totalReviews ?? (totalAnalyzedReviews || data.totalReviews));

  const excludedCount = reviewsExcludedCount;
  const selectedEmotionForData = data.emotions.find((emotion) => (
    emotion.id === selectedEmotion?.id
  )) || null;
  const activeEmotion = selectedEmotionForData
    || data.emotions.find((emotion) => emotion.label === data.dominantEmotion?.label)
    || data.emotions[0];
  const selectedCategory = selectedEmotionForData
    ? selectedEmotionForData.category ?? EMOTION_CATEGORY_BY_ID[selectedEmotionForData.id]
    : null;
  const topicReviewEntries = useMemo(
    () => createTopicReviewEntries(
      filterEligibleReviewEntries(data.quotes),
      EMOTION_CATEGORY_BY_ID,
    ),
    [data.quotes],
  );
  const emotionTopicReviewEntries = selectedCategory == null
    ? topicReviewEntries
    : topicReviewEntries.filter((entry) => entry.category === selectedCategory);
  const hasValidTopicResults = Array.isArray(topicAnalysis?.results) &&
    topicAnalysis.results.length === data.quotes.length &&
    topicAnalysis.results.every((result, index) => (
      (result?.reviewIndex == null || result.reviewIndex === index) &&
      Array.isArray(result?.topics) && result.topics.every((topic) => (
        typeof topic?.label === 'string'
      ))
    ));
  const topicStatus = hasValidTopicResults ? 'ready' : data.topicStatus;
  const { visibleTopics, activeTopic } = getSelectedTopicView(
    topicReviewEntries,
    topicAnalysis,
    selectedCategory,
    selectedTopic?.id,
  );
  const eligibleTopicResults = topicReviewEntries.map((entry) => (
    topicAnalysis?.results?.[entry.topicResultIndex]
  )).filter(Boolean);
  const topicAssignmentCounts = getTopicAssignmentCounts({ results: eligibleTopicResults });
  const topicRequestId = topicAnalysis?.clientRequestId ?? topicAnalysis?.requestId ?? null;
  useEffect(() => {
    console.info('VoxReview: Topic assignments reached rendering boundary.', {
      requestId: topicRequestId,
      reviewCount: topicReviewEntries.length,
      ...topicAssignmentCounts,
      visibleTopicCount: visibleTopics.length,
      topicStatus,
    });
  }, [
    topicReviewEntries.length,
    topicAssignmentCounts.resultCount,
    topicAssignmentCounts.reviewsWithoutTopics,
    topicAssignmentCounts.resultsWithTopics,
    topicAssignmentCounts.topicAssignmentCount,
    topicRequestId,
    topicStatus,
    visibleTopics.length,
  ]);
  const topicSubtitle = selectedEmotion
    ? `Topics discussed in the ${emotionTopicReviewEntries.length} eligible ${activeEmotion.label} reviews.`
    : `Topics discussed across ${topicReviewEntries.length} eligible reviews.`;
  const activeKeywords = activeEmotion?.keywords || [];
  const activeEmotionDisplay = getEmotionResultDisplay(activeEmotion, activeKeywords);
  const dominantEmotionDisplay = getEmotionResultDisplay(data.dominantEmotion, []);
  const representativeReviews = activeTopic?.representativeReviews || [];
  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  const eligiblePrioritySourceEntries = data.quotes
    .map((quote, originalIndex) => ({ quote, originalIndex }))
    .filter(({ quote }) => isReviewEligibleForAggregates(quote));
  const priorityReviews = eligiblePrioritySourceEntries.map(({ quote, originalIndex }) => {
    const sourceReviewIndex = Number.isSafeInteger(quote.sourceReviewIndex)
      ? quote.sourceReviewIndex
      : originalIndex;
    return {
      ...quote,
      rating: quote.rating ?? normalizedReviews[sourceReviewIndex]?.rating,
      recommendation: quote.recommendation ?? normalizedReviews[sourceReviewIndex]?.recommendation,
    };
  });
  const reviewPriorities = calculateReviewPriorities(priorityReviews, topicAnalysis);
  const prioritiesBySourceIndex = new Map(eligiblePrioritySourceEntries.map(({ originalIndex }, priorityIndex) => (
    [originalIndex, { ...reviewPriorities[priorityIndex], reviewIndex: originalIndex }]
  )));
  const quoteEntries = data.quotes.map((quote, originalIndex) => ({
    quote,
    priority: prioritiesBySourceIndex.get(originalIndex) || null,
    sourceReview: normalizedReviews[
      Number.isSafeInteger(quote.sourceReviewIndex)
        ? quote.sourceReviewIndex
        : originalIndex
    ] ?? quote,
    originalIndex,
  }));
  const getReviewIntegrity = (originalIndex, quote) => getReviewIntegrityState(
    originalIndex,
    quote,
    reviewIntegrityAssessment,
    isRiaEnabled,
    suspiciousDetection,
    isQualityCheckComplete,
  );
  const integrityFilteredEntries = sortPriorityReviews(
    filterReviewEvidenceEntries(
      quoteEntries,
      {
        emotion: selectedQuoteFilter,
        priority: selectedPriorityFilter,
        integrity: selectedIntegrityFilter,
      },
      ({ quote, originalIndex }) => getReviewIntegrity(originalIndex, quote),
    ),
  );
  const hasActiveReviewFilters = selectedQuoteFilter !== 'all' ||
    selectedPriorityFilter !== 'all' ||
    selectedIntegrityFilter !== 'all' ||
    Boolean(selectedEmotion) ||
    Boolean(selectedTopic);

  const clearReviewFilters = () => {
    setSelectedQuoteFilter('all');
    setSelectedPriorityFilter('all');
    setSelectedIntegrityFilter('all');
    setSelectedEmotion(null);
    setSelectedTopic(null);
  };

  const selectEmotion = (emotion) => {
    const isAlreadySelected = selectedEmotionForData?.id === emotion.id;
    setSelectedEmotion(isAlreadySelected ? null : emotion);
    setSelectedQuoteFilter(isAlreadySelected ? 'all' : emotion.label.toLowerCase());
  };

  const handleGuestLogIn = () => {
    setShowGuestSaveModal(false);
    if (onOpenLogin) onOpenLogin();
    else if (onSaveRedirect) onSaveRedirect();
  };

  const handleActionClick = async (actionName) => {
    if (!isLoggedIn) {
      if (actionName === 'Save Analysis') {
        setShowGuestSaveModal(true);
      }
      return;
    }
    if (actionName === 'Save Analysis') {
      setSnapshotLabelInput('');
      setSnapshotNotesInput('');
      setShowSaveSnapshotModal(true);
      return;
    } else if (actionName === 'Export PDF') setUserToast('Exporting PDF Analysis Report...');
    else if (actionName === 'Export CSV') setUserToast('Exporting CSV dataset...');
    setTimeout(() => setUserToast(''), 3000);
  };

  const handleConfirmSaveSnapshot = async (e) => {
    e?.preventDefault?.();
    setShowSaveSnapshotModal(false);
    const labelToSave = snapshotLabelInput.trim();
    const notesToSave = snapshotNotesInput.trim();
    const saved = await onSaveAnalysis?.(labelToSave, notesToSave);
    if (!saved) return;
    setUserToast(labelToSave ? `Saved as "${labelToSave}"` : 'Analysis snapshot saved successfully.');
    setTimeout(() => setUserToast(''), 3000);
  };


  const additionalReviewChecksCard = (
    <section className="additional-review-checks-card" aria-label="Additional Review Checks">
      <div className="additional-checks-header">
        <div className="additional-checks-title-group">
          <ShieldCheck size={14} className="additional-checks-icon" aria-hidden="true" />
          <h3 className="additional-checks-title">Additional Review Checks</h3>
        </div>
      </div>
      {reviewIntegrityError && (
        <p role="alert" className="analysis-error-message">
          {reviewIntegrityError}
        </p>
      )}

      {status === 'completed' && (
        <div className={`checks-verdict-banner checks-verdict-banner--${verdictClass}`}>
          <div className="checks-verdict-header">
            <div className="checks-verdict-title-group">
              {verdictClass === 'caution'
                ? <AlertTriangle size={13} className="checks-verdict-icon" aria-hidden="true" />
                : <ShieldCheck size={13} className="checks-verdict-icon" aria-hidden="true" />}
              <span className="checks-verdict-title">{verdictTitle}</span>
            </div>
            <span className="checks-verdict-badge">{verdictBadge}</span>
          </div>
          <p className="checks-verdict-subtext">{verdictSubtext}</p>
        </div>
      )}

      {status === 'completed' && hasChecksRun && (
        <div className="checks-metrics-grid" aria-label="Review checks metrics summary">
          <div className="checks-metric-item">
            <span className="checks-metric-label">Checked</span>
            <span className="checks-metric-val">{checkedCount}</span>
          </div>
          <div className="checks-metric-item">
            <span className="checks-metric-label">Exact Dupes</span>
            <span className={`checks-metric-val ${totalDupes === 0 ? 'text-emerald' : 'text-amber'}`}>
              {totalDupes}
            </span>
          </div>
          <div className="checks-metric-item">
            <span className="checks-metric-label">Pattern Flags</span>
            <span className={`checks-metric-val ${flaggedCount === 0 ? 'text-emerald' : 'text-amber'}`}>
              {flaggedCount}
            </span>
          </div>
        </div>
      )}

      {status === 'completed' && exclusionUsable && (
        <div className="emotion-analysis-filter-section" aria-label="Emotion Analysis Filter">
          <div className="emotion-filter-header">
            <div className="emotion-filter-title-group">
              <Filter size={13} className="emotion-filter-icon text-blue" aria-hidden="true" />
              <h4 className="emotion-filter-title">Emotion Analysis Filter</h4>
            </div>
            <span
              className={`emotion-filter-status-pill ${isExcludeFlagged ? 'emotion-filter-status-pill--on' : 'emotion-filter-status-pill--off'}`}
            >
              {isExcludeFlagged ? 'ON' : 'OFF'}
            </span>
          </div>

          <div className="emotion-filter-divider" />

          <div className="emotion-filter-control-row">
            <div className="emotion-filter-text">
              <label
                htmlFor="emotion-filter-toggle-switch"
                className="emotion-filter-label"
                onClick={() => handleToggleExclude?.(!isExcludeFlagged)}
              >
                Exclude flagged reviews from emotion analysis
              </label>
              <p id="emotion-filter-explanation" className="emotion-filter-explanation">
                When enabled, reviews identified by completed screening checks will not contribute to emotion scoring. Original reviews will remain visible.
              </p>
            </div>

            <div className="emotion-filter-toggle-container">
              <button
                type="button"
                role="switch"
                id="emotion-filter-toggle-switch"
                aria-checked={Boolean(isExcludeFlagged)}
                aria-label="Exclude flagged reviews from emotion analysis"
                aria-describedby="emotion-filter-explanation"
                disabled={!exclusionUsable}
                className={`emotion-filter-toggle-switch ${isExcludeFlagged ? 'emotion-filter-toggle-switch--on' : 'emotion-filter-toggle-switch--off'}`}
                onClick={() => handleToggleExclude?.(!isExcludeFlagged)}
              >
                <span className="emotion-filter-toggle-thumb" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="emotion-filter-counts" aria-live="polite">
            <div>
              <span>Reviews included in emotion analysis</span>
              <span className="emotion-count-val">{reviewsIncludedCount}</span>
            </div>
            <div>
              <span>Flagged reviews excluded from emotion analysis</span>
              <span className="emotion-count-val emotion-count-val--excluded">{excludedCount}</span>
            </div>
          </div>
        </div>
      )}

      {status === 'completed' && (
        <div className="checks-options-toolbar" role="toolbar" aria-label="Review Integrity options and view">
          <div className="checks-options-toolbar-top">
            <span className="checks-options-heading">Options</span>
            <div className="checks-options-actions">
              <button
                type="button"
                className={`checks-options-action-btn ${isResultsExpanded ? 'checks-options-action-btn--active' : ''}`}
                aria-label={isResultsExpanded ? 'Hide flagged reviews' : 'View flagged reviews'}
                title={isResultsExpanded ? 'Hide flagged reviews' : 'View flagged reviews'}
                aria-expanded={isResultsExpanded}
                aria-controls="flagged-reviews-region"
                aria-pressed={isResultsExpanded}
                onClick={() => toggleReviewPanel('flagged')}
              >
                <Eye size={12} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`checks-options-action-btn ${showRiaConfig ? 'checks-options-action-btn--active' : ''}`}
                aria-label={showRiaConfig ? 'Close Review Integrity rule configuration' : 'Configure Review Integrity rules'}
                title={`Configure Review Integrity rules (${enabledRiaRuleIds.length} selected)`}
                aria-expanded={showRiaConfig}
                aria-pressed={showRiaConfig}
                aria-controls="ria-rule-config"
                onClick={() => toggleReviewPanel('rules')}
              >
                <SlidersHorizontal size={12} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'completed' && showRiaConfig && (
        <div className="ria-config-drawer">
          <div id="ria-rule-config" className="ria-config-list" role="group" aria-label="Review Integrity rules">
            {RIA_RULE_OPTIONS.map((rule) => {
              const checked = enabledRiaRuleIds.includes(rule.id);
              const isOnlySelectedRule = checked && enabledRiaRuleIds.length === 1;
              return (
                <label
                  className={`ria-config-item${isOnlySelectedRule ? ' ria-config-item--disabled' : ''}`}
                  key={rule.id}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isOnlySelectedRule}
                    aria-label={`Enable ${rule.id}: ${rule.plainName}`}
                    onChange={() => onToggleRiaRule?.(rule.id)}
                  />
                  <span className="ria-config-item-text">
                    <strong className="ria-config-item-name">
                      {rule.plainName}
                      <span className="ria-config-item-id">{rule.id}</span>
                    </strong>
                    <span className="ria-config-item-desc">{rule.description}</span>
                  </span>
                </label>
              );
            })}
            <p className="ria-config-notice">
              Keep at least one rule selected. Pattern findings do not establish review authenticity.
            </p>
          </div>
        </div>
      )}

      {status === 'completed' && isResultsExpanded && (
        <div id="flagged-reviews-region" className="flagged-reviews-view" role="region" aria-label="Flagged Reviews">
          <div className="flagged-reviews-container" aria-label="Review Integrity Assessment">
            <div className="flagged-reviews-header">
              <div className="flagged-reviews-title-row">
                <AlertTriangle size={13} className="text-amber" aria-hidden="true" />
                <h4 className="flagged-reviews-title">Flagged Reviews ({flaggedCount})</h4>
              </div>
            </div>

            {flaggedCount === 0 ? (
              <div className="flagged-reviews-empty">
                <p>No flagged reviews in this analysis.</p>
              </div>
            ) : (
              <ul className="flagged-reviews-list" aria-label="List of flagged reviews">
                {flaggedReviews.map((result) => {
                  const isItemExpanded = Boolean(expandedFlaggedReviews[result.reviewIndex]);
                  const matchedQuote = data.quotes?.find((quote) => (
                    quote.sourceReviewIndex === result.reviewIndex
                  ));
                  const reviewComment = getReviewText(matchedQuote) ||
                    (normalizedReviews[result.reviewIndex] ? getReviewText(normalizedReviews[result.reviewIndex]) : '') ||
                    result.reviewText ||
                    '';
                  const rules = result.triggeredRules;
                  const commentKey = `flagged-${result.reviewIndex}`;
                  const isCommentExpanded = Boolean(expandedFlaggedComments[commentKey]);

                  return (
                    <li
                      key={`flagged-${result.reviewIndex}`}
                      className={`flagged-review-item ${isItemExpanded ? 'flagged-review-item--expanded' : 'flagged-review-item--collapsed'}`}
                    >
                      <div className="flagged-review-comment-section">
                        <span className="flagged-review-comment-index">
                          Comment #{result.reviewIndex + 1}
                        </span>
                        <ExpandableReviewText
                          reviewKey={commentKey}
                          text={reviewComment}
                          isExpanded={isCommentExpanded}
                          showControl={Boolean(expandableFlaggedComments[commentKey])}
                          onExpandedChange={toggleFlaggedCommentExpanded}
                          onOverflowChange={handleFlaggedCommentOverflowChange}
                          className="flagged-review-comment"
                          moreLabel="View more"
                          lessLabel="View less"
                        />
                      </div>

                      <button
                        type="button"
                        className="flagged-review-toggle-bar"
                        aria-expanded={isItemExpanded}
                        aria-label={`Review ${result.reviewIndex + 1}: ${isItemExpanded ? 'Collapse' : 'Expand'} flag details`}
                        onClick={() => toggleFlaggedReviewExpanded(result.reviewIndex)}
                      >
                        <div className="flagged-review-categories-group">
                          <div className="flagged-categories-badges">
                            {rules.map((rule) => (
                              <span
                                key={rule.id}
                                className="flagged-category-badge"
                                title={`${rule.plainName || rule.name} (${rule.id})`}
                              >
                                {rule.plainName || rule.name} · {rule.id}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flagged-chevron-indicator" aria-hidden="true">
                          {isItemExpanded ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </div>
                      </button>

                      {isItemExpanded && (
                        <div className="flagged-review-expanded-details">
                          <ul className="flagged-rule-explanations-list">
                            {rules.map((rule) => (
                              <li key={rule.id} className="flagged-rule-explanation-item">
                                <div className="flagged-rule-explanation-header">
                                  <strong className="flagged-rule-name">
                                    {rule.plainName || rule.name}
                                  </strong>
                                  <span className="flagged-rule-id"> · {rule.id}</span>
                                </div>
                                <p className="flagged-rule-explanation-text">
                                  {rule.explanation}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

          </div>
        </div>
      )}
    </section>
  );

  const reviewIntegritySection = status === 'completed'
    ? additionalReviewChecksCard
    : reviewIntegrityError
      ? <p role="alert" className="analysis-error-message">{reviewIntegrityError}</p>
      : null;

  /* ── Idle ─────────────────────────────────────────────────── */
  if (status === 'idle') {
    return (
      <div className="analysis-section">
        {analysisError && (
          <p role="alert" className="analysis-error-message">
            {analysisError}
          </p>
        )}
        {reviewIntegritySection}
        <div className="analysis-glass-card" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 16px' }}>
          <div className="hero-emoji-ring" style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={32} color="var(--accent-color)" style={{ filter: 'drop-shadow(0 0 8px rgba(37,99,235,0.4))' }} />
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            AI Emotion Analysis Engine
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0, maxWidth: '280px' }}>
            Click <strong>"Analyze Detected Page"</strong> to evaluate reviews from the active page across emotion categories.
          </p>
        </div>
      </div>
    );
  }

  /* ── Analyzing skeleton ──────────────────────────────────── */
  if (status === 'analyzing') {
    const progressLabel = analysisProgress
      ? `${analysisProgress.stage === 'topics' ? 'Topic' : 'Emotion'} analysis: ${analysisProgress.completedReviews || 0} of ${analysisProgress.totalReviews || 0} reviews`
      : 'Preparing review analysis…';
    return (
      <div className="analysis-section">
        <div className="analysis-glass-card">
          <p role="status" aria-live="polite" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '11px' }}>
            {progressLabel}
          </p>
          {onCancelAnalysis && (
            <button type="button" className="action-tool-btn secondary-clear" onClick={onCancelAnalysis}>
              Cancel analysis
            </button>
          )}
          {reviewIntegritySection}
          <div className="skeleton-box" style={{ height: '70px', borderRadius: '14px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
            <div className="skeleton-box skeleton-circle" />
            <div className="skeleton-box skeleton-line short" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="skeleton-box skeleton-line" />
            <div className="skeleton-box skeleton-line" />
            <div className="skeleton-box skeleton-line" />
          </div>
        </div>
      </div>
    );
  }

  if (status === 'completed' && !hasValidEmotionData) {
    return (
      <div className="analysis-section">
        {analysisError && (
          <p role="alert" className="analysis-error-message">
            {analysisError}
          </p>
        )}
        {reviewIntegritySection}
        <div className="analysis-glass-card" role="status">
          <h3>AI Emotion Analysis Engine</h3>
          <p>
            <strong>Emotion results unavailable.</strong> This completed analysis does not contain valid emotion results. Run the analysis again to generate them.
          </p>
        </div>
      </div>
    );
  }

  /* ── Completed ───────────────────────────────────────────── */
  return (
    <div className="analysis-section">
      {analysisProgress?.stage === 'topics' && analysisProgress.completedReviews < analysisProgress.totalReviews && (
        <p role="status" aria-live="polite" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '11px' }}>
          Topic analysis: {analysisProgress.completedReviews} of {analysisProgress.totalReviews} reviews
          {onCancelAnalysis && (
            <button type="button" className="action-tool-btn secondary-clear" onClick={onCancelAnalysis}>
              Cancel
            </button>
          )}
        </p>
      )}

      {/* 1. Overall Emotion — emotion emoji kept, animated */}
      <div className="hero-emotion-banner compact">
        <div className="hero-emotion-header-row">
          <span className="hero-emoji emotion-icon-animated">{data.dominantEmotion.emoji}</span>
          <span className="hero-tag">Overall Emotion</span>
        </div>
        <div className="hero-emotion-body">
          <span className="hero-emotion-name">{data.dominantEmotion.label}</span>
          <div className="hero-emotion-metrics">
            <span className="hero-emotion-score">{data.dominantEmotion.percentage}%</span>
            {dominantEmotionDisplay.model && (
              <span className="hero-confidence-badge">
                Model: {dominantEmotionDisplay.model}
              </span>
            )}
          </div>
        </div>
      </div>

      {data.skippedReviews?.length > 0 && (
        <p role="status" style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: 0 }}>
          {data.skippedReviews.length} {data.skippedReviews.length === 1 ? 'review was' : 'reviews were'} skipped because the language was unsupported. Skipped reviews are not included in emotion, topic, or priority results.
        </p>
      )}

      {/* Supplementary: Additional Review Checks (Immediately below Hero Banner) */}
      {reviewIntegritySection}

      {/* 2. Action Bar — Lucide icons only */}
      <div className="productivity-action-bar">
        <button className="action-tool-btn secondary-clear" onClick={onClearAnalysis}>
          <Trash2 size={13} />
          <span>Clear Analysis</span>
        </button>
        <button
          className={`action-tool-btn primary-save ${!isLoggedIn ? 'locked' : ''}`}
          onClick={() => handleActionClick('Save Analysis')}
          disabled={isLoggedIn && isSaving}
          title={!isLoggedIn
            ? 'Sign in to save analysis snapshots'
            : isSaving
              ? 'Saving analysis snapshot…'
              : hasSavedAnalysis
                ? 'Save another snapshot of this analysis'
                : 'Save the current analysis for this page'}
        >
          {!isLoggedIn ? <Lock size={13} /> : <BookmarkPlus size={13} />}
          <span>{isLoggedIn && isSaving ? 'Saving…' : isLoggedIn && hasSavedAnalysis ? 'Save Snapshot' : 'Save Analysis'}</span>
        </button>
      </div>

      {saveError && (
        <p role="alert" style={{ color: '#b91c1c', fontSize: '11px', margin: 0 }}>
          {saveError}
        </p>
      )}

      {/* Auth toast */}
      {isLoggedIn && userToast && (
        <div style={{
          background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: '8px', padding: '6px 12px', fontSize: '11px',
          fontWeight: 600, color: '#34d399', textAlign: 'center',
        }}>
          {userToast}
        </div>
      )}

      {/* 3. Donut Chart — emotion emojis kept, animated */}
      <div className="analysis-glass-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Emotion Distribution
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Tap emotion to inspect keywords</span>
        </div>

        <div className="donut-chart-wrapper">
          <div className="donut-svg-container">
            <svg className="donut-svg" viewBox="0 0 120 120">
              {data.emotions.map((item, index) => {
                const prevPercent = data.emotions.slice(0, index).reduce((acc, e) => acc + e.percentage, 0);
                const strokeDasharray = `${(item.percentage / 100) * circumference} ${circumference}`;
                const strokeDashoffset = -((prevPercent / 100) * circumference);
                return (
                  <circle
                    key={item.id}
                    className="donut-segment"
                    cx="60" cy="60" r={radius}
                    fill="none" stroke={item.color} strokeWidth="14"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    onClick={() => selectEmotion(item)}
                  />
                );
              })}
            </svg>
            <div className="donut-center-info">
              <span className="donut-center-emoji emotion-icon-animated">{activeEmotion.emoji}</span>
              <span className="donut-center-score">{activeEmotion.percentage}%</span>
              <span className="donut-center-label">{activeEmotion.label}</span>
            </div>
          </div>

          <div className="donut-legend-grid">
            {data.emotions.map((item) => (
              <div
                key={item.id}
                className={`legend-item ${selectedEmotionForData?.id === item.id ? 'active' : ''}`}
                style={{ '--emotion-item-color': item.color }}
                onClick={() => selectEmotion(item)}
                role="button"
                tabIndex={0}
              >
                <div className="legend-label-group">
                  <span className="legend-dot" style={{ backgroundColor: item.color }} />
                  <span>{item.emoji} {item.label}</span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>
                  {item.percentage}%
                  <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, color: 'var(--text-muted)' }}>
                    {item.count} reviews
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Horizontal review counts below circular chart & breakdown */}
        <div className="emotion-distribution-counts-row" aria-label="Emotion analysis review counts">
          <div className="emotion-dist-count-card">
            <div className="emotion-dist-count-header">
              <span className="emotion-dist-count-label" title="Reviews Included in Analysis">Total Reviews Analyzed</span>
              <div className="stat-icon-wrap stat-icon-wrap--primary">
                <MessageSquare size={11} className="emotion-dist-count-icon emotion-dist-count-icon--primary" />
              </div>
            </div>
            <span className="emotion-dist-count-val">{reviewsIncludedCount}</span>
          </div>
          <div className="emotion-dist-count-card">
            <div className="emotion-dist-count-header">
              <span className="emotion-dist-count-label">Flagged Reviews Excluded</span>
              <div className={`stat-icon-wrap ${reviewsExcludedCount > 0 ? 'stat-icon-wrap--amber' : 'stat-icon-wrap--muted'}`}>
                <Filter size={11} className={`emotion-dist-count-icon ${reviewsExcludedCount > 0 ? 'emotion-dist-count-icon--amber' : 'emotion-dist-count-icon--muted'}`} />
              </div>
            </div>
            <span className={`emotion-dist-count-val ${reviewsExcludedCount > 0 ? 'text-amber' : ''}`}>
              {reviewsExcludedCount}
            </span>
          </div>
        </div>

        {activeEmotion && (
          <div
            className="emotion-intelligence-card"
            style={{
              '--emotion-color': activeEmotion.color || 'var(--accent-color)',
            }}
          >
            <div className="intel-card-header">
              <div className="intel-emotion-badge">
                <span className="emotion-icon-animated">{activeEmotion.emoji}</span>
                <span>Emotion Detected: {activeEmotion.label}</span>
                <span className="intel-count-pill">
                  {activeEmotion.percentage}% · {activeEmotion.count} {activeEmotion.count === 1 ? 'review' : 'reviews'}
                </span>
              </div>
              {activeEmotionDisplay.model && (
                <div className="intel-confidence-box">
                  <span className="confidence-dot"></span>
                  <span>Model: {activeEmotionDisplay.model}</span>
                </div>
              )}
            </div>
            <div className="intel-keywords-section">
              <span className="intel-label">Emotion Evidence Phrases</span>
              <div className="keywords-tags-row">
                {activeEmotionDisplay.evidencePhrases.length > 0 ? (
                  activeEmotionDisplay.evidencePhrases.map((phrase) => (
                    <span key={phrase} className="keyword-tag">{phrase}</span>
                  ))
                ) : activeEmotionDisplay.evidenceFallback ? (
                  <div className="keyword-context-fallback">
                    <span className="keyword-context-fallback__title">
                      {activeEmotionDisplay.evidenceFallback.title}
                    </span>
                    <span className="keyword-context-fallback__description">
                      {activeEmotionDisplay.evidenceFallback.description}
                    </span>
                  </div>
                ) : (
                  <div className="keyword-empty-state">
                    <span className="keyword-empty-icon" aria-hidden="true">💬</span>
                    <div className="keyword-empty-text-wrap">
                      <span className="keyword-empty-title">No Evidence Phrases Available</span>
                      <span className="keyword-empty-desc">
                        {activeEmotion.count === 0
                          ? `No reviews were classified under ${activeEmotion.label} in this dataset.`
                          : (activeEmotionDisplay.evidenceMessage || `No distinct trigger keywords were detected for ${activeEmotion.label}.`)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Independent review-topic classification */}
      <div className="analysis-glass-card">
        <div className="topic-card-header-block">
          <h3 className="topic-card-title">
            What People Are Talking About
          </h3>
          <p className="topic-card-subtitle">{topicSubtitle}</p>
          {topicStatus === 'ready' && (
            <p className="topic-card-methodology">
              Percentages show the share of reviews in the current topic view assigned to each topic.
              Reviews may have multiple topics, so percentages may exceed 100%.
              No clear topic detected in the full analysis: {topicAssignmentCounts.reviewsWithoutTopics}
              {' of '}{topicAssignmentCounts.resultCount} reviews.
            </p>
          )}
          <span className="topic-card-hint">Tap a topic to inspect details</span>
        </div>

        {topicStatus === 'pending' && (
          <div className="topic-pending-container" role="status" aria-live="polite">
            <div className="topic-pending-header">
              <div className="topic-pulsing-dots" aria-hidden="true">
                <span className="topic-dot" />
                <span className="topic-dot" />
                <span className="topic-dot" />
              </div>
              <span className="topic-pending-title">Analyzing review topics…</span>
            </div>
            <p className="topic-pending-subtitle">
              This may take a few minutes. You can continue reviewing the emotion results.
            </p>
            <div className="topic-skeleton-grid" aria-hidden="true">
              <div className="topic-skeleton-card">
                <div className="topic-skeleton-row">
                  <div className="topic-skeleton-icon skeleton-box" />
                  <div className="topic-skeleton-label skeleton-box" />
                  <div className="topic-skeleton-count skeleton-box" />
                </div>
                <div className="topic-skeleton-bar skeleton-box" />
              </div>
              <div className="topic-skeleton-card">
                <div className="topic-skeleton-row">
                  <div className="topic-skeleton-icon skeleton-box" />
                  <div className="topic-skeleton-label skeleton-box" style={{ width: '55%' }} />
                  <div className="topic-skeleton-count skeleton-box" />
                </div>
                <div className="topic-skeleton-bar skeleton-box" style={{ width: '60%' }} />
              </div>
              <div className="topic-skeleton-card">
                <div className="topic-skeleton-row">
                  <div className="topic-skeleton-icon skeleton-box" />
                  <div className="topic-skeleton-label skeleton-box" style={{ width: '45%' }} />
                  <div className="topic-skeleton-count skeleton-box" />
                </div>
                <div className="topic-skeleton-bar skeleton-box" style={{ width: '40%' }} />
              </div>
            </div>
          </div>
        )}
        {topicStatus === 'unavailable' && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Topic insights are temporarily unavailable. Please try again.
          </p>
        )}
        {topicStatus === 'disabled' && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0' }}>
            Review topic analysis is disabled by configuration.
          </p>
        )}
        {topicStatus === 'not-analyzed' && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0' }}>
            Topic predictions are not available for this saved analysis.
          </p>
        )}
        {topicStatus === 'ready' && selectedEmotion && emotionTopicReviewEntries.length === 0 && (
          <p className="keyword-empty-message">No reviews are available for this emotion.</p>
        )}
        {topicStatus === 'ready' && visibleTopics.length > 0 && <div className="aspects-grid">
          {visibleTopics.map((topic) => {
            return (
              <button
                key={topic.id}
                type="button"
                className={`aspect-card topic-card ${activeTopic?.id === topic.id ? 'active' : ''}`}
                onClick={() => setSelectedTopic(topic)}
              >
                <div className="aspect-card-header">
                  <div className="aspect-title-group">
                    <span className="aspect-icon"><Tag size={14} strokeWidth={2} /></span>
                    <span className="aspect-name">{topic.label}</span>
                  </div>
                  <span className="aspect-score-text topic-review-count">
                    {topic.count} {topic.count === 1 ? 'review' : 'reviews'}
                  </span>
                </div>
                <div className="aspect-progress-row">
                  <div className="aspect-bar-track">
                    <div
                      className="aspect-bar-fill"
                      style={{ width: `${topic.percentage}%`, background: '#2563EB' }}
                    />
                  </div>
                  <span className="aspect-score-text">{topic.percentage.toFixed(1)}%</span>
                </div>
              </button>
            );
          })}
        </div>}
        {topicStatus === 'ready' && emotionTopicReviewEntries.length > 0 && visibleTopics.length === 0 && (
          <p className="keyword-empty-message">
            {selectedEmotion
              ? 'No topics detected in the selected reviews.'
              : 'No topics detected in the analyzed reviews.'}
          </p>
        )}
        {!data.topicStatus && (!data.topics || data.topics.length === 0) && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0' }}>
            Topic analysis is not available for this saved analysis.
          </p>
        )}
        {topicStatus === 'ready' && activeTopic && (
          <div className="emotion-intelligence-card topic-detail-card">
            <div className="intel-card-header">
              <div className="intel-emotion-badge">
                <span className="aspect-icon"><Tag size={14} /></span>
                <span>Selected Topic: {activeTopic.label}</span>
              </div>
              <div className="intel-confidence-box">
                <span>
                  {activeTopic.percentage.toFixed(1)}% · {activeTopic.count} {activeTopic.count === 1 ? 'review' : 'reviews'}
                </span>
              </div>
            </div>
            <div className="topic-evidence-section">
              <span className="intel-label">Representative Reviews</span>
              {representativeReviews.length > 0
                ? (
                  <div className="topic-evidence-list">
                    {representativeReviews.map((representativeReview, index) => (
                      <div key={`${activeTopic.id}-${representativeReview.topicResultIndex ?? index}`} className="topic-evidence-item">
                        <ExpandableReviewText
                          reviewKey={`topic:${activeTopic.id}:${representativeReview.topicResultIndex ?? index}`}
                          text={representativeReview.review}
                          isExpanded={Boolean(expandedReviews[`topic:${activeTopic.id}:${representativeReview.topicResultIndex ?? index}`])}
                          showControl={Boolean(expandableReviews[`topic:${activeTopic.id}:${representativeReview.topicResultIndex ?? index}`])}
                          onExpandedChange={toggleReviewExpanded}
                          onOverflowChange={handleReviewOverflowChange}
                        />
                      </div>
                    ))}
                  </div>
                  )
                : <span className="keyword-empty-message">No matching reviews available for this topic.</span>}
            </div>
          </div>
        )}
      </div>

      {/* 5. AI Insights — filter buttons keep emotion emojis */}
      <div className="analysis-glass-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            AI Insights
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Filter Review Evidence</span>
        </div>

        <div className="quotes-filter-scroll-wrapper">
          {canScrollQuotesLeft && (
            <button
              type="button"
              className="quotes-scroll-btn quotes-scroll-btn--left"
              onClick={() => scrollQuotesBar('left')}
              aria-label="Scroll emotions left"
            >
              <ChevronLeft size={13} />
            </button>
          )}
          <div
            ref={quotesFilterBarRef}
            className="quotes-filter-bar"
            onScroll={updateQuotesScrollState}
            role="region"
            aria-label="Emotion filters"
          >
            <button
              type="button"
              className={`filter-chip ${selectedQuoteFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedQuoteFilter('all')}
            >
              All Evidence
            </button>
            {data.emotions.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`filter-chip ${selectedQuoteFilter === e.label.toLowerCase() ? 'active' : ''}`}
                onClick={() => setSelectedQuoteFilter(e.label.toLowerCase())}
              >
                <span>{e.emoji}</span>
                <span>{e.label}</span>
              </button>
            ))}
          </div>
          {canScrollQuotesRight && (
            <button
              type="button"
              className="quotes-scroll-btn quotes-scroll-btn--right"
              onClick={() => scrollQuotesBar('right')}
              aria-label="Scroll emotions right"
            >
              <ChevronRight size={13} />
            </button>
          )}
        </div>

        <div className="review-filter-dropdowns-row">
          <label className="review-sort-control">
            <span className="review-sort-label">Priority:</span>
            <select
              aria-label="Filter reviews by priority"
              value={selectedPriorityFilter}
              onChange={(event) => setSelectedPriorityFilter(event.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </label>

          <label className="review-sort-control">
            <span className="review-sort-label">Integrity:</span>
            <select
              aria-label="Filter reviews by integrity"
              value={selectedIntegrityFilter}
              onChange={(event) => setSelectedIntegrityFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="flagged">Flagged</option>
              <option value="not_flagged">Not Flagged</option>
              <option value="unable">Unable to Assess</option>
            </select>
          </label>
        </div>

        <div className="review-filter-summary">
          <span role="status" aria-live="polite">
            Showing {integrityFilteredEntries.length} of {quoteEntries.length} reviews
          </span>
          <button
            type="button"
            className="review-filter-reset"
            aria-label="Clear all review filters"
            onClick={clearReviewFilters}
            disabled={!hasActiveReviewFilters}
          >
            Clear filters
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {integrityFilteredEntries.length === 0 ? (
            <p className="keyword-empty-message" style={{ margin: '14px 0', textAlign: 'center' }}>
              No reviews match the selected filter.
            </p>
          ) : (
            integrityFilteredEntries.map(({ quote: q, priority, originalIndex }, index) => {
              const priorityBadge = priority ? PRIORITY_BADGES[priority.level] : null;
              const reviewKey = `main:${priority?.reviewIndex ?? q.id ?? originalIndex ?? index}`;
              const isExpanded = Boolean(expandedReviews[reviewKey]);
              const integrity = getReviewIntegrity(originalIndex ?? priority?.reviewIndex ?? index, q);
              return (
              <div key={reviewKey} className={`quote-bubble ${q.aggregateEligible === false ? 'quote-bubble--excluded' : ''}`}>
                <div className="review-priority-row">
                  <div className="review-priority-left">
                    {priority ? (
                      <span
                        className={`review-priority-badge review-priority-badge--${priorityBadge.className}`}
                        title={priority.explanation}
                        aria-label={`Priority: ${priority.level}`}
                      >
                        <span aria-hidden="true">{priorityBadge.icon}</span>
                        <span>{priority.level}</span>
                      </span>
                    ) : (
                      <span className="review-priority-badge review-priority-badge--excluded">
                        Excluded from Aggregates
                      </span>
                    )}
                  </div>

                  <div className="review-priority-right">
                    {/* Individual Review Integrity Badges */}
                    {integrity.isExactDupe && (
                      <span
                        className="review-integrity-badge review-integrity-badge--duplicate"
                        title="Exact duplicate text matched across reviews in this analysis"
                      >
                        Exact Duplicate
                      </span>
                    )}
                    {integrity.isPatternFlagged && (
                      <span
                        className="review-integrity-badge review-integrity-badge--pattern"
                        title={integrity.triggeredRuleDescriptions || 'Text patterns detected by Review Integrity check'}
                      >
                        Pattern Flagged{integrity.triggeredRuleIds.length > 0 ? ` · ${integrity.triggeredRuleIds.join(', ')}` : ''}
                      </span>
                    )}
                    {q.suspiciousReviewLabel &&
                      q.suspiciousReviewLabel !== 'Likely Authentic' &&
                      q.suspiciousReviewLabel !== 'Repeated Review' && (
                        <span
                          className="review-integrity-badge review-integrity-badge--pattern"
                          title={q.suspiciousReviewReason || 'Flagged by review screening'}
                        >
                          {q.suspiciousReviewLabel}
                        </span>
                    )}
                    {!integrity.isExactDupe && !integrity.isPatternFlagged && (
                      <>
                        {integrity.isUnableToAssess && (
                          <span
                            className="review-integrity-badge review-integrity-badge--unable"
                            title={integrity.assessmentReason || 'Review text could not be reliably assessed'}
                          >
                            Unable to Assess
                          </span>
                        )}
                        {integrity.isNoPatternDetected && (
                          <span
                            className="review-integrity-badge review-integrity-badge--clear"
                            title="No suspicious textual patterns detected"
                          >
                            No Pattern Detected
                          </span>
                        )}
                        {integrity.isNotAssessed && (
                          <span
                            className="review-integrity-badge review-integrity-badge--not-assessed"
                            title="Review Integrity assessment was not run"
                          >
                            Not Assessed
                          </span>
                        )}
                      </>
                    )}

                    {q.aggregateEligible === false ? (
                      <span className="review-exclusion-badge" title="Excluded from emotion, topic, and priority aggregates">
                        · excluded from aggregates
                      </span>
                    ) : (
                      <span className="review-inclusion-badge" title="Included in emotion, topic, and priority aggregates">
                        · included in aggregates
                      </span>
                    )}

                    {import.meta.env.DEV && priority && (
                      <span className="review-priority-debug">Score {priority.score}</span>
                    )}
                  </div>
                </div>

                <ExpandableReviewText
                  reviewKey={reviewKey}
                  text={q.text}
                  isExpanded={isExpanded}
                  showControl={Boolean(expandableReviews[reviewKey])}
                  onExpandedChange={toggleReviewExpanded}
                  onOverflowChange={handleReviewOverflowChange}
                />

                <div className="quote-meta-row quote-footer">
                  <div className="quote-meta-primary">
                    <span className="quote-emotion-pill">
                      {q.emoji === '💬' ? <MessageSquare size={10} /> : <span>{q.emoji}</span>}
                      <span>{q.emotion}</span>
                      {q.driver && <span className="quote-driver-bullet">•</span>}
                      {q.driver && <span className="quote-driver-text">{q.driver}</span>}
                    </span>
                    {q.recommendation && (
                      <span className={`quote-recommendation-pill quote-recommendation-pill--${q.recommendation}`}>
                        {q.recommendation === 'positive' ? '👍 Recommended' : '👎 Not recommended'}
                      </span>
                    )}
                  </div>
                  <div className="quote-meta-secondary">
                    {q.author && <span className="quote-author-text">{q.author}</span>}
                    {q.author && q.date && <span className="quote-meta-bullet">•</span>}
                    {q.date && <span className="quote-date-text">{q.date}</span>}
                  </div>
                </div>
              </div>
            );
          }))}
        </div>
      </div>

      {/* ── Save Analysis Snapshot Modal ── */}
      {showSaveSnapshotModal && (
        <div
          className="extension-modal-backdrop"
          role="presentation"
          onClick={() => setShowSaveSnapshotModal(false)}
        >
          <div
            className="extension-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-snapshot-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="save-snapshot-modal-title">Save Analysis Snapshot</h2>
            <p style={{ margin: '0 0 14px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Save an independent snapshot of this analysis to track how reviews and sentiment evolve over time.
            </p>
            <form onSubmit={handleConfirmSaveSnapshot}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                <label
                  htmlFor="snapshot-label-input"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Snapshot Label (Optional)
                </label>
                <input
                  id="snapshot-label-input"
                  type="text"
                  className="saved-search-input"
                  style={{ padding: '8px 12px', fontSize: '11px' }}
                  placeholder="e.g. Initial Analysis, October Update"
                  value={snapshotLabelInput}
                  onChange={(e) => setSnapshotLabelInput(e.target.value)}
                  maxLength={50}
                  autoFocus
                />
                <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                  Leave blank to auto-generate a label (e.g. Analysis 1, Analysis 2).
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                <label
                  htmlFor="snapshot-notes-input"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Personal Notes (Optional)
                </label>
                <textarea
                  id="snapshot-notes-input"
                  className="extension-notes-textarea"
                  placeholder="Add notes, reminders, or context for this snapshot..."
                  value={snapshotNotesInput}
                  onChange={(e) => setSnapshotNotesInput(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
                <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                  Notes are saved with your cloud snapshot. Avoid personal or sensitive information; notes are not automatically screened.
                </span>
              </div>
              <div className="extension-modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="extension-modal-button extension-modal-button-secondary"
                  onClick={() => setShowSaveSnapshotModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="extension-modal-button extension-modal-button-primary"
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save Snapshot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Guest Mode "Save Analysis" Restriction Modal ── */}
      {showGuestSaveModal && (
        <div
          className="extension-modal-backdrop"
          role="presentation"
          onClick={() => setShowGuestSaveModal(false)}
        >
          <div
            className="extension-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-save-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="guest-save-modal-title">Saved Analysis Unavailable in Guest Mode</h2>
            <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>
              Saved Analysis is not available in Guest Mode.
              <br />
              Please sign up or log in to save and access your analyses.
            </p>
            <div className="extension-modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="extension-modal-button extension-modal-button-secondary"
                onClick={() => setShowGuestSaveModal(false)}
              >
                Not Now
              </button>
              <button
                type="button"
                className="extension-modal-button extension-modal-button-primary"
                onClick={handleGuestLogIn}
              >
                Sign Up / Log In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
