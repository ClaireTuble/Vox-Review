import { Home, ChevronRight, Sparkles } from 'lucide-react';
import '../css/header.css';

export default function Header({ title, subtitle, user }) {
  return (
    <header className="superadmin-topbar">
      <div className="topbar-content-stack">
        <div className="topbar-breadcrumb">
          <span className="breadcrumb-item">
            <Home size={14} />
            <span>Home</span>
          </span>
          <ChevronRight size={14} />
          <span className="breadcrumb-current">Super Admin</span>
        </div>
        <div className="topbar-title-group">
          <h1 className="topbar-title">{title}</h1>
          <p className="topbar-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="topbar-profile-card">
        <div className="avatar-circle">
          <Sparkles size={15} />
        </div>
        <div className="user-info">
          <span className="user-name">{user?.name || 'Platform SuperAdmin'}</span>
          <span className="user-email">{user?.email || 'admin@voxreview.ai'}</span>
        </div>
      </div>
    </header>
  );
}
