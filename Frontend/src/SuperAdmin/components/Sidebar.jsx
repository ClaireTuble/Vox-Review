import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Globe,
  Sliders,
  ShieldAlert,
  Settings as SettingsIcon,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { useVoxLogo } from '../../utils/useVoxLogo.js';
import '../css/sidebar.css';

const PRIMARY_NAV_ITEMS = [
  { key: 'overview', label: 'Home', Icon: LayoutDashboard },
  { key: 'users', label: 'Manage Users', Icon: Users },
  { key: 'platforms', label: 'Supported Platforms', Icon: Globe },
  { key: 'logs', label: 'Admin Activity Logs', Icon: ShieldAlert },
];

export default function Sidebar({ activeTab, onTabChange, onSignOut }) {
  const logo = useVoxLogo({ forceDark: true });
  const isSettingsActive =
    activeTab === 'settings' || activeTab === 'security' || activeTab === 'platformSettings';

  const [isSettingsExpanded, setIsSettingsExpanded] = useState(isSettingsActive);

  // Keep Settings expanded whenever an internal settings tab is active
  useEffect(() => {
    if (isSettingsActive) {
      setIsSettingsExpanded(true);
    }
  }, [isSettingsActive]);

  const handleSettingsClick = () => {
    setIsSettingsExpanded((prev) => !prev);
    // If not already in settings, navigate to Security settings view by default
    if (!isSettingsActive) {
      onTabChange('settings');
    }
  };

  return (
    <aside className="superadmin-sidebar">
      <div className="admin-brand-header">
        <div className="admin-brand-logo">
          <div className="logo-mark">
            <img src={logo} alt="VoxReview Logo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          </div>
          <div className="logo-stack">
            <span className="logo-text">VoxReview Admin</span>
            <span className="role-pill-badge">Super Admin</span>
          </div>
        </div>
      </div>

      <nav className="admin-nav-menu">
        {/* Primary Navigation Items */}
        {PRIMARY_NAV_ITEMS.map(({ key, label, Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              className={`admin-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(key)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          );
        })}

        {/* Expandable Settings Item */}
        <div className="admin-nav-expandable-group">
          <button
            className={`admin-nav-item has-submenu ${isSettingsActive ? 'active' : ''}`}
            onClick={handleSettingsClick}
            aria-expanded={isSettingsExpanded}
          >
            <div className="nav-item-left">
              <SettingsIcon size={16} />
              <span>Settings</span>
            </div>
            <div className="nav-chevron-icon">
              {isSettingsExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </div>
          </button>

          {/* Submenu directly underneath Settings */}
          {isSettingsExpanded && (
            <div className="admin-nav-submenu">
              {/* Sub-item 1: Security */}
              <button
                className={`admin-submenu-item ${activeTab === 'settings' || activeTab === 'security' ? 'active' : ''}`}
                onClick={() => onTabChange('settings')}
              >
                <ShieldCheck size={14} />
                <span>Security</span>
              </button>

              {/* Sub-item 2: Platform Settings */}
              <button
                className={`admin-submenu-item ${activeTab === 'platformSettings' ? 'active' : ''}`}
                onClick={() => onTabChange('platformSettings')}
              >
                <Sliders size={14} />
                <span>Platform Settings</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="admin-sidebar-footer">
        <button className="admin-logout-btn" onClick={onSignOut}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
