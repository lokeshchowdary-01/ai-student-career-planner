import React, { useState, useEffect } from 'react';
import { API_BASE_URL, setAuthToken } from '../apiConfig';

/**
 * AuthModal Component
 * Provides complete authentication experience:
 * - Login (Email + Password)
 * - Register (Name + Email + Password + Confirm Password)
 * - Input validation & loading states
 * - Inline error alerts
 * - Demo account quick-fill
 */
export default function AuthModal({
  isOpen,
  initialMode = 'login',
  onClose,
  onSuccess,
  showToast = () => {}
}) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync mode with prop when opened
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
    }
  }, [isOpen, initialMode]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setConfirmPassword('');
    setError(null);
  };

  const handleSwitchMode = (newMode) => {
    setMode(newMode);
    setError(null);
  };

  const fillDemoAccount = () => {
    setEmail('alex.rivera@example.com');
    setPassword('demo12345');
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Client-side validations
    if (mode === 'register') {
      if (!name.trim() || name.trim().length < 2) {
        setError('Please enter a valid full name (at least 2 characters).');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please re-enter.');
        return;
      }
    } else {
      if (!email.trim() || !password) {
        setError('Please enter both your email and password.');
        return;
      }
    }

    setLoading(true);

    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const payload = mode === 'register'
      ? { name: name.trim(), email: email.trim().toLowerCase(), password }
      : { email: email.trim().toLowerCase(), password };

    try {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.detail || `Authentication failed (${res.status})`);
      }

      // Store authentication token
      setAuthToken(data.token);

      showToast(
        mode === 'register'
          ? `Welcome to LearnOrbit, ${data.user.name}!`
          : `Welcome back, ${data.user.name}!`,
        'success'
      );

      resetForm();
      if (onSuccess) {
        onSuccess(data);
      }
      onClose();
    } catch (err) {
      console.error('Auth error:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="modal-box auth-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="auth-tabs" role="tablist">
            <button
              id="auth-tab-login"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('login')}
              type="button"
            >
              Sign In
            </button>
            <button
              id="auth-tab-register"
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('register')}
              type="button"
            >
              Create Account
            </button>
          </div>
          <button
            className="modal-close-btn"
            id="auth-modal-close"
            onClick={onClose}
            aria-label="Close authentication modal"
          >
            &times;
          </button>
        </div>

        <div className="auth-modal-body">
          <h3 id="auth-modal-title" className="auth-title">
            {mode === 'login' ? 'Sign in to LearnOrbit' : 'Start Your Career Journey'}
          </h3>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Access your personalized learning roadmap, study streaks, and AI career mentor.'
              : 'Create an account to track your skill gaps, study milestones, and career readiness.'}
          </p>

          {error && (
            <div className="auth-alert-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="modal-form auth-form">
            {mode === 'register' && (
              <div className="form-group">
                <label htmlFor="auth-register-name">Full Name *</label>
                <input
                  id="auth-register-name"
                  type="text"
                  placeholder="e.g. Jordan Lee"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  required
                  autoFocus
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor={mode === 'login' ? 'auth-login-email' : 'auth-register-email'}>
                Email Address *
              </label>
              <input
                id={mode === 'login' ? 'auth-login-email' : 'auth-register-email'}
                type="email"
                placeholder="student@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                autoFocus={mode === 'login'}
              />
            </div>

            <div className="form-group">
              <label htmlFor={mode === 'login' ? 'auth-login-password' : 'auth-register-password'}>
                Password *
              </label>
              <input
                id={mode === 'login' ? 'auth-login-password' : 'auth-register-password'}
                type="password"
                placeholder={mode === 'register' ? 'At least 6 characters' : 'Enter your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label htmlFor="auth-register-confirm">Confirm Password *</label>
                <input
                  id="auth-register-confirm"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            )}

            <div className="auth-form-actions">
              <button
                type="submit"
                id={mode === 'login' ? 'auth-login-submit' : 'auth-register-submit'}
                className="btn btn-primary auth-submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <span className="btn-loading-content">
                    <span className="auth-spinner" aria-hidden="true"></span>
                    <span>{mode === 'login' ? 'Signing In...' : 'Creating Account...'}</span>
                  </span>
                ) : (
                  <span>{mode === 'login' ? 'Sign In' : 'Create Student Account'}</span>
                )}
              </button>
            </div>
          </form>

          {mode === 'login' && (
            <div className="auth-demo-helper">
              <button
                type="button"
                className="btn-link-demo"
                onClick={fillDemoAccount}
                title="Fill demo credentials"
              >
                Use Alex Rivera Demo Credentials
              </button>
            </div>
          )}

          <div className="auth-footer-toggle">
            {mode === 'login' ? (
              <p>
                Don't have an account?{' '}
                <button
                  type="button"
                  className="auth-inline-link"
                  onClick={() => handleSwitchMode('register')}
                >
                  Create one now
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  className="auth-inline-link"
                  onClick={() => handleSwitchMode('login')}
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
