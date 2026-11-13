import {
  sanitizeHelpfulCount,
  sanitizeReviewForAnalysis,
  sanitizeReviewObject,
  sanitizeReviewText,
} from './privacyRedaction.js';
import { getTopicReviewSetSignature } from '../Users/utils/topicAnalysisRequest.js';

export const PRIVACY_MIGRATION_VERSION = 2;
export const PRIVACY_MIGRATION_VERSION_KEY = 'voxreview_privacy_migration_version';
export const LAST_SCRAPE_STORAGE_KEY = 'voxreviewLastScrape';
export const ACTIVE_ANALYSIS_STORAGE_KEY = 'voxreview_active_analysis_states';
const DATA_MINIMIZED_PLATFORMS = new Set(['steam', 'googleplay', 'shopee', 'lazada']);
const HELPFULNESS_METRICS = new Set(['helpful_votes', 'review_likes']);
const REVIEW_TEXT_FIELDS = new Set([
  'text',
  'reviewText',
  'review',
  'comment',
  'content',
  'body',
  'reviewBody',
  'excerpt',
  'phrase',
]);
const REVIEW_NESTED_FIELDS = new Set([
  'review',
  'quote',
  'quotes',
  'reviewEvidence',
  'representativeReview',
  'representativeReviews',
  'fallbackEvidence',
  'evidence',
]);
const REVIEW_LINKED_ID_FIELDS = new Set([
  'reviewer',
  'reviewername',
  'username',
  'user',
  'author',
  'authorname',
  'profileurl',
  'profilelink',
  'profilepictureurl',
  'profileimageurl',
  'avatarurl',
  'avatar',
  'profilepicture',
  'profileimage',
  'memberurl',
  'memberlink',
  'userprofileurl',
  'authorprofileurl',
  'reviewerprofileurl',
  'customername',
  'displayname',
  'fullname',
  'firstname',
  'lastname',
  'email',
  'phonenumber',
  'phone',
  'address',
  'reviewerid',
  'revieweraccountid',
  'accountid',
  'commentid',
  'reviewid',
  'platformreviewid',
  'platformuserid',
  'recommendationid',
  'authorid',
  'userid',
  'memberid',
  'customerid',
]);

function isDataMinimizedPlatform(platform) {
  return DATA_MINIMIZED_PLATFORMS.has(String(platform || '').trim().toLowerCase());
}

function sanitizeProductImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function sanitizeProductMediaType(value) {
  return value === 'image' || value === 'video' ? value : null;
}

const chromeKeys = [
  LAST_SCRAPE_STORAGE_KEY,
  ACTIVE_ANALYSIS_STORAGE_KEY,
  PRIVACY_MIGRATION_VERSION_KEY,
];
const localStorageKeys = [
  ACTIVE_ANALYSIS_STORAGE_KEY,
  PRIVACY_MIGRATION_VERSION_KEY,
];
let chromeMigrationInFlight = null;
let localStorageMigrationInFlight = null;

function migrationError() {
  return new Error('Stored review data could not be safely privacy-migrated.');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value) {
  if (!isRecord(value)) throw migrationError();
  return value;
}

function addHelpfulnessMetadata(record) {
  if (!['helpfulCount', 'helpfulnessMetric', 'helpfulnessAvailable']
    .some((key) => Object.hasOwn(record, key))) return;
  const count = sanitizeHelpfulCount(record.helpfulCount);
  const metric = HELPFULNESS_METRICS.has(record.helpfulnessMetric)
    ? record.helpfulnessMetric
    : null;
  const available = record.helpfulnessAvailable === true && count !== null && metric !== null;
  record.helpfulCount = available ? count : null;
  record.helpfulnessMetric = available ? metric : null;
  record.helpfulnessAvailable = available;
}

function sanitizeRecognizedReviewResult(value, platform, isReviewRecord = false) {
  if (typeof value === 'string') return sanitizeReviewText(value);
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeRecognizedReviewResult(entry, platform, isReviewRecord));
  }
  if (!isRecord(value)) return value;

  const hasReviewText = Object.entries(value).some(([key, entry]) => (
    REVIEW_TEXT_FIELDS.has(key) && typeof entry === 'string'
  ));
  const reviewRecord = isReviewRecord || hasReviewText;
  const next = {};

  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (REVIEW_LINKED_ID_FIELDS.has(normalizedKey)) continue;
    if (key === 'id' && isDataMinimizedPlatform(platform) && reviewRecord) continue;

    if (REVIEW_TEXT_FIELDS.has(key) && typeof entry === 'string') {
      next[key] = sanitizeReviewText(entry);
    } else if (REVIEW_NESTED_FIELDS.has(key)) {
      next[key] = sanitizeRecognizedReviewResult(entry, platform, true);
    } else if (Array.isArray(entry) || isRecord(entry)) {
      next[key] = sanitizeRecognizedReviewResult(entry, platform, false);
    } else {
      next[key] = entry;
    }
  }

  return next;
}

function mapReviewArray(value, mapper, platform) {
  if (!Array.isArray(value)) throw migrationError();
  return value.map((entry) => {
    if (typeof entry === 'string') return sanitizeReviewText(entry);
    if (!isRecord(entry)) throw migrationError();
    return mapper(entry, platform);
  });
}

function sanitizeReviewCopies(value, platform) {
  const next = { ...requireRecord(value) };
  for (const key of ['reviews', 'reviewAnalysis', 'skippedReviews']) {
    if (next[key] === undefined) continue;
    if (!Array.isArray(next[key])) throw migrationError();
    next[key] = next[key].map((entry) => {
      if (!isRecord(entry)) throw migrationError();
      const copy = sanitizeRecognizedReviewResult(sanitizeReviewObject(entry), platform, true);
      if (copy.review !== undefined) {
        if (typeof copy.review !== 'string' && !isRecord(copy.review)) throw migrationError();
        if (isRecord(copy.review)) copy.review = sanitizeReviewForAnalysis(copy.review, platform);
      }
      if (isDataMinimizedPlatform(platform)) {
        addHelpfulnessMetadata(copy);
      }
      if (copy.emotionDrivers !== undefined) {
        if (!Array.isArray(copy.emotionDrivers) || copy.emotionDrivers.some((driver) => typeof driver !== 'string')) {
          throw migrationError();
        }
        copy.emotionDrivers = copy.emotionDrivers.map(sanitizeReviewText);
      }
      if (copy.contextualResolution?.explanation !== undefined) {
        if (typeof copy.contextualResolution.explanation !== 'string') throw migrationError();
        copy.contextualResolution = {
          ...requireRecord(copy.contextualResolution),
          explanation: sanitizeReviewText(copy.contextualResolution.explanation),
        };
      }
      return copy;
    });
  }
  return next;
}

function sanitizeTopicEvidence(value, platform) {
  if (typeof value === 'string') return sanitizeReviewText(value);
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === 'string') return sanitizeReviewText(entry);
      if (!isRecord(entry)) throw migrationError();
      const sanitized = sanitizeRecognizedReviewResult(sanitizeReviewObject(entry), platform, true);
      if (isDataMinimizedPlatform(platform)) {
        for (const key of ['productImage']) {
          delete sanitized[key];
        }
        addHelpfulnessMetadata(sanitized);
      }
      return sanitized;
    });
  }
  if (isRecord(value)) {
    const sanitized = sanitizeRecognizedReviewResult(sanitizeReviewObject(value), platform, true);
    if (isDataMinimizedPlatform(platform)) {
      for (const key of ['productImage']) {
        delete sanitized[key];
      }
      addHelpfulnessMetadata(sanitized);
    }
    return sanitized;
  }
  throw migrationError();
}

function sanitizeTopicTree(value, platform) {
  if (Array.isArray(value)) return value.map((entry) => sanitizeTopicTree(entry, platform));
  if (!isRecord(value)) return value;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'keywordScores') {
      const scoreMap = requireRecord(entry);
      next[key] = Object.fromEntries(
        Object.entries(scoreMap).map(([term, scores]) => [sanitizeReviewText(term), scores]),
      );
    } else if ([
      'reviewEvidence',
      'representativeReviews',
      'representativeReview',
      'reviews',
      'evidence',
      'fallbackEvidence',
      'excerpt',
      'phrase',
      'keywords',
    ].includes(key)) {
      next[key] = sanitizeTopicEvidence(entry, platform);
    } else if (key === 'review') {
      if (typeof entry === 'string') next[key] = sanitizeReviewText(entry);
      else if (isRecord(entry)) next[key] = sanitizeReviewForAnalysis(entry, platform);
      else throw migrationError();
    } else {
      next[key] = sanitizeTopicTree(entry, platform);
    }
  }
  return next;
}

function sanitizeEmotionData(value, platform) {
  if (value == null) return value;
  const next = { ...requireRecord(value) };
  if (next.quotes !== undefined) {
    if (!Array.isArray(next.quotes)) throw migrationError();
    next.quotes = next.quotes.map((quote) => {
      const sanitized = sanitizeRecognizedReviewResult(
        sanitizeReviewObject(requireRecord(quote)),
        platform,
        true,
      );
      if (sanitized.text !== undefined && typeof sanitized.text !== 'string') throw migrationError();
      if (isDataMinimizedPlatform(platform)) {
        addHelpfulnessMetadata(sanitized);
      }
      return sanitized;
    });
  }
  if (next.emotions !== undefined) next.emotions = sanitizeTopicTree(next.emotions, platform);
  if (next.topics !== undefined) next.topics = sanitizeTopicTree(next.topics, platform);
  return next;
}

export function sanitizeLegacyAnalysisRecord(value) {
  const next = { ...requireRecord(value) };
  const platform = next.platform;
  if (next.productImage !== undefined) next.productImage = sanitizeProductImageUrl(next.productImage);
  if (next.productMediaType !== undefined) {
    next.productMediaType = sanitizeProductMediaType(next.productMediaType);
  }
  if (next.reviews !== undefined) {
    next.reviews = mapReviewArray(next.reviews, sanitizeReviewForAnalysis, platform);
  }
  if (next.reviewAnalysis !== undefined) {
    next.reviewAnalysis = sanitizeReviewCopies({ reviewAnalysis: next.reviewAnalysis }, platform).reviewAnalysis;
  }
  if (next.skippedReviews !== undefined) {
    next.skippedReviews = sanitizeReviewCopies({ skippedReviews: next.skippedReviews }, platform).skippedReviews;
  }
  if (next.emotionData !== undefined) next.emotionData = sanitizeEmotionData(next.emotionData, platform);
  if (next.topicAnalysis !== undefined && next.topicAnalysis !== null) {
    next.topicAnalysis = sanitizeTopicTree(requireRecord(next.topicAnalysis), platform);
  }
  for (const key of ['priorityResults', 'suspiciousReviewDetection']) {
    if (next[key] !== undefined && next[key] !== null) {
      next[key] = sanitizeRecognizedReviewResult(next[key], platform);
    }
  }
  if (next.reviewScreeningMetadata !== undefined && next.reviewScreeningMetadata !== null) {
    next.reviewScreeningMetadata = sanitizeRecognizedReviewResult(
      next.reviewScreeningMetadata,
      platform,
    );
  }
  if (typeof next.reviewSetSignature === 'string' && Array.isArray(next.reviews)) {
    next.reviewSetSignature = getTopicReviewSetSignature(next.reviews);
  }
  if (isDataMinimizedPlatform(platform)) {
    for (const key of ['appId', 'category', 'rating', 'ratingFilter', 'reviewDiagnostics', 'sampleAccepted', 'sampleRejected']) {
      delete next[key];
    }
  }
  return next;
}

export function sanitizeLegacyScrapeRecord(value) {
  if (value == null) return value;
  const next = { ...requireRecord(value) };
  if (next.productImage !== undefined) next.productImage = sanitizeProductImageUrl(next.productImage);
  if (next.productMediaType !== undefined) {
    next.productMediaType = sanitizeProductMediaType(next.productMediaType);
  }
  if (next.reviews !== undefined) {
    next.reviews = mapReviewArray(next.reviews, sanitizeReviewForAnalysis, next.platform);
  }
  if (isDataMinimizedPlatform(next.platform)) {
    for (const key of ['appId', 'category', 'rating', 'ratingFilter', 'reviewDiagnostics', 'sampleAccepted', 'sampleRejected']) {
      delete next[key];
    }
  }
  return next;
}

export function sanitizeLegacyAnalysisMap(value) {
  const map = requireRecord(value);
  return Object.fromEntries(
    Object.entries(map).map(([key, record]) => [key, sanitizeLegacyAnalysisRecord(record)]),
  );
}

export function sanitizeActiveAnalysisState(value) {
  const next = { ...requireRecord(value) };
  if (next.productImage !== undefined) next.productImage = sanitizeProductImageUrl(next.productImage);
  if (next.productMediaType !== undefined) {
    next.productMediaType = sanitizeProductMediaType(next.productMediaType);
  }
  if (next.reviews !== undefined) {
    next.reviews = mapReviewArray(next.reviews, sanitizeReviewForAnalysis, next.platform);
  }
  if (next.skippedReviews !== undefined) {
    next.skippedReviews = sanitizeReviewCopies({ skippedReviews: next.skippedReviews }, next.platform).skippedReviews;
  }
  if (next.reviewAnalysis !== undefined) {
    next.reviewAnalysis = sanitizeReviewCopies({ reviewAnalysis: next.reviewAnalysis }, next.platform).reviewAnalysis;
  }
  if (next.emotionData !== undefined) next.emotionData = sanitizeEmotionData(next.emotionData, next.platform);
  if (next.topicResult !== undefined && next.topicResult !== null) {
    next.topicResult = sanitizeTopicTree(requireRecord(next.topicResult), next.platform);
  }
  if (next.svmResult?.results !== undefined) {
    const sanitizedResults = sanitizeReviewCopies({ reviewAnalysis: next.svmResult.results }, next.platform).reviewAnalysis;
    next.svmResult = { ...requireRecord(next.svmResult), results: sanitizedResults };
  }
  if (typeof next.reviewSetSignature === 'string' && Array.isArray(next.reviews)) {
    next.reviewSetSignature = getTopicReviewSetSignature(next.reviews);
  }
  if (isDataMinimizedPlatform(next.platform)) {
    for (const key of ['appId', 'category', 'rating', 'ratingFilter', 'reviewDiagnostics', 'sampleAccepted', 'sampleRejected']) {
      delete next[key];
    }
  }
  return next;
}

export function sanitizeLegacyActiveAnalysisMap(value) {
  const map = requireRecord(value);
  return Object.fromEntries(
    Object.entries(map).map(([key, state]) => [key, sanitizeActiveAnalysisState(state)]),
  );
}

function readChromeStorage(storage, runtime) {
  return new Promise((resolve, reject) => {
    storage.get(chromeKeys, (result) => {
      if (runtime?.lastError) {
        reject(migrationError());
        return;
      }
      resolve(result || {});
    });
  });
}

function writeChromeStorage(storage, runtime, values) {
  return new Promise((resolve, reject) => {
    storage.set(values, () => {
      if (runtime?.lastError) reject(migrationError());
      else resolve();
    });
  });
}

function validateMigrationVersion(version) {
  if (version === undefined) return 0;
  if (!Number.isSafeInteger(version) || version < 0) throw migrationError();
  return version;
}

async function migrateChromeStorage(storage, runtime) {
  const values = await readChromeStorage(storage, runtime);
  if (validateMigrationVersion(values[PRIVACY_MIGRATION_VERSION_KEY]) >= PRIVACY_MIGRATION_VERSION) return;

  const updates = {};
  if (values[LAST_SCRAPE_STORAGE_KEY] !== undefined) {
    if (values[LAST_SCRAPE_STORAGE_KEY] === null) throw migrationError();
    updates[LAST_SCRAPE_STORAGE_KEY] = sanitizeLegacyScrapeRecord(values[LAST_SCRAPE_STORAGE_KEY]);
  }
  if (values[ACTIVE_ANALYSIS_STORAGE_KEY] !== undefined) {
    if (values[ACTIVE_ANALYSIS_STORAGE_KEY] === null) throw migrationError();
    updates[ACTIVE_ANALYSIS_STORAGE_KEY] = sanitizeLegacyActiveAnalysisMap(values[ACTIVE_ANALYSIS_STORAGE_KEY]);
  }
  updates[PRIVACY_MIGRATION_VERSION_KEY] = PRIVACY_MIGRATION_VERSION;
  await writeChromeStorage(storage, runtime, updates);
}

function parseLocalStorageValue(storage, key) {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    throw migrationError();
  }
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw migrationError();
  }
}

async function migrateLocalStorage(storage) {
  const values = Object.fromEntries(localStorageKeys.map((key) => [key, parseLocalStorageValue(storage, key)]));
  if (validateMigrationVersion(values[PRIVACY_MIGRATION_VERSION_KEY]) >= PRIVACY_MIGRATION_VERSION) return;

  const updates = {};
  if (values[ACTIVE_ANALYSIS_STORAGE_KEY] !== undefined) {
    if (values[ACTIVE_ANALYSIS_STORAGE_KEY] === null) throw migrationError();
    updates[ACTIVE_ANALYSIS_STORAGE_KEY] = sanitizeLegacyActiveAnalysisMap(values[ACTIVE_ANALYSIS_STORAGE_KEY]);
  }
  updates[PRIVACY_MIGRATION_VERSION_KEY] = PRIVACY_MIGRATION_VERSION;
  try {
    for (const [key, value] of Object.entries(updates)) {
      storage.setItem(key, JSON.stringify(value));
    }
  } catch {
    throw migrationError();
  }
}

export function runLegacyReviewPrivacyMigration({
  chromeStorage = globalThis.chrome?.storage?.local,
  runtime = globalThis.chrome?.runtime,
  localStorageRef,
} = {}) {
  if (chromeStorage) {
    if (!chromeMigrationInFlight) {
      chromeMigrationInFlight = migrateChromeStorage(chromeStorage, runtime)
        .finally(() => { chromeMigrationInFlight = null; });
    }
    return chromeMigrationInFlight;
  }
  let storage = localStorageRef;
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      return Promise.reject(migrationError());
    }
  }
  if (!storage) return Promise.reject(migrationError());
  if (!localStorageMigrationInFlight) {
    const migrate = () => migrateLocalStorage(storage);
    const lockManager = globalThis.navigator?.locks;
    localStorageMigrationInFlight = (lockManager
      ? lockManager.request('voxreview-legacy-review-privacy-migration', migrate)
      : migrate())
      .finally(() => { localStorageMigrationInFlight = null; });
  }
  return localStorageMigrationInFlight;
}

export function ensureLegacyReviewPrivacyMigration() {
  if (
    globalThis.chrome?.storage?.local &&
    typeof document !== 'undefined' &&
    typeof globalThis.chrome.runtime?.sendMessage === 'function'
  ) {
    return new Promise((resolve, reject) => {
      globalThis.chrome.runtime.sendMessage(
        { type: 'ensureLegacyReviewPrivacyMigration' },
        (response) => {
          if (globalThis.chrome.runtime.lastError || response?.ok !== true) {
            reject(migrationError());
          } else {
            resolve();
          }
        },
      );
    });
  }
  return runLegacyReviewPrivacyMigration();
}
