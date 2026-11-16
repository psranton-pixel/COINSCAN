import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FIREBASE_AUTH_PROVIDERS_URL, FIREBASE_AUTH_SETTINGS_URL } from '../services/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
}

interface FormattedAuthError {
  message: string;
  consoleUrl?: string;
  consoleLabel?: string;
  suggestGoogle?: boolean;
  suggestSignIn?: boolean;
}

function formatFirebaseAuthError(err: any): FormattedAuthError {
  const code = String(err?.code || '').toLowerCase();
  const rawMessage = String(err?.message || '');

  if (code === 'auth/operation-not-allowed' || rawMessage.includes('operation-not-allowed')) {
    return {
      message:
        'Email/Password sign-up is currently disabled in this Firebase project. Use "Continue with Google" above to open a new account right away, or enable the Email/Password provider in Firebase Console.',
      consoleUrl: FIREBASE_AUTH_PROVIDERS_URL,
      consoleLabel: 'Open Firebase Sign-in Providers',
      suggestGoogle: true,
    };
  }

  if (code === 'auth/admin-restricted-operation' || rawMessage.includes('admin-restricted-operation')) {
    return {
      message:
        'New account sign-ups are restricted in Firebase Authentication settings. Try "Continue with Google" above or check user sign-up settings in Firebase Console.',
      consoleUrl: FIREBASE_AUTH_SETTINGS_URL,
      consoleLabel: 'Open Firebase Auth Settings',
      suggestGoogle: true,
    };
  }

  if (code === 'auth/unauthorized-domain' || rawMessage.includes('unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return {
      message: `Domain "${host}" is not listed under Firebase Authorized Domains. Add it in Firebase Console → Authentication → Settings → Authorized domains.`,
      consoleUrl: FIREBASE_AUTH_SETTINGS_URL,
      consoleLabel: 'Add Authorized Domain in Firebase',
    };
  }

  if (code === 'auth/email-already-in-use' || rawMessage.includes('email-already-in-use')) {
    return {
      message: 'An account with this email already exists. Switch to Sign In to access it.',
      suggestSignIn: true,
    };
  }

  if (code === 'auth/weak-password') {
    return { message: 'Password must be at least 6 characters long.' };
  }

  if (code === 'auth/invalid-email') {
    return { message: 'Please enter a valid email address.' };
  }

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return { message: 'Incorrect email or password. Double-check your details or reset your password.' };
  }

  if (code === 'auth/popup-blocked') {
    return {
      message:
        'Your browser blocked the Google sign-in pop-up. Allow pop-ups for this site in your browser settings and try again.',
    };
  }

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return {
      message: 'Google sign-in window was closed before completing. Tap "Continue with Google" to try again.',
    };
  }

  if (code === 'auth/too-many-requests') {
    return { message: 'Too many sign-in attempts. Wait a few minutes and try again.' };
  }

  if (code === 'auth/network-request-failed') {
    return { message: 'Network error connecting to Firebase Auth. Check your internet connection and retry.' };
  }

  return {
    message: rawMessage || 'Authentication failed. Please verify credentials and try again.',
  };
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, defaultMode = 'signin' }) => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorInfo, setErrorInfo] = useState<FormattedAuthError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
      setErrorInfo(null);
      setSuccess(null);
      setLoading(false);
    }
  }, [isOpen, defaultMode]);

  if (!isOpen) return null;

  const switchMode = (nextMode: 'signin' | 'signup' | 'reset') => {
    setMode(nextMode);
    setErrorInfo(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorInfo(null);
    setSuccess(null);
    setLoading(true);
    const trimmedEmail = email.trim();

    try {
      if (mode === 'reset') {
        if (!trimmedEmail) throw new Error('Please enter your email address');
        await resetPassword(trimmedEmail);
        setSuccess('Password reset link has been dispatched to your email.');
      } else if (mode === 'signup') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
        await signUpWithEmail(trimmedEmail, password);
        onClose();
      } else {
        await signInWithEmail(trimmedEmail, password);
        onClose();
      }
    } catch (err: any) {
      setErrorInfo(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setErrorInfo(null);
    setSuccess(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: any) {
      setErrorInfo(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-slate-900 border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-y-auto max-h-[92dvh] p-5 sm:p-8 pb-safe"
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-full pb-3 flex justify-center">
          <div className="w-10 h-1 bg-slate-700 rounded-full" />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand Icon */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-amber-400/10 to-transparent border border-amber-500/30 flex items-center justify-center mb-2.5 shadow-lg shadow-amber-500/10">
            <span className="font-serif-title font-bold text-2xl text-amber-400">₵</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-serif-title text-slate-100">
            {mode === 'signin' && 'Sign in to CoinScan Pro'}
            {mode === 'signup' && 'Create Collector Account'}
            {mode === 'reset' && 'Reset Password'}
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Your coin collection is isolated in your private database partition.
          </p>
        </div>

        {errorInfo && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorInfo.message}</span>
            </div>
            {(errorInfo.consoleUrl || errorInfo.suggestSignIn) && (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                {errorInfo.suggestSignIn && (
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold hover:bg-amber-500/30 cursor-pointer"
                  >
                    Switch to Sign In
                  </button>
                )}
                {errorInfo.consoleUrl && (
                  <a
                    href={errorInfo.consoleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-amber-300 hover:text-amber-200 font-semibold"
                  >
                    <span>{errorInfo.consoleLabel || 'Open Firebase Console'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        {/* Google One-Click Button (works immediately for new and existing accounts) */}
        {mode !== 'reset' && (
          <div className="space-y-3 mb-4">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="w-full min-h-[46px] flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-sm font-semibold text-slate-200 transition-colors shadow-sm cursor-pointer disabled:opacity-60"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{mode === 'signup' ? 'Create Account with Google' : 'Continue with Google'}</span>
            </button>
            <p className="text-[11px] text-slate-400 text-center">
              Instant sign-in or new account creation using any Google account.
            </p>

            <div className="relative flex items-center justify-center pt-1">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-900 px-3 text-[11px] text-slate-500 whitespace-nowrap">
                Or with Email
              </span>
            </div>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="collector@example.com"
                className="w-full min-h-[44px] pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-slate-300">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-[11px] text-amber-400 hover:text-amber-300"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {mode === 'signup' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Confirm Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all mt-2 cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : mode === 'signin' ? (
              'Sign In'
            ) : mode === 'signup' ? (
              'Create Free Account'
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>

        {/* Footer Toggle */}
        <div className="mt-5 text-center text-xs text-slate-400">
          {mode === 'signin' && (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-amber-400 font-semibold hover:underline cursor-pointer"
              >
                Create one now
              </button>
            </p>
          )}
          {mode === 'signup' && (
            <p>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="text-amber-400 font-semibold hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </p>
          )}
          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="text-amber-400 font-semibold hover:underline cursor-pointer"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
