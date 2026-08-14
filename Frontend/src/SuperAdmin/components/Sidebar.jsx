import { LayoutDashboard, Users, Globe, Sliders, ShieldAlert, Settings, LogOut } from 'lucide-react';
import logo from '../../assets/VRLogo.png';
import '../css/sidebar.css';

const NAV_ITEMS = [
  { key: 'overview', label: 'Home', Icon: LayoutDashboard },
  { key: 'users', label: 'Manage Users', Icon: Users },
  { key: 'platforms', label: 'Supported Platforms', Icon: Globe },
  { key: 'platformSettings', label: 'Platform Settings', Icon: Sliders },
  { key: 'logs', label: 'Admin Activity Logs', Icon: ShieldAlert },
  { key: 'settings', label: 'Settings', Icon: Settings },
];

export default function Sidebar({ activeTab, onTabChange, onSignOut }) {
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
        {NAV_ITEMS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`admin-nav-item ${activeTab === key ? 'active' : ''}`}
            onClick={() => onTabChange(key)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
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
