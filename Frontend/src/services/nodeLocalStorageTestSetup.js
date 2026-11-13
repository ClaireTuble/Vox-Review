import { afterEach } from 'node:test';

function createMemoryStorage() {
  const entries = new Map();
  return {
    get length() {
      return entries.size;
    },
    key(index) {
      return Array.from(entries.keys())[index] ?? null;
    },
    getItem(key) {
      return entries.get(String(key)) ?? null;
    },
    setItem(key, value) {
      entries.set(String(key), String(value));
    },
    removeItem(key) {
      entries.delete(String(key));
    },
    clear() {
      entries.clear();
    },
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  const localStorageShim = createMemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageShim,
  });
  afterEach(() => localStorageShim.clear());
}