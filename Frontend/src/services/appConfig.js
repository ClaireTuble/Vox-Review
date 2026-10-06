const configuredAppUrl = import.meta.env?.VITE_APP_URL?.trim();

export const APP_BASE_URL = (configuredAppUrl || 'http://localhost:5173').replace(/\/+$/, '');
