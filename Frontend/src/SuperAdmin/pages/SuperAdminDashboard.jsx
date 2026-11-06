import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../../services/authService.js';
import {
  attemptSuperAdminLogout,
  startSuperAdminInactivityMonitor,
} from '../utils/securitySettings.js';
import Dashboard from './Dashboard.jsx';
import Users from './Users.jsx';
import Platforms from './Platforms.jsx';
import PlatformSettings from './PlatformSettings.jsx';
import AdminActivityLogs from './AdminActivityLogs.jsx';
import Settings from './Settings.jsx';
import LogoutConfirmationModal from '../../components/LogoutConfirmationModal.jsx';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [activeAdminTab, setActiveAdminTab] = useState('overview');
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [forcedLogoutSubmitting, setForcedLogoutSubmitting] = useState(false);
  const [forcedLogoutError, setForcedLogoutError] = useState('');
  const superAdminId = authService.getCurrentSuperAdminUser()?.id;

  const attemptForcedLogout = useCallback(async (reason) => {
    setForcedLogoutSubmitting(true);
    setForcedLogoutError('');
    try {
      return await attemptSuperAdminLogout({
        logout: () => authService.logout('superadmin'),
        onSuccess: () => navigate('/admin/login', { replace: true }),
        onFailure: (error) => {
          console.error(`VoxReview: ${reason} Super Admin logout failed.`, error.message);
          setForcedLogoutError(
            `${reason} Sign-out could not be confirmed. Your session may still be active. Retry sign out.`,
          );
        },
      });
    } finally {
      setForcedLogoutSubmitting(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!superAdminId) return undefined;

    try {
      return startSuperAdminInactivityMonitor({
        userId: superAdminId,
        onTimeout: () => {
          void attemptForcedLogout('Inactivity timeout.');
        },
      });
    } catch (error) {
      console.error('VoxReview: Could not enforce the Super Admin inactivity timeout.', error.message);
      queueMicrotask(() => {
        void attemptForcedLogout('Inactivity protection failure.');
      });
      return undefined;
    }
  }, [attemptForcedLogout, superAdminId]);

  const handleSignOut = () => {
    setLogoutError('');
    setShowLogoutConfirmation(true);
  };

  const confirmSignOut = async () => {
    if (logoutSubmitting) return;
    setLogoutSubmitting(true);
    setLogoutError('');
    try {
      await authService.logout('superadmin');
      setShowLogoutConfirmation(false);
      navigate('/admin/login', { replace: true });
    } catch (error) {
      setLogoutError(error.message || 'Could not sign out of this session.');
    } finally {
      setLogoutSubmitting(false);
    }
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
      case 'security':
      case 'settings':
        return <Settings activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
      case 'overview':
      default:
        return <Dashboard activeTab={activeAdminTab} setActiveTab={setActiveAdminTab} onSignOut={handleSignOut} />;
    }
  };

  return (
    <>
      {renderActivePage()}
      {forcedLogoutError && (
        <div role="alert" className="settings-notice-toast notice-error">
          <span>{forcedLogoutError}</span>
          <button
            type="button"
            onClick={() => void attemptForcedLogout('Retry.')}
            disabled={forcedLogoutSubmitting}
          >
            {forcedLogoutSubmitting ? 'Signing out…' : 'Retry sign out'}
          </button>
        </div>
      )}
      {showLogoutConfirmation && (
        <LogoutConfirmationModal
          onCancel={() => setShowLogoutConfirmation(false)}
          onConfirm={confirmSignOut}
          submitting={logoutSubmitting}
          error={logoutError}
        />
      )}
    </>
  );
}
