/**
 * pageAnalysisStorage.js
 *
 * Persistent Page-Specific Analysis Storage Service for VoxReview Browser Extension.
 * Keys analyses by stable platform + source page identifier (<platform>:<source_id_or_url>).
 */

import { sanitizeReviewsForAnalysis } from './privacyRedaction.js';
import { authService } from './authService.js';
import { supabase } from '../lib/supabase.js';
import {
  sanitizeLegacyAnalysisRecord,
} from './legacyReviewPrivacyMigration.js';
import { restoreReviewScreeningMetadata } from '../Users/utils/reviewScreeningMetadata.js';

export function getPageKey(platform, urlStr) {
  if (!urlStr || !platform) return null;
  const normalizedPlatform = String(platform).trim().toLowerCase();
  const plat = normalizedPlatform === 'google reviews' || normalizedPlatform === 'google maps'
    ? 'google'
    : normalizedPlatform === 'google play' || normalizedPlatform === 'google play store'
      ? 'googleplay'
      : normalizedPlatform;
  try {
    const url = new URL(urlStr);
    const path = url.pathname.toLowerCase();

    if (plat === 'shopee') {
      const match = path.match(/i\.(\d+)\.(\d+)/i);
      if (match) return `shopee:i.${match[1]}.${match[2]}`;
      const prodMatch = path.match(/\/product\/(\d+)\/(\d+)/i);
      if (prodMatch) return `shopee:i.${prodMatch[1]}.${prodMatch[2]}`;
      const itemid = url.searchParams.get('itemid');
      const shopid = url.searchParams.get('shopid');
      if (itemid && shopid) return `shopee:i.${shopid}.${itemid}`;
    }

    if (plat === 'lazada') {
      const match = path.match(/i(\d+)(?:-s\d+)?\.html/i) || path.match(/i(\d+)/i);
      if (match) return `lazada:i${match[1]}`;
    }

    if (plat === 'google' || plat === 'google maps') {
      const placeMatch = path.match(/\/maps\/place\/([^/@]+)/i);
      if (placeMatch) {
        return `google:place:${decodeURIComponent(placeMatch[1]).trim().toLowerCase()}`;
      }
      const searchMatch = path.match(/\/maps\/search\/([^/@]+)/i);
      if (searchMatch) {
        return `google:search:${decodeURIComponent(searchMatch[1]).trim().toLowerCase()}`;
      }
    }

    if (plat === 'steam') {
      const match = path.match(/\/app\/(\d+)/i);
      if (match) return `steam:app/${match[1]}`;
    }

    if (plat === 'googleplay') {
      const id = url.searchParams.get('id');
      if (id) return `googleplay:${id.toLowerCase()}`;
    }

    const cleanPath = url.pathname.replace(/\/+$/, '');
    return `${plat}:${url.origin}${cleanPath}`.toLowerCase();
  } catch {
    return `${plat}:${String(urlStr).toLowerCase()}`;
  }
}

export function generateDefaultSnapshotLabel(existingSnapshots = []) {
  const existingNumbers = existingSnapshots
    .map((s) => {
      const match = String(s?.label || '').match(/^Analysis\s+(\d+)$/i);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter(Boolean);

  if (existingNumbers.length === 0) {
    return `Analysis ${existingSnapshots.length + 1}`;
  }
  const maxNumber = Math.max(...existingNumbers, existingSnapshots.length);
  return `Analysis ${maxNumber + 1}`;
}

const SAVED_ANALYSES_TABLE = 'saved_analyses';
const SAVED_ANALYSIS_COLUMNS = 'id,user_id,platform,page_url,page_key,target_title,label,notes,snapshot,created_at,updated_at';

function createSavedAnalysisId() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Secure saved-analysis identifiers are unavailable in this browser.');
  }
  return globalThis.crypto.randomUUID();
}

async function requireAuthenticatedUserId() {
  const session = await authService.getCurrentRegularUserSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Sign in to access your saved analyses.');
  return userId;
}

function mapSavedAnalysisRow(row) {
  if (!row || typeof row.id !== 'string' || !row.snapshot || typeof row.snapshot !== 'object') {
    throw new Error('A saved analysis could not be loaded safely.');
  }
  const snapshot = sanitizeLegacyAnalysisRecord(row.snapshot);
  return sanitizeLegacyAnalysisRecord({
    ...snapshot,
    id: row.id,
    platform: row.platform,
    page_url: row.page_url,
    pageKey: row.page_key || snapshot.pageKey || getPageKey(row.platform, row.page_url),
    targetTitle: row.target_title ?? snapshot.targetTitle ?? '',
    label: row.label || snapshot.label || 'Analysis 1',
    notes: row.notes ?? snapshot.notes ?? '',
    created_at: snapshot.created_at ?? row.created_at,
  });
}

function mapSavedAnalysisRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Saved analyses could not be loaded.');
  return Object.fromEntries(rows.map((row) => {
    const record = mapSavedAnalysisRow(row);
    return [record.id, record];
  }));
}

async function fetchPageAnalysesForUser(userId) {
  const { data, error } = await supabase
    .from(SAVED_ANALYSES_TABLE)
    .select(SAVED_ANALYSIS_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return mapSavedAnalysisRows(data);
}

async function persistAnalysisForUser(record, userId, {
  existing = false,
} = {}) {
  const snapshot = sanitizeLegacyAnalysisRecord(record);
  const row = {
    ...(record.id ? { id: record.id } : {}),
    user_id: userId,
    platform: record.platform,
    page_url: record.page_url,
    page_key: record.pageKey || getPageKey(record.platform, record.page_url),
    target_title: typeof record.targetTitle === 'string' ? record.targetTitle : '',
    label: record.label,
    notes: record.notes,
    snapshot,
  };
  const query = supabase.from(SAVED_ANALYSES_TABLE);
  const request = existing
    ? query.update({
        platform: row.platform,
        page_url: row.page_url,
        page_key: row.page_key,
        target_title: row.target_title,
        label: row.label,
        notes: row.notes,
        snapshot: row.snapshot,
      }).eq('id', record.id).eq('user_id', userId)
    : query.insert(row);
  const { data, error } = await request
    .select(SAVED_ANALYSIS_COLUMNS)
    .single();
  if (error) throw error;
  return mapSavedAnalysisRow(data);
}

export async function getPageAnalyses() {
  const userId = await requireAuthenticatedUserId();
  return fetchPageAnalysesForUser(userId);
}

export async function getSnapshotsForPage(platform, urlStr) {
  const pageKey = getPageKey(platform, urlStr);
  if (!pageKey) return [];
  const allAnalyses = await getPageAnalyses();
  return Object.values(allAnalyses).filter((record) => {
    const itemKey = getPageKey(record.platform, record.page_url) || record.pageKey;
    return itemKey === pageKey;
  });
}

export async function getAnalysisForPage(platform, urlStr) {
  const snapshots = await getSnapshotsForPage(platform, urlStr);
  if (snapshots.length === 0) return null;
  snapshots.sort((a, b) => {
    const timeA = Number(a.updated_at || a.timestamp || a.last_refreshed_at || 0);
    const timeB = Number(b.updated_at || b.timestamp || b.last_refreshed_at || 0);
    return timeB - timeA;
  });
  return snapshots[0];
}

export async function getAnalysisById(id) {
  if (!id) return null;
  const allAnalyses = await getPageAnalyses();
  if (allAnalyses[id]) return allAnalyses[id];
  return Object.values(allAnalyses).find((record) => record.id === id) || null;
}

export async function getSavedAnalysisCount() {
  return Object.keys(await getPageAnalyses()).length;
}

function getReviewIdentity(review) {
  if (typeof review === 'string') return review;
  if (!review || typeof review !== 'object') return '';
  const text = review.text ?? review.reviewText ?? review.comment ?? review.review ?? '';
  const date = review.date ?? review.reviewDate ?? '';
  return JSON.stringify({ text, date });
}

function hasValidTopicResults(topicAnalysis, reviews) {
  return Array.isArray(reviews) && Array.isArray(topicAnalysis?.results) &&
    topicAnalysis.results.length === reviews.length &&
    topicAnalysis.results.every((result) => Array.isArray(result?.topics) && result.topics.every((topic) => (
      typeof topic?.label === 'string' && typeof topic?.score === 'number'
    )));
}

function reviewAnalysisMatchesBatch(reviewAnalysis, reviews) {
  return Array.isArray(reviewAnalysis) && Array.isArray(reviews) &&
    reviewAnalysis.length === reviews.length &&
    reviewAnalysis.every((analysis, index) => getReviewIdentity(analysis?.review) === getReviewIdentity(reviews[index]));
}

export async function saveAnalysisForPage(record) {
  if (!record || !record.platform || !record.page_url) return null;
  const userId = await requireAuthenticatedUserId();
  const pageKey = getPageKey(record.platform, record.page_url) || record.pageKey;
  if (!pageKey) return null;

  const allAnalyses = await fetchPageAnalysesForUser(userId);

  let snapshotId = record.id;
  // If record.id is missing but this is a refresh timestamp update, find the existing snapshot for this page
  if (!snapshotId && record.last_refreshed_at) {
    const existing = Object.values(allAnalyses).find((item) => (
      item.pageKey === pageKey || getPageKey(item.platform, item.page_url) === pageKey
    ));
    if (existing) snapshotId = existing.id;
  }

  // Check if we are updating an existing snapshot by its stable ID
  const isExistingSnapshot = Boolean(snapshotId && allAnalyses[snapshotId]);
  const previousRecord = isExistingSnapshot ? (allAnalyses[snapshotId] || {}) : {};

  const reviews = Array.isArray(record.reviews)
    ? sanitizeReviewsForAnalysis(record.reviews, record.platform)
    : sanitizeReviewsForAnalysis(previousRecord.reviews || [], record.platform);
  if (record.reviewScreeningMetadata !== undefined &&
      !restoreReviewScreeningMetadata(record.reviewScreeningMetadata, reviews)) {
    throw new Error('Review screening metadata does not match the saved review set.');
  }
  const sameReviewBatch = Array.isArray(reviews) && Array.isArray(previousRecord.reviews) &&
    reviews.length === previousRecord.reviews.length &&
    reviews.every((review, index) => getReviewIdentity(review) === getReviewIdentity(previousRecord.reviews[index]));
  const incomingTopicsAreValid = hasValidTopicResults(record.topicAnalysis, reviews) && (
    sameReviewBatch || !previousRecord.reviews || reviewAnalysisMatchesBatch(record.reviewAnalysis, reviews)
  );
  const previousTopicsAreValid = sameReviewBatch && hasValidTopicResults(previousRecord.topicAnalysis, reviews);
  const mergedRecord = { ...previousRecord, ...record, reviews };
  if (!sameReviewBatch && record.reviewScreeningMetadata === undefined) {
    delete mergedRecord.reviewScreeningMetadata;
  }

  if (!incomingTopicsAreValid && previousTopicsAreValid) {
    mergedRecord.topicAnalysis = previousRecord.topicAnalysis;
  } else if (!sameReviewBatch && !incomingTopicsAreValid) {
    mergedRecord.topicAnalysis = null;
    if (!reviewAnalysisMatchesBatch(record.reviewAnalysis, reviews)) {
      mergedRecord.reviewAnalysis = [];
      mergedRecord.emotionData = null;
      mergedRecord.dominantEmotion = null;
      mergedRecord.percentage = null;
    }
  }

  let snapshotLabel;

  if (isExistingSnapshot) {
    snapshotLabel = (typeof record.label === 'string' && record.label.trim())
      ? record.label.trim()
      : (previousRecord.label || 'Analysis 1');
  } else {
    snapshotId = createSavedAnalysisId();

    const existingSnapshots = Object.values(allAnalyses).filter((item) => {
      const itemKey = getPageKey(item.platform, item.page_url) || item.pageKey;
      return itemKey === pageKey && item.id !== snapshotId;
    });

    snapshotLabel = (typeof record.label === 'string' && record.label.trim())
      ? record.label.trim()
      : generateDefaultSnapshotLabel(existingSnapshots);
  }

  const snapshotNotes = typeof record.notes === 'string'
    ? record.notes.trim()
    : (previousRecord.notes || '');

  const reviewCount = Array.isArray(reviews)
    ? reviews.length
    : (record.reviewCount || previousRecord.reviewCount || 0);

  const updatedRecord = sanitizeLegacyAnalysisRecord({
    ...mergedRecord,
    id: snapshotId,
    label: snapshotLabel,
    notes: snapshotNotes,
    pageKey: pageKey,
    reviewCount,
    updated_at: Date.now(),
    date: record.date || 'Just now',
    analysisStatus: 'completed',
  });

  return persistAnalysisForUser(updatedRecord, userId, { existing: isExistingSnapshot });
}

export async function updateSnapshotMetadata(identifier, { label, notes } = {}) {
  if (!identifier) return null;
  const userId = await requireAuthenticatedUserId();
  const allAnalyses = await fetchPageAnalysesForUser(userId);

  let targetKey = null;
  if (allAnalyses[identifier]) {
    targetKey = identifier;
  } else {
    const byId = Object.entries(allAnalyses).find(([, record]) => record.id === identifier);
    if (byId) {
      targetKey = byId[0];
    } else {
      const byPageKey = Object.entries(allAnalyses).find(([, record]) => (
        record.pageKey === identifier ||
        (record.platform && record.page_url && getPageKey(record.platform, record.page_url) === identifier)
      ));
      if (byPageKey) targetKey = byPageKey[0];
    }
  }

  if (!targetKey || !allAnalyses[targetKey]) return null;

  const currentRecord = allAnalyses[targetKey];

  let nextLabel = currentRecord.label || 'Analysis 1';
  if (label !== undefined) {
    if (typeof label === 'string' && label.trim()) {
      nextLabel = label.trim();
    } else {
      if (/^Analysis\s+\d+$/i.test(currentRecord.label || '')) {
        nextLabel = currentRecord.label;
      } else {
        const pageKey = currentRecord.pageKey || getPageKey(currentRecord.platform, currentRecord.page_url);
        const siblingSnapshots = Object.values(allAnalyses).filter((item) => {
          const itemKey = getPageKey(item.platform, item.page_url) || item.pageKey;
          return itemKey === pageKey && item.id !== currentRecord.id;
        });
        nextLabel = generateDefaultSnapshotLabel(siblingSnapshots);
      }
    }
  }

  let nextNotes = currentRecord.notes || '';
  if (notes !== undefined) {
    if (typeof notes === 'string') {
      nextNotes = notes.trim();
    } else if (notes === null) {
      nextNotes = '';
    }
  }

  const updatedRecord = {
    ...currentRecord,
    label: nextLabel,
    notes: nextNotes,
  };

  return persistAnalysisForUser(updatedRecord, userId, { existing: true });
}

export async function deleteAnalysisForPage(identifier) {
  if (!identifier) return false;
  const userId = await requireAuthenticatedUserId();
  const allAnalyses = await fetchPageAnalysesForUser(userId);

  let targetKey = null;
  if (allAnalyses[identifier]) {
    targetKey = identifier;
  } else {
    const byId = Object.entries(allAnalyses).find(([, record]) => record.id === identifier);
    if (byId) {
      targetKey = byId[0];
    } else {
      const byPageKey = Object.entries(allAnalyses).find(([, record]) => (
        record.pageKey === identifier ||
        (record.platform && record.page_url && getPageKey(record.platform, record.page_url) === identifier)
      ));
      if (byPageKey) targetKey = byPageKey[0];
    }
  }

  if (targetKey && allAnalyses[targetKey]) {
    const { data, error } = await supabase
      .from(SAVED_ANALYSES_TABLE)
      .delete()
      .eq('id', allAnalyses[targetKey].id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  }

  return false;
}

export async function clearAllPageAnalyses() {
  const userId = await requireAuthenticatedUserId();
  const { data, error } = await supabase
    .from(SAVED_ANALYSES_TABLE)
    .delete()
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}
