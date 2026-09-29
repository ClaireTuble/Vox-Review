import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterSavedAnalyses,
  SAVED_EMOTION_OPTIONS,
  SAVED_PLATFORM_OPTIONS,
  toggleSavedFilterSelection,
} from './savedAnalysisFilters.js';

const records = [
  {
    id: 'shopee-happy',
    targetTitle: 'Computer desk review',
    platform: 'shopee',
    dominantEmotion: 'Sad',
    reviewAnalysis: [{ category: 1 }, { category: 2 }],
    emotionData: { emotions: [{ label: 'Happy', count: 1 }, { label: 'Sad', count: 1 }] },
  },
  {
    id: 'play-happy',
    productTitle: 'Computer game review',
    platform: 'Google Play',
    dominantEmotion: 'Happy',
    emotionData: { emotions: [{ id: 'happy', count: 2 }] },
  },
  {
    id: 'google-anger',
    title: 'Cafe review',
    platform: 'Google Maps',
    dominantEmotion: 'Anger',
    reviewAnalysis: [{ emotion: 'Angry' }],
  },
  {
    id: 'steam-sad',
    targetTitle: 'Computer controller review',
    platform: 'steam',
    dominantEmotion: 'Sad',
    emotionData: { quotes: [{ category: 2 }] },
  },
];

const ids = (items) => items.map((item) => item.id).sort();

test('search matches saved title/name case-insensitively and partially', () => {
  assert.deepEqual(ids(filterSavedAnalyses(records, { searchQuery: 'COMPUT' })), [
    'play-happy', 'shopee-happy', 'steam-sad',
  ]);
  assert.deepEqual(ids(filterSavedAnalyses(records, { searchQuery: '' })), ids(records));
});

test('platform filtering uses stored values and canonicalizes platform aliases', () => {
  assert.deepEqual(ids(filterSavedAnalyses(records, { platforms: ['Shopee'] })), ['shopee-happy']);
  assert.deepEqual(ids(filterSavedAnalyses(records, { platforms: ['Google Play'] })), ['play-happy']);
  assert.deepEqual(ids(filterSavedAnalyses(records, { platforms: ['Google'] })), ['google-anger']);
});

test('emotion filtering searches saved per-review and aggregate emotion results', () => {
  assert.deepEqual(ids(filterSavedAnalyses(records, { emotions: ['Happy'] })), ['play-happy', 'shopee-happy']);
  assert.deepEqual(ids(filterSavedAnalyses(records, { emotions: ['Anger'] })), ['google-anger']);
  assert.deepEqual(ids(filterSavedAnalyses(records, { emotions: ['Angry'] })), ['google-anger']);
});

test('search plus platform filters combine with AND logic', () => {
  assert.deepEqual(ids(filterSavedAnalyses(records, {
    searchQuery: 'computer',
    platforms: ['Shopee'],
  })), ['shopee-happy']);
});

test('search plus emotion filters combine with AND logic', () => {
  assert.deepEqual(ids(filterSavedAnalyses(records, {
    searchQuery: 'computer',
    emotions: ['Happy'],
  })), ['play-happy', 'shopee-happy']);
});

test('platform plus emotion filters combine with AND logic', () => {
  assert.deepEqual(ids(filterSavedAnalyses(records, {
    platforms: ['Shopee'],
    emotions: ['Happy'],
  })), ['shopee-happy']);
});

test('search, platform, and emotion filters all combine with AND logic', () => {
  assert.deepEqual(ids(filterSavedAnalyses(records, {
    searchQuery: 'computer',
    platforms: ['Shopee'],
    emotions: ['Happy'],
  })), ['shopee-happy']);
  assert.deepEqual(filterSavedAnalyses(records, {
    searchQuery: 'computer',
    platforms: ['Google Play'],
    emotions: ['Sad'],
  }), []);
});

test('All Platforms reset removes the platform restriction', () => {
  assert.deepEqual(ids(filterSavedAnalyses(records, { platforms: [] })), ids(records));
  assert.deepEqual(ids(filterSavedAnalyses(records, { platforms: SAVED_PLATFORM_OPTIONS })), ids(records));
});

test('All Emotions reset removes the emotion restriction', () => {
  assert.deepEqual(ids(filterSavedAnalyses(records, { emotions: [] })), ids(records));
  assert.deepEqual(ids(filterSavedAnalyses(records, { emotions: SAVED_EMOTION_OPTIONS })), ids(records));
});

test('first option click selects only that option and deselecting the last restores All', () => {
  const platforms = toggleSavedFilterSelection(SAVED_PLATFORM_OPTIONS, 'Shopee', SAVED_PLATFORM_OPTIONS);
  assert.deepEqual(platforms, ['Shopee']);
  assert.deepEqual(toggleSavedFilterSelection(platforms, 'Lazada', SAVED_PLATFORM_OPTIONS), ['Shopee', 'Lazada']);
  assert.deepEqual(toggleSavedFilterSelection(['Shopee'], 'Shopee', SAVED_PLATFORM_OPTIONS), SAVED_PLATFORM_OPTIONS);

  const emotions = toggleSavedFilterSelection(SAVED_EMOTION_OPTIONS, 'Happy', SAVED_EMOTION_OPTIONS);
  assert.deepEqual(emotions, ['Happy']);
  assert.deepEqual(toggleSavedFilterSelection(['Happy'], 'Happy', SAVED_EMOTION_OPTIONS), SAVED_EMOTION_OPTIONS);
});

test('no matching results returns an empty list', () => {
  assert.deepEqual(filterSavedAnalyses(records, { searchQuery: 'not saved here' }), []);
});

test('clearing search and restoring all filters returns every record', () => {
  const filtered = filterSavedAnalyses(records, {
    searchQuery: 'computer',
    platforms: ['Shopee'],
    emotions: ['Happy'],
  });
  assert.deepEqual(ids(filtered), ['shopee-happy']);
  assert.deepEqual(ids(filterSavedAnalyses(records, {
    searchQuery: '',
    platforms: SAVED_PLATFORM_OPTIONS,
    emotions: SAVED_EMOTION_OPTIONS,
  })), ids(records));
});
