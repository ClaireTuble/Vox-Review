import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const component = await readFile(new URL('./UserHistoryModal.jsx', import.meta.url), 'utf8');

test('Activity History renders only platform, activity type, and date columns', () => {
  const headers = [...component.matchAll(/<th>(.*?)<\/th>/gs)]
    .map(([, header]) => header.replace(/&amp;/g, '&').trim());

  assert.deepEqual(headers, [
    'Website / Platform',
    'Activity Type',
    'Date & Time',
  ]);
  assert.doesNotMatch(component, /act\.product_(?:title|url)|<th>Product (?:Title|URL)<\/th>/);
});
