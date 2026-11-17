import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/Feedback';
import { Spinner } from '../components/Spinner';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import type { User } from '../types/api';

const ROLE_LABEL = { ADMIN: 'Administrator', SUPPORT_AGENT: 'Support agent', CUSTOMER: 'Customer' } as const;

export function SettingsPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Loaded fresh from /api/auth/me so the page reflects the server, not a cached copy.
  useEffect(() => {
    api
      .me()
      .then(setProfile)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load your profile.'));
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="stack narrow">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Profile</h2>
            <p className="muted">Your account details.</p>
          </div>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {!profile && !error ? <Spinner label="Loading profile" /> : null}

        {profile ? (
          <dl className="details">
            <div>
              <dt>Name</dt>
              <dd>{profile.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{ROLE_LABEL[profile.role]}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{formatDate(profile.createdAt)}</dd>
            </div>
          </dl>
        ) : null}

        <p className="muted small note">Changing your name or password is not available yet.</p>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Session</h2>
            <p className="muted">Signing out ends this session on the server.</p>
          </div>
        </div>
        <button type="button" className="button button-secondary" onClick={() => void handleSignOut()} disabled={signingOut}>
          {signingOut ? <Spinner size="sm" /> : <LogOut size={16} aria-hidden="true" />} Sign out
        </button>
      </section>
    </div>
  );
}
