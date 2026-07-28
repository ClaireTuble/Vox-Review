import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../../services/authService.js';
import Dashboard from './Dashboard.jsx';
import Users from './Users.jsx';
import Platforms from './Platforms.jsx';
import Settings from './Settings.jsx';
import Analytics from './Analytics.jsx';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [activeAdminTab, setActiveAdminTab] = useState('overview');

  const handleSignOut = () => {
    authService.logout();
    navigate('/');
  };

  const renderActivePage = () => {
    switch (activeAdminTab) {
      case 'users':
        return <Users activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
      case 'platforms':
        return <Platforms activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
      case 'settings':
        return <Settings activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
      case 'analytics':
        return <Analytics activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
      case 'overview':
      default:
        return <Dashboard activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} />;
    }
  };

  return renderActivePage();
}
