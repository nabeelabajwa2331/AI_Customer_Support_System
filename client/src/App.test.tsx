import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders, AppRoutes } from './App';
import type { AuthTokens, Role } from './types/api';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function session(role: Role): AuthTokens {
  return {
    accessToken: 'access',
    refreshToken: 'refresh-next',
    tokenType: 'Bearer',
    expiresIn: '15m',
    user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role, createdAt: '2026-11-01T00:00:00Z', updatedAt: '' },
  };
}

/** Restores a stored session for `role`, then answers API calls with `routes`. */
function mockBackend(role: Role | null, routes: Record<string, unknown> = {}) {
  if (role) localStorage.setItem('support.refreshToken', 'refresh-stored');

  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh')) return role ? json(200, session(role)) : json(401, {});
    for (const [path, body] of Object.entries(routes)) {
      if (url.endsWith(path)) return json(200, body);
    }
    return json(404, { code: 'NOT_FOUND', message: 'Not found' });
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe('routing and roles', () => {
  it('sends a signed-out visitor to the sign-in page', async () => {
    mockBackend(null);
    renderAt('/knowledge');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('restores a stored session and keeps a CUSTOMER out of staff pages', async () => {
    mockBackend('CUSTOMER');
    renderAt('/knowledge');

    expect(await screen.findByRole('heading', { name: 'AI Assistant', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Knowledge Base/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Support Tickets')).not.toBeInTheDocument();
  });

  it('shows staff pages to an ADMIN, and no navigation for features that do not exist yet', async () => {
    mockBackend('ADMIN', { '/knowledge/documents': { documents: [] }, '/health': { status: 'ok' } });
    renderAt('/overview');

    expect(await screen.findByRole('heading', { name: /Good (morning|afternoon|evening), Ada/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Knowledge Base/ })).toBeInTheDocument();
    expect(screen.queryByText('Support Tickets')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Operational')).toBeInTheDocument());
  });
});

describe('AI assistant', () => {
  it('sends the question and shows the answer with one chip per source document', async () => {
    const fetchMock = mockBackend('CUSTOMER', {
      '/chat': {
        answer: 'Refunds can be requested within 14 calendar days.',
        sources: [
          { chunkId: 'c1', documentId: 'd1', chunkIndex: 0, tokenCount: 10, distance: 0.4, similarity: 0.6, document: { id: 'd1', title: 'refund-policy.txt', source: null, sourceType: null, mimeType: null } },
          { chunkId: 'c2', documentId: 'd1', chunkIndex: 1, tokenCount: 10, distance: 0.5, similarity: 0.5, document: { id: 'd1', title: 'refund-policy.txt', source: null, sourceType: null, mimeType: null } },
        ],
      },
    });
    renderAt('/assistant');

    await userEvent.type(await screen.findByLabelText('Your question'), 'How long do I have?');
    await userEvent.click(screen.getByRole('button', { name: 'Send question' }));

    expect(await screen.findByText('Refunds can be requested within 14 calendar days.')).toBeInTheDocument();
    expect(screen.getAllByText('refund-policy.txt')).toHaveLength(1);

    const chatCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/chat'));
    expect(JSON.parse(chatCall![1]!.body as string)).toEqual({ question: 'How long do I have?' });
  });

  it('explains a rate limit instead of showing a raw error', async () => {
    localStorage.setItem('support.refreshToken', 'refresh-stored');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/auth/refresh')
        ? json(200, session('CUSTOMER'))
        : json(429, { code: 'RATE_LIMITED', message: 'Too many questions.' }),
    );
    renderAt('/assistant');

    await userEvent.type(await screen.findByLabelText('Your question'), 'Hello{Enter}');

    expect(await screen.findByText(/sending questions quickly/)).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('saves a new display name and updates the menu', async () => {
    const fetchMock = mockBackend('CUSTOMER', {
      '/auth/me': { success: true, user: { ...session('CUSTOMER').user, name: 'Ada King' } },
    });
    renderAt('/settings');

    const input = await screen.findByLabelText('Display name');
    await waitFor(() => expect(input).toHaveValue('Ada King'));

    await userEvent.clear(input);
    await userEvent.type(input, 'Countess Ada');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const patch = await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(call).toBeDefined();
      return call!;
    });
    expect(JSON.parse(patch[1]!.body as string)).toEqual({ name: 'Countess Ada' });
    expect(await screen.findByText('Profile updated')).toBeInTheDocument();
  });

  it('blocks a password change until the confirmation matches', async () => {
    mockBackend('CUSTOMER', { '/auth/me': { success: true, user: session('CUSTOMER').user } });
    renderAt('/settings?tab=security');

    await userEvent.type(await screen.findByLabelText(/^Current password/), 'OldPass123');
    await userEvent.type(screen.getByLabelText(/^New password/), 'NewPass456!');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'Different1');

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
  });
});

describe('Continue with Google', () => {
  it('is hidden when the backend has no Google client ID configured', async () => {
    mockBackend(null, { '/auth/google/config': { success: true, enabled: false, clientId: null } });
    renderAt('/login');

    await screen.findByRole('heading', { name: 'Sign in' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId('google-button')).not.toBeInTheDocument();
  });

  it('loads Google Identity Services with the configured client ID', async () => {
    mockBackend(null, {
      '/auth/google/config': { success: true, enabled: true, clientId: 'abc.apps.googleusercontent.com' },
    });
    renderAt('/login');

    expect(await screen.findByTestId('google-button')).toBeInTheDocument();
    expect(screen.getByText('or')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('script[src="https://accounts.google.com/gsi/client"]')).not.toBeNull(),
    );
  });
});

describe('registration', () => {
  it('validates fields before calling the API', async () => {
    const fetchMock = mockBackend(null);
    renderAt('/register');

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText(/^Password/), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/register'))).toBe(false);
  });
});
