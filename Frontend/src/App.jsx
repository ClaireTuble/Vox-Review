import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './Public/pages/LandingPage.jsx';
import AboutPage from './Public/pages/AboutPage.jsx';
import AuthPage from './Public/pages/AuthPage.jsx';
import PopupPage from './Users/pages/PopupPage.jsx';
import SuperAdminDashboard from './SuperAdmin/pages/SuperAdminDashboard.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/login" element={<AuthPage initialMode="login" />} />
      <Route path="/register" element={<AuthPage initialMode="register" />} />

      {/* Protected: Extension User */}
      <Route
        path="/user/dashboard"
        element={
          <ProtectedRoute allowedRole="user">
            <PopupPage />
          </ProtectedRoute>
        }
      />

      {/* Protected: SuperAdmin */}
      <Route
        path="/superadmin/dashboard"
        element={
          <ProtectedRoute allowedRole="superadmin">
            <SuperAdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
