import { useState, useEffect } from 'react';

// Demo/Mock Notifications Data for Super Admin UI presentation
export const initialMockNotifications = [
  {
    id: 'notif_sa_1',
    category: 'Security',
    type: 'alert',
    title: 'Failed Login Attempt',
    message: 'Failed Super Admin login attempt from IP 192.168.1.105.',
    timestamp: 'Aug 14, 2026 5:40 PM',
    read: false,
  },
  {
    id: 'notif_sa_2',
    category: 'Security',
    type: 'info',
    title: 'Super Admin Login',
    message: 'Super Admin login detected from Chrome / Windows.',
    timestamp: 'Aug 14, 2026 5:32 PM',
    read: false,
  },
  {
    id: 'notif_sa_3',
    category: 'Platform',
    type: 'danger',
    title: 'Scraping Error',
    message: 'Lazada review extraction encountered an error.',
    timestamp: 'Aug 14, 2026 4:15 PM',
    read: false,
  },
  {
    id: 'notif_sa_4',
    category: 'Platform',
    type: 'warning',
    title: 'Integration Warning',
    message: 'Google Maps integration is currently unavailable.',
    timestamp: 'Aug 14, 2026 11:20 AM',
    read: false,
  },
  {
    id: 'notif_sa_5',
    category: 'Platform',
    type: 'success',
    title: 'Service Recovered',
    message: 'Platform review scraping recovered.',
    timestamp: 'Aug 13, 2026 6:45 PM',
    read: true,
  },
  {
    id: 'notif_sa_6',
    category: 'Users',
    type: 'info',
    title: 'New Account',
    message: 'New user registered.',
    timestamp: 'Aug 13, 2026 2:10 PM',
    read: true,
  },
  {
    id: 'notif_sa_7',
    category: 'Users',
    type: 'info',
    title: 'User Activity',
    message: 'User activity detected on Google Play Store.',
    timestamp: 'Aug 13, 2026 10:05 AM',
    read: true,
  },
];

const STORAGE_KEY = 'voxreview_superadmin_notifications';
const EVENT_NAME = 'superadmin_notifications_updated';

// Helper to retrieve current notifications from localStorage or fallback to initial dataset
export function getStoredNotifications() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading superadmin notifications from localStorage:', e);
  }
  return initialMockNotifications;
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
export function toggleNotificationRead(id) {
  const current = getStoredNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, read: !n.read } : n));
  saveStoredNotifications(updated);
  return updated;
}

// Mark all notifications as read
export function markAllNotificationsAsRead() {
  const current = getStoredNotifications();
  const updated = current.map((n) => ({ ...n, read: true }));
  saveStoredNotifications(updated);
  return updated;
}

// Clear all read notifications
export function clearReadNotifications() {
  const current = getStoredNotifications();
  const updated = current.filter((n) => !n.read);
  saveStoredNotifications(updated);
  return updated;
}

// Custom React Hook to manage notification state reactively across components
export function useSuperAdminNotifications() {
  const [notifications, setNotifications] = useState(getStoredNotifications);

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e.detail) {
        setNotifications(e.detail);
      } else {
        setNotifications(getStoredNotifications());
      }
    };

    window.addEventListener(EVENT_NAME, handleUpdate);
    return () => window.removeEventListener(EVENT_NAME, handleUpdate);
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
