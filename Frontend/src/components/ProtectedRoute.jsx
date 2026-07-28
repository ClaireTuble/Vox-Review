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
  const isAuthenticated = authService.isAuthenticated();
  const currentRole = authService.checkRole();

  if (!isAuthenticated) {
    // Redirect unauthenticated user to /login with state saved
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRole && currentRole !== allowedRole) {
    // If logged in user tries to access a role-unauthorized route, redirect to their proper dashboard
    if (currentRole === 'superadmin') {
      return <Navigate to="/superadmin/dashboard" replace />;
    } else {
      return <Navigate to="/user/dashboard" replace />;
    }
  }

  return children;
}
