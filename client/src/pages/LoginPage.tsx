import { Bot, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { STAFF_ROLES, useAuth } from '../auth/AuthContext';
import { Alert } from '../components/Feedback';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { Spinner } from '../components/Spinner';
import { ApiError } from '../lib/api';
import type { User } from '../types/api';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-aside" aria-hidden="true">
        <div className="brand">
          <span className="brand-mark">
            <Bot size={18} />
          </span>
          <span className="brand-name">Support Desk</span>
        </div>
        <div className="auth-aside-body">
          <h2>Answers grounded in your own policies.</h2>
          <ul>
            <li>
              <Sparkles size={16} /> AI replies cite the documents they come from
            </li>
            <li>
              <ShieldCheck size={16} /> Runs on local models; data stays on your server
            </li>
          </ul>
        </div>
      </section>
      <section className="auth-main">{children}</section>
    </div>
  );
}

export function LoginPage() {
  const { user, signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const registered = (location.state as { registered?: boolean } | null)?.registered;
  const from = (location.state as { from?: string } | null)?.from;

  if (user) return <Navigate to="/" replace />;

  function goHome(signedIn: User) {
    const home = STAFF_ROLES.includes(signedIn.role) ? '/overview' : '/assistant';
    navigate(from && from !== '/login' ? from : home, { replace: true });
  }

  async function handleGoogle(credential: string) {
    setError(null);
    setSubmitting(true);
    try {
      goHome(await signInWithGoogle(credential));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      goHome(await signIn(email.trim(), password));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'The email or password is incorrect.'
          : err instanceof ApiError
            ? err.message
            : 'Sign-in failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h1>Sign in</h1>
        <p className="muted">Welcome back. Sign in to continue.</p>

        {registered ? <Alert tone="success">Account created. You can sign in now.</Alert> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button type="submit" className="button button-primary button-block" disabled={submitting || !email || !password}>
          {submitting ? <Spinner size="sm" /> : null}
          {submitting ? 'Signing in' : 'Sign in'}
        </button>

        <GoogleSignIn onCredential={(c) => void handleGoogle(c)} onError={setError} />

        <p className="auth-switch">
          New customer? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
