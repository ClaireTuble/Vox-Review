import { DEFAULT_API_URL } from '../../extension/config.js';

const configuredApiUrl = import.meta.env?.VITE_API_URL?.trim();
const defaultApiUrl = import.meta.env?.MODE === 'extension'
  ? DEFAULT_API_URL
  : 'http://localhost:5000';

export const API_BASE_URL = (configuredApiUrl || defaultApiUrl).replace(/\/+$/, '');
