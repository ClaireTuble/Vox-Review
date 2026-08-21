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

  const isUserAuthenticated = authService.isAuthenticated();

  useEffect(() => {
    if (allowedRole !== 'superadmin') return undefined;

    let active = true;
    authService.verifySuperAdminSession().then((user) => {
      if (active) setAdminUser(user || null);
    });

    return () => { active = false; };
  }, [allowedRole]);

  if (allowedRole === 'superadmin') {
    if (adminUser === undefined) {
      return null;
    }

    if (!adminUser) {
      return <Navigate to="/admin/login" state={{ from: location }} replace />;
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

    return <Navigate to="/user/dashboard" replace />;
  }

  return children;
}
