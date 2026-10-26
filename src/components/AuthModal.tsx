/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from '../services/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      if (onAuthSuccess) onAuthSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Google sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
        if (onAuthSuccess) onAuthSuccess();
        onClose();
      } else if (mode === 'signup') {
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        await createUserWithEmailAndPassword(auth, email, password);
        if (onAuthSuccess) onAuthSuccess();
        onClose();
      } else if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        setMessage('Password reset email sent! Check your inbox.');
      }
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (code === 'auth/email-already-in-use') {
        setError('This email is already in use. Try signing in.');
      } else {
        setError(err?.message || 'Authentication error.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-md" className="on">
      <div className="box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: '18px' }}>
            {mode === 'signin' && 'Sign In to Inkpad'}
            {mode === 'signup' && 'Create Inkpad Account'}
            {mode === 'reset' && 'Reset Password'}
          </b>
          <button
            type="button"
            className="ic"
            onClick={onClose}
            aria-label="Close"
            style={{ fontSize: '18px', padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: 0, fontSize: '13px', color: 'var(--mu)' }}>
          {mode === 'signin' && 'Sign in to sync all notebooks and drawings across devices.'}
          {mode === 'signup' && 'Sign up to safely back up all your drawings and notebooks to the cloud.'}
          {mode === 'reset' && 'Enter your account email to receive a password recovery link.'}
        </p>

        {error && (
          <div style={{ background: 'rgba(229, 56, 59, 0.1)', color: '#e5383b', padding: '8px 12px', borderRadius: '8px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: 'rgba(42, 157, 79, 0.1)', color: '#2a9d4f', padding: '8px 12px', borderRadius: '8px', fontSize: '13px' }}>
            {message}
          </div>
        )}

        {/* Google Sign-in button */}
        {mode !== 'reset' && (
          <>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                width: '100%',
                fontWeight: 600,
                padding: '10px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Continue with Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mu)', fontSize: '12px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--bd)' }} />
              <span>or email</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--bd)' }} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              aria-label="Email"
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 chars)"
                required
                aria-label="Password"
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="on" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Link'}
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
          {mode === 'signin' && (
            <>
              <button
                type="button"
                className="ic"
                style={{ padding: 0, textDecoration: 'underline' }}
                onClick={() => { setMode('signup'); setError(null); setMessage(null); }}
              >
                Need an account? Sign Up
              </button>
              <button
                type="button"
                className="ic"
                style={{ padding: 0, textDecoration: 'underline' }}
                onClick={() => { setMode('reset'); setError(null); setMessage(null); }}
              >
                Forgot password?
              </button>
            </>
          )}

          {mode === 'signup' && (
            <button
              type="button"
              className="ic"
              style={{ padding: 0, textDecoration: 'underline' }}
              onClick={() => { setMode('signin'); setError(null); setMessage(null); }}
            >
              Already have an account? Sign In
            </button>
          )}

          {mode === 'reset' && (
            <button
              type="button"
              className="ic"
              style={{ padding: 0, textDecoration: 'underline' }}
              onClick={() => { setMode('signin'); setError(null); setMessage(null); }}
            >
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
