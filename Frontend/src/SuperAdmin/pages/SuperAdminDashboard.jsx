import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../../services/authService.js';
import Dashboard from './Dashboard.jsx';
import Users from './Users.jsx';
import Platforms from './Platforms.jsx';
import PlatformSettings from './PlatformSettings.jsx';
import AdminActivityLogs from './AdminActivityLogs.jsx';
import Settings from './Settings.jsx';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [activeAdminTab, setActiveAdminTab] = useState('overview');

  const handleSignOut = () => {
    authService.logout('superadmin');
    navigate('/');
  };

  const renderActivePage = () => {
    switch (activeAdminTab) {
      case 'users':
        return <Users activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
      case 'platforms':
        return <Platforms activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
      case 'platformSettings':
        return <PlatformSettings activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
      case 'logs':
        return <AdminActivityLogs activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
      case 'settings':
        return <Settings activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
      case 'overview':
      default:
        return <Dashboard activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} />;
    }
  };

  return renderActivePage();
}
