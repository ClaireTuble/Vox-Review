import { useState, useEffect } from 'react';
import authService from '../../services/authService.js';

// Design/reference only; production notifications must come from the backend.
export const initialMockNotifications = [];

const STORAGE_KEY = 'voxreview_superadmin_notifications';
const EVENT_NAME = 'superadmin_notifications_updated';

async function getSuperAdminHeaders() {
  const token = await authService.getSuperAdminAccessToken();
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

export async function fetchSuperAdminNotifications() {
  try {
    const headers = await getSuperAdminHeaders();
    const response = await fetch('http://localhost:5000/api/admin/notifications', {
      headers,
    });

    if (!response.ok) {
      throw new Error('Unable to load notifications.');
    }

    const payload = await response.json();
    const notifications = Array.isArray(payload?.notifications) ? payload.notifications : [];
    if (notifications.length > 0) {
      saveStoredNotifications(notifications);
    }
    return notifications;
  } catch (error) {
    console.warn('VoxReview: Super admin notifications fetch failed:', error?.message || error);
    return [];
  }
}

// Helper to retrieve current notifications from localStorage or fallback to initial dataset
export function getStoredNotifications() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('Error reading superadmin notifications from localStorage:', e);
  }
  return [];
}

// Helper to save notifications to localStorage and dispatch update event
export function saveStoredNotifications(notifications) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: notifications }));
  } catch (e) {
    console.error('Error saving superadmin notifications to localStorage:', e);
  }
}

// Mark a single notification as read/unread
export async function toggleNotificationRead(id) {
  try {
    const headers = await getSuperAdminHeaders();
    const response = await fetch(`http://localhost:5000/api/admin/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ read: true }),
    });

    if (!response.ok) {
      throw new Error('Unable to update notification state.');
    }

    const result = await response.json();
    const notifications = getStoredNotifications();
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: result?.notification?.read ?? !n.read } : n));
    saveStoredNotifications(updated);
    return updated;
  } catch (error) {
    console.warn('VoxReview: Notification read update failed:', error?.message || error);
    const current = getStoredNotifications();
    const updated = current.map((n) => (n.id === id ? { ...n, read: !n.read } : n));
    saveStoredNotifications(updated);
    return updated;
  }
}

// Mark all notifications as read
export async function markAllNotificationsAsRead() {
  try {
    const headers = await getSuperAdminHeaders();
    const response = await fetch('http://localhost:5000/api/admin/notifications/read-all', {
      method: 'PATCH',
      headers,
    });

    if (!response.ok) {
      throw new Error('Unable to mark notifications as read.');
    }

    const payload = await response.json();
    const notifications = payload?.notifications || getStoredNotifications();
    saveStoredNotifications(notifications);
    return notifications;
  } catch (error) {
    console.warn('VoxReview: Mark all notifications as read failed:', error?.message || error);
    const current = getStoredNotifications();
    const updated = current.map((n) => ({ ...n, read: true }));
    saveStoredNotifications(updated);
    return updated;
  }
}

// Clear all read notifications
export async function clearReadNotifications() {
  try {
    const headers = await getSuperAdminHeaders();
    const response = await fetch('http://localhost:5000/api/admin/notifications/read', {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      throw new Error('Unable to clear read notifications.');
    }

    const current = getStoredNotifications();
    const updated = current.filter((n) => !n.read);
    saveStoredNotifications(updated);
    return updated;
  } catch (error) {
    console.warn('VoxReview: Clear read notifications failed:', error?.message || error);
    const current = getStoredNotifications();
    const updated = current.filter((n) => !n.read);
    saveStoredNotifications(updated);
    return updated;
  }
}

// Custom React Hook to manage notification state reactively across components
export function useSuperAdminNotifications() {
  const [notifications, setNotifications] = useState(() => getStoredNotifications());

  useEffect(() => {
    let active = true;

    async function load() {
      const latest = await fetchSuperAdminNotifications();
      if (active) setNotifications(latest);
    }

    const handleUpdate = (e) => {
      if (e.detail) {
        setNotifications(e.detail);
      } else {
        setNotifications(getStoredNotifications());
      }
    };

    load();
    window.addEventListener(EVENT_NAME, handleUpdate);
    return () => {
      active = false;
      window.removeEventListener(EVENT_NAME, handleUpdate);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    toggleRead: toggleNotificationRead,
    markAllAsRead: markAllNotificationsAsRead,
    clearRead: clearReadNotifications,
  };
}
