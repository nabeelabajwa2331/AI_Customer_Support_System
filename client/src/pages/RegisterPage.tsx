import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/Feedback';
import { Spinner } from '../components/Spinner';
import { ApiError, api } from '../lib/api';
import { AuthShell } from './LoginPage';

// Mirrors server/src/schemas/auth.schemas.ts so most mistakes are caught before a request.
function validate(name: string, email: string, password: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (password.length > 72) errors.password = 'Use at most 72 characters.';
  return errors;
}

export function RegisterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const errors = validate(name, email, password);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await api.register(name.trim(), email.trim(), password);
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'An account with this email already exists.'
          : err instanceof ApiError
            ? err.message
            : 'Registration failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h1>Create an account</h1>
        <p className="muted">Get answers about orders, refunds and policies.</p>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <label className="field">
          <span>Full name</span>
          <input
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!fieldErrors.name}
          />
          {fieldErrors.name ? <small className="field-error">{fieldErrors.name}</small> : null}
        </label>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email}
          />
          {fieldErrors.email ? <small className="field-error">{fieldErrors.email}</small> : null}
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldErrors.password}
          />
          {fieldErrors.password ? (
            <small className="field-error">{fieldErrors.password}</small>
          ) : (
            <small className="field-hint">At least 8 characters.</small>
          )}
        </label>

        <button type="submit" className="button button-primary button-block" disabled={submitting}>
          {submitting ? <Spinner size="sm" /> : null}
          {submitting ? 'Creating account' : 'Create account'}
        </button>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
