import { useState, useRef, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  WifiOff,
  CheckCircle2,
  UserPlus,
  Activity,
  BellOff,
  Clock,
  Trash2,
} from 'lucide-react';
import { useSuperAdminNotifications } from '../data/superadminNotifications.js';
import '../css/notifications.css';

export default function NotificationBell({ onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const dropdownRef = useRef(null);

  const { notifications, unreadCount, toggleRead, markAllAsRead, clearRead } =
    useSuperAdminNotifications();

  // Helper to determine destination tab using source_event as primary, category as fallback
  const getDestinationTab = (notif) => {
    const sourceEvent = notif?.source_event || '';
    const category = notif?.category || '';

    if (
      sourceEvent === 'super_admin_login_failed' ||
      sourceEvent.startsWith('audit_') ||
      sourceEvent.startsWith('security_alert_')
    ) {
      return 'logs';
    }
    if (sourceEvent === 'security_settings_changed') {
      return 'settings';
    }
    if (sourceEvent === 'user_registered') {
      return 'users';
    }
    if (sourceEvent.startsWith('health_report_')) {
      return 'platforms';
    }
    if (sourceEvent.startsWith('platform_config_')) {
      return 'platformSettings';
    }

    if (category === 'Security') {
      return 'logs';
    }
    if (category === 'Users') {
      return 'users';
    }
    if (category === 'Platform') {
      return 'platforms';
    }

    return 'overview';
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Filter notification items based on active tab
  const filteredNotifications = notifications.filter((notif) => {
    if (activeFilter === 'Unread') return !notif.read;
    if (activeFilter === 'Security') return notif.category === 'Security';
    if (activeFilter === 'Platform') return notif.category === 'Platform';
    if (activeFilter === 'Users') return notif.category === 'Users';
    return true; // 'All'
  });

  // Icon mapping helper
  const renderCategoryIcon = (notif) => {
    const iconSize = 16;
    if (notif.category === 'Security') {
      if (notif.type === 'alert' || notif.type === 'danger') {
        return <ShieldAlert size={iconSize} />;
      }
      return <ShieldCheck size={iconSize} />;
    }
    if (notif.category === 'Platform') {
      if (notif.type === 'danger' || notif.title.includes('Error')) {
        return <AlertTriangle size={iconSize} />;
      }
      if (notif.type === 'warning' || notif.title.includes('Unavailable')) {
        return <WifiOff size={iconSize} />;
      }
      if (notif.type === 'success' || notif.title.includes('Recovered')) {
        return <CheckCircle2 size={iconSize} />;
      }
    }
    if (notif.category === 'Users') {
      if (notif.title.includes('New Account') || notif.title.includes('registered')) {
        return <UserPlus size={iconSize} />;
      }
      return <Activity size={iconSize} />;
    }
    return <Bell size={iconSize} />;
  };

  return (
    <div className="notification-bell-wrapper" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        className={`notification-bell-btn ${unreadCount > 0 ? 'has-unread' : ''} ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Super Admin System Notifications"
        aria-expanded={isOpen}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <Bell size={20} className="notification-bell-icon" />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="notification-dropdown">
          {/* Header */}
          <div className="notification-dropdown-header">
            <div className="notification-header-title">
              <h4>Notifications</h4>
              {unreadCount > 0 && (
                <span className="notification-unread-pill">{unreadCount} unread</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                className="mark-all-btn"
                onClick={() => markAllAsRead()}
                title="Mark all notifications as read"
              >
                <CheckCheck size={14} />
                <span>Mark all as read</span>
              </button>
            )}
          </div>

          {/* Category Filter Tabs */}
          <div className="notification-filters">
            {['All', 'Unread', 'Security', 'Platform', 'Users'].map((tab) => (
              <button
                key={tab}
                className={`filter-tab-btn ${activeFilter === tab ? 'active' : ''}`}
                onClick={() => setActiveFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Notification Items List */}
          <div className="notification-list">
            {filteredNotifications.length > 0 ? (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notification-item ${!notif.read ? 'unread' : 'read'} type-${notif.type || 'info'}`}
                  onClick={() => {
                    if (!notif.read) {
                      toggleRead(notif.id);
                    }
                    setIsOpen(false);
                    if (typeof onNavigate === 'function') {
                      const targetTab = getDestinationTab(notif);
                      onNavigate(targetTab);
                    }
                  }}
                >
                  <div className={`notification-icon-box type-${notif.type || 'info'}`}>
                    {renderCategoryIcon(notif)}
                  </div>

                  <div className="notification-content">
                    <div className="notification-title-row">
                      <h5 className="notification-title">{notif.title}</h5>
                      {!notif.read && <span className="unread-dot" title="Unread" />}
                    </div>

                    <p className="notification-message">{notif.message}</p>

                    <div className="notification-meta-row">
                      <span className="notification-category-badge">{notif.category}</span>
                      <span className="notification-timestamp">
                        <Clock size={10} style={{ display: 'inline', marginRight: '3px' }} />
                        {notif.timestamp}
                      </span>
                      <button
                        className="item-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRead(notif.id);
                        }}
                        title={notif.read ? 'Mark as unread' : 'Mark as read'}
                      >
                        {notif.read ? 'Unread' : 'Read'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="notification-empty">
                <BellOff size={28} className="notification-empty-icon" />
                <p className="notification-empty-text">No notifications found</p>
              </div>
            )}
          </div>

          {/* Dropdown Footer */}
          <div className="notification-dropdown-footer">
            <span style={{ fontSize: '10px', color: '#64748b' }}>
              System &amp; Audit Notifications
            </span>
            {notifications.some((n) => n.read) && (
              <button
                className="footer-action-btn"
                onClick={() => clearRead()}
                title="Clear all read notifications"
              >
                <Trash2 size={12} style={{ display: 'inline', marginRight: '4px' }} />
                Clear read
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
