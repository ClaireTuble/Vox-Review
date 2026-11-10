import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import authService from '../services/authService';

/**
 * Reusable Protected Route wrapper component
 * @param {Object} props
 * @param {JSX.Element} props.children - Component to render if authorized
 * @param {string} [props.allowedRole] - 'user' | 'superadmin' (Optional role requirement)
 */
export default function ProtectedRoute({ children, allowedRole }) {
  const location = useLocation();
  const currentRole = authService.checkRole();
  const [adminUser, setAdminUser] = useState(undefined);
  const [adminVerificationError, setAdminVerificationError] = useState(null);
  const [adminVerificationAttempt, setAdminVerificationAttempt] = useState(0);

  const isUserAuthenticated = authService.isAuthenticated();

  useEffect(() => {
    if (allowedRole !== 'superadmin') return undefined;

    let active = true;
    authService.verifySuperAdminSession()
      .then((user) => {
        if (active) setAdminUser(user || null);
      })
      .catch((error) => {
        console.warn('VoxReview: Super Admin session verification is temporarily unavailable.', {
          code: error?.code || null,
          status: error?.status || null,
        });
        if (active) setAdminVerificationError(error);
      });

    const handleAuthSync = (event) => {
      if (!event.detail) {
        setAdminVerificationError(null);
        setAdminUser(null);
      }
    };
    window.addEventListener('voxreview_superadmin_auth_sync', handleAuthSync);

    return () => {
      active = false;
      window.removeEventListener('voxreview_superadmin_auth_sync', handleAuthSync);
    };
  }, [allowedRole, adminVerificationAttempt]);

  if (allowedRole === 'superadmin') {
    if (adminUser === undefined) {
      if (adminVerificationError) {
        return (
          <div role="alert">
            <p>Unable to verify your Super Admin session right now.</p>
            <button
              type="button"
              onClick={() => {
                setAdminUser(undefined);
                setAdminVerificationError(null);
                setAdminVerificationAttempt((attempt) => attempt + 1);
              }}
            >
              Retry verification
            </button>
          </div>
        );
      }
      return null;
    }

    if (!adminUser) {
      return <Navigate to="/superadmin/login" state={{ from: location }} replace />;
    }

    return children;
  }

  if (!isUserAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRole && currentRole !== allowedRole) {
    if (currentRole === 'superadmin') {
      return <Navigate to="/superadmin/dashboard" replace />;
    }

    return <Navigate to="/after-login" replace />;
  }

  return children;
}
