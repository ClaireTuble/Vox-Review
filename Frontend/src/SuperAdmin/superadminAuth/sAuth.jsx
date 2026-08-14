import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertTriangle, ShieldCheck, Sparkles, Server, Activity, KeyRound, ArrowLeft } from 'lucide-react';
import logo from '../../assets/VRLogo.png';
import authService from '../../services/authService.js';
import './sAuth.css';

export default function SuperAdminLoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (ev) => {
        ev.preventDefault();
        setError('');
        if (!email || !password) { setError('Please fill in both fields.'); return; }
        setSubmitting(true);
        try {
            const res = await authService.login(email, password, 'superadmin');
            setSubmitting(false);
            if (res.success) {
                const role = authService.checkRole();
                if (role === 'superadmin') {
                    navigate('/superadmin/dashboard', { replace: true });
                } else {
                    // Logged in but not a super admin — deny access
                    authService.logout('superadmin');
                    setError('Access denied. This login is for administrators only.');
                }
            } else {
                setError('Authentication failed. Please check your credentials.');
            }
        } catch (err) {
            setSubmitting(false);
            setError(err.message || 'Authentication failed.');
        }
    };

    return (
        <div className="sa-root">
            {/* Page Ambient Glows */}
            <div className="sa-page-glow sa-page-glow-indigo" aria-hidden="true" />
            <div className="sa-page-glow sa-page-glow-purple" aria-hidden="true" />

            {/* Main Dual-Panel Container (Matches AuthPage layout) */}
            <div className="sa-container">

                {/* ── LEFT FORM PANEL ── */}
                <div className="sa-form-panel">
                    <div className="sa-forms-track">
                        <div className="sa-form-body">

                            {/* Admin Badge & Header */}
                            <div className="sa-admin-badge">
                                <ShieldCheck size={14} className="badge-shield-icon" />
                                <span>Restricted Admin Portal</span>
                            </div>

                            <div className="sa-form-header">
                                <h2 className="sa-form-title">Super Admin Access</h2>
                                <p className="sa-form-subtitle">Enter system credentials to access the admin console</p>
                            </div>

                            {/* Error Toast Banner */}
                            {error && (
                                <div className="sa-error">
                                    <AlertTriangle size={16} className="sa-error-icon" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Login Form */}
                            <form className="sa-form" onSubmit={handleSubmit} noValidate>
                                <div className="sa-field">
                                    <label htmlFor="sa-email" className="sa-label">Admin Email</label>
                                    <div className="sa-input-wrap">
                                        <Mail size={16} className="sa-icon" />
                                        <input
                                            id="sa-email"
                                            type="email"
                                            className="sa-input"
                                            placeholder="admin@example.com"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            autoComplete="email"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="sa-field">
                                    <label htmlFor="sa-password" className="sa-label">Password</label>
                                    <div className="sa-input-wrap">
                                        <Lock size={16} className="sa-icon" />
                                        <input
                                            id="sa-password"
                                            type={showPass ? 'text' : 'password'}
                                            className="sa-input"
                                            placeholder="••••••••••••"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            autoComplete="current-password"
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="sa-eye"
                                            onClick={() => setShowPass(p => !p)}
                                            aria-label="Toggle password visibility"
                                        >
                                            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="sa-options-row">
                                    <label className="sa-check-label">
                                        <input
                                            type="checkbox"
                                            className="sa-check"
                                            checked={rememberMe}
                                            onChange={e => setRememberMe(e.target.checked)}
                                        />
                                        <span>Keep admin session active</span>
                                    </label>
                                </div>

                                <button type="submit" className="sa-submit-btn" disabled={submitting}>
                                    {submitting ? 'Authenticating Admin…' : 'Sign In to Console'}
                                </button>
                            </form>

                            {/* Back to Public Site Link */}
                            <div className="sa-footer-row">
                                <Link to="/" className="sa-back-link">
                                    <ArrowLeft size={14} />
                                    <span>Return to Public Site</span>
                                </Link>
                            </div>

                        </div>
                    </div>
                </div>

                {/* ── RIGHT BRANDING PANEL (Dark Professional Admin Theme) ── */}
                <div className="sa-brand-panel">
                    <div className="sa-brand-content">
                        {/* Animated Ambient Blobs */}
                        <div className="sa-blob sa-blob-1" />
                        <div className="sa-blob sa-blob-2" />
                        <div className="sa-blob sa-blob-3" />

                        {/* Grid Overlay */}
                        <div className="sa-brand-grid" aria-hidden="true" />

                        {/* Glassmorphism Branding Card */}
                        <div className="sa-glass-card">
                            <Link to="/" className="sa-brand-logo-row">
                                <img src={logo} alt="VoxReview" className="sa-brand-logo-img" />
                                <span className="sa-brand-logo-name">VoxReview</span>
                            </Link>

                            <div className="sa-brand-headline">
                                <h1 className="sa-brand-title">
                                    <span>System</span><br />
                                    <span className="sa-brand-accent">Control Center</span>
                                </h1>
                                <p className="sa-brand-sub">
                                    Internal administration dashboard for platform management, service diagnostics, and role governance.
                                </p>
                            </div>

                            {/* Decorative Sparkle */}
                            <div className="sa-sparkle-float" aria-hidden="true">
                                <Sparkles size={26} />
                            </div>

                            {/* Admin Feature Pills */}
                            <div className="sa-feature-list">
                                <div className="sa-feature-pill">
                                    <div className="sa-feature-icon"><Server size={15} /></div>
                                    <span>Platform Diagnostics</span>
                                </div>
                                <div className="sa-feature-pill">
                                    <div className="sa-feature-icon"><Activity size={15} /></div>
                                    <span>Real-time Analytics</span>
                                </div>
                                <div className="sa-feature-pill">
                                    <div className="sa-feature-icon"><KeyRound size={15} /></div>
                                    <span>Role & Auth Controls</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
