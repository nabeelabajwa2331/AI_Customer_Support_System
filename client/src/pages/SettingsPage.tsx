import { Eye, EyeOff, KeyRound, LogOut, Monitor, Moon, Palette, Sun, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { Alert } from '../components/Feedback';
import { ROLE_LABEL } from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useTheme } from '../theme/ThemeContext';
import type { ThemePreference } from '../theme/ThemeContext';

type Tab = 'profile' | 'security' | 'appearance';

const TABS: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

function ProfileTab() {
  const { user, setCurrentUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-read from the server so the page reflects the stored profile.
  useEffect(() => {
    api
      .me()
      .then((fresh) => {
        setCurrentUser(fresh);
        setName(fresh.name);
      })
      .catch(() => undefined);
  }, [setCurrentUser]);

  if (!user) return null;

  const trimmed = name.trim();
  const dirty = trimmed !== user.name;
  const invalid = trimmed.length === 0 || trimmed.length > 120;

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!dirty || invalid) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProfile(trimmed);
      setCurrentUser(updated);
      setName(updated.name);
      toast.success('Profile updated', 'Your name has been saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-panel">
      <section className="card profile-hero">
        <Avatar name={user.name} size="lg" />
        <div className="profile-hero-text">
          <h2>{user.name}</h2>
          <p className="muted">{user.email}</p>
          <div className="profile-tags">
            <span className="tag tag-accent">{ROLE_LABEL[user.role]}</span>
            <span className="tag">Member since {formatDate(user.createdAt)}</span>
          </div>
        </div>
      </section>

      <form className="card form-card" onSubmit={handleSave}>
        <div className="form-card-head">
          <h2>Personal information</h2>
          <p className="muted">This name is shown in the dashboard and on your conversations.</p>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="form-grid">
          <label className="field">
            <span>Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-invalid={invalid} />
            {trimmed.length === 0 ? <small className="field-error">Name is required.</small> : null}
          </label>

          <label className="field">
            <span>Email address</span>
            <input value={user.email} readOnly disabled />
            <small className="field-hint">Email is used to sign in and can't be changed here.</small>
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="button button-ghost" onClick={() => setName(user.name)} disabled={!dirty || saving}>
            Cancel
          </button>
          <button type="submit" className="button button-primary" disabled={!dirty || invalid || saving}>
            {saving ? <Spinner size="sm" /> : null} Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  return { score: clamped, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][clamped]! };
}

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-affix">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          maxLength={72}
        />
        <button
          type="button"
          className="input-affix-button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
      {hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

function SecurityTab() {
  const { signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordStrength(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = current.length > 0 && next.length >= 8 && confirm === next && !saving;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed', 'Other devices have been signed out.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="settings-panel">
      <form className="card form-card" onSubmit={handleSubmit}>
        <div className="form-card-head">
          <h2>Change password</h2>
          <p className="muted">After changing it, you stay signed in here and every other device is signed out.</p>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="form-stack">
          <PasswordInput label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
          <div>
            <PasswordInput label="New password" value={next} onChange={setNext} autoComplete="new-password" />
            {next ? (
              <div className="strength" aria-live="polite">
                <div className="strength-bar">
                  {[1, 2, 3, 4].map((level) => (
                    <span key={level} className={level <= strength.score ? `on s${strength.score}` : ''} />
                  ))}
                </div>
                <span className="strength-label">{strength.label}</span>
              </div>
            ) : (
              <small className="field-hint">At least 8 characters. Longer is stronger.</small>
            )}
          </div>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              aria-invalid={mismatch}
              maxLength={72}
            />
            {mismatch ? <small className="field-error">Passwords don't match.</small> : null}
          </label>
        </div>

        <p className="muted small">Signed up with Google? Your account has no password yet, so this form can't be used.</p>

        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={!canSubmit}>
            {saving ? <Spinner size="sm" /> : null} Update password
          </button>
        </div>
      </form>

      <section className="card form-card">
        <div className="form-card-head">
          <h2>Session</h2>
          <p className="muted">Sign out of this browser. Your conversation history on this device is cleared.</p>
        </div>
        <div className="form-actions start">
          <button type="button" className="button button-secondary" onClick={() => void handleSignOut()}>
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>
      </section>
    </div>
  );
}

const THEMES: Array<{ id: ThemePreference; label: string; icon: LucideIcon; hint: string }> = [
  { id: 'light', label: 'Light', icon: Sun, hint: 'Bright and crisp' },
  { id: 'dark', label: 'Dark', icon: Moon, hint: 'Easy on the eyes' },
  { id: 'system', label: 'System', icon: Monitor, hint: 'Match your device' },
];

function AppearanceTab() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="settings-panel">
      <section className="card form-card">
        <div className="form-card-head">
          <h2>Theme</h2>
          <p className="muted">Saved on this device.</p>
        </div>
        <div className="theme-options" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ id, label, icon: Icon, hint }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={preference === id}
              className={`theme-option ${preference === id ? 'is-selected' : ''}`}
              onClick={() => setPreference(id)}
            >
              <span className={`theme-preview theme-preview-${id}`} aria-hidden="true">
                <span />
                <span />
              </span>
              <span className="theme-option-label">
                <Icon size={15} aria-hidden="true" /> {label}
              </span>
              <span className="muted small">{hint}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'profile') as Tab;

  return (
    <div className="page">
      <PageHeader title="Settings" description="Manage your profile, password and preferences." />

      <div className="settings-layout">
        <nav className="tabs" role="tablist" aria-label="Settings sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`tab ${tab === id ? 'is-active' : ''}`}
              onClick={() => setParams(id === 'profile' ? {} : { tab: id }, { replace: true })}
            >
              <Icon size={16} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>

        <div role="tabpanel">
          {tab === 'profile' ? <ProfileTab /> : null}
          {tab === 'security' ? <SecurityTab /> : null}
          {tab === 'appearance' ? <AppearanceTab /> : null}
        </div>
      </div>
    </div>
  );
}
