import { Navigate, useLocation } from 'react-router-dom';
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

  const isUserAuthenticated = authService.isAuthenticated();
  const isSuperAdminAuthenticated = authService.isSuperAdminAuthenticated();

  if (allowedRole === 'superadmin') {
    if (!isSuperAdminAuthenticated) {
      return <Navigate to="/admin/login" state={{ from: location }} replace />;
    }

    if (currentRole !== 'superadmin') {
      return <Navigate to="/superadmin/dashboard" replace />;
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
