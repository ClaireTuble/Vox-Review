import authService from '../../services/authService.js';

// Design/reference only; production logs must come from the backend.
export const mockSuperAdminActivityLogs = [];
export const mockSecurityNotifications = [];

export async function fetchSuperAdminActivityLogs() {
  try {
    const token = await authService.getSuperAdminAccessToken();
    const response = await fetch('http://localhost:5000/api/admin/audit-logs', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error('Unable to load admin activity logs.');
    }

    const payload = await response.json();
    const logs = Array.isArray(payload?.logs) ? payload.logs : [];
    const securityAlerts = Array.isArray(payload?.securityAlerts) ? payload.securityAlerts : [];

    return { logs, securityAlerts };
  } catch (error) {
    console.warn('VoxReview: Super admin activity logs fetch failed:', error?.message || error);
    return { logs: [], securityAlerts: [] };
  }
}
