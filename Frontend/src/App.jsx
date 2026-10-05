import { Navigate } from 'react-router-dom';
import LandingPage from './Public/pages/LandingPage.jsx';
import AboutPage from './Public/pages/AboutPage.jsx';
import AuthPage from './Public/pages/AuthPage.jsx';
import AfterLogPage from './Public/pages/afterlogpage.jsx';
import PopupPage from './Users/pages/PopupPage.jsx';
import SuperAdminDashboard from './SuperAdmin/pages/SuperAdminDashboard.jsx';
import SuperAdminLoginPage from './SuperAdmin/superadminAuth/sAuth.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export const appRoutes = [
  { path: '/', element: <LandingPage /> },
  { path: '/about', element: <AboutPage /> },
  { path: '/login', element: <AuthPage initialMode="login" /> },
  { path: '/register', element: <AuthPage initialMode="register" /> },
  { path: '/admin/login', element: <SuperAdminLoginPage /> },
  {
    path: '/after-login',
    element: (
      <ProtectedRoute allowedRole="user">
        <AfterLogPage />
      </ProtectedRoute>
    ),
  },
  { path: '/afterlogpage', element: <Navigate to="/after-login" replace /> },
  {
    path: '/user/dashboard',
    element: (
      <ProtectedRoute allowedRole="user">
        <PopupPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/superadmin/dashboard',
    element: (
      <ProtectedRoute allowedRole="superadmin">
        <SuperAdminDashboard />
      </ProtectedRoute>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
