import { DEFAULT_APP_URL } from '../../extension/config.js';

const configuredAppUrl = import.meta.env?.VITE_APP_URL?.trim();

export const APP_BASE_URL = (
  configuredAppUrl ||
  (import.meta.env?.MODE === 'extension' ? DEFAULT_APP_URL : 'http://localhost:5173')
).replace(/\/+$/, '');
