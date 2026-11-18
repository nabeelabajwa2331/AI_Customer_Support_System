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

describe('landing page', () => {
  it('shows the intro page to visitors with sign-up and sign-in calls to action', async () => {
    mockBackend(null);
    renderAt('/');

    expect(screen.getByRole('heading', { level: 1, name: /Answers your customers can trust/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Get started free/ })[0]).toHaveAttribute('href', '/register');
    expect(screen.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/login');
    expect(screen.getByRole('heading', { name: /three steps/ })).toBeInTheDocument();
  });

  it('offers a signed-in staff member a link straight to the dashboard', async () => {
    mockBackend('ADMIN');
    renderAt('/');

    const links = await screen.findAllByRole('link', { name: /Open dashboard/ });
    expect(links[0]).toHaveAttribute('href', '/overview');
  });

  it('opens and closes FAQ answers', async () => {
    mockBackend(null);
    renderAt('/');

    const question = screen.getByRole('button', { name: /Can the assistant process refunds/ });
    expect(question).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    // Regression: re-rendering className must not hide an already revealed item.
    expect(question.closest('.faq-item')).toHaveAttribute('data-visible');
  });
});

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

  it('shows an ADMIN the analytics dashboard, user totals and the Users page link', async () => {
    mockBackend('ADMIN', {
      '/knowledge/documents': { documents: [] },
      '/health': { status: 'ok' },
      '/admin/analytics?days=30': { analytics: ANALYTICS },
    });
    renderAt('/overview');

    expect(await screen.findByRole('heading', { name: /Good (morning|afternoon|evening), Ada/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Knowledge Base/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Users/ })[0]).toHaveAttribute('href', '/users');
    expect(screen.queryByText('Support Tickets')).not.toBeInTheDocument();

    expect(await screen.findByText('75%')).toBeInTheDocument(); // answer rate 3/4
    expect(screen.getByText('Do you ship to the UK?')).toBeInTheDocument();
    expect(screen.getByText('Total users')).toBeInTheDocument();
    expect(screen.getByText('1.2 s')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Service operational')).toBeInTheDocument());
  });

  it('shows a SUPPORT_AGENT analytics but no user management', async () => {
    const { users: _omit, ...agentView } = ANALYTICS;
    mockBackend('SUPPORT_AGENT', {
      '/knowledge/documents': { documents: [] },
      '/health': { status: 'ok' },
      '/admin/analytics?days=30': { analytics: agentView },
    });
    renderAt('/overview');

    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Users$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Total users')).not.toBeInTheDocument();
  });

  it('keeps a SUPPORT_AGENT out of the Users page', async () => {
    mockBackend('SUPPORT_AGENT');
    renderAt('/users');

    expect(await screen.findByRole('heading', { name: 'AI Assistant', level: 1 })).toBeInTheDocument();
  });
});

const ANALYTICS = {
  days: 30,
  since: '2026-10-20T00:00:00.000Z',
  totals: {
    questions: 4,
    byOutcome: { ANSWERED: 3, NOT_SPECIFIED: 0, NO_EVIDENCE: 1, ACTION_UNAVAILABLE: 0, FAILED: 0 },
    answerRate: 0.75,
    averageLatencyMs: 1234,
    activeUsers: 2,
  },
  daily: [
    { date: '2026-11-17', questions: 1, unanswered: 0 },
    { date: '2026-11-18', questions: 3, unanswered: 1 },
  ],
  recentUnanswered: [
    {
      id: 'log-1',
      question: 'Do you ship to the UK?',
      outcome: 'NO_EVIDENCE',
      createdAt: '2026-11-18T10:00:00.000Z',
      user: { id: 'u2', name: 'Grace Hopper' },
    },
  ],
  topDocuments: [{ id: 'd1', title: 'sample-support-policy.md', citations: 3 }],
  users: { total: 5, newInPeriod: 2 },
};

describe('users page', () => {
  const LIST = {
    users: [
      { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'ADMIN', createdAt: '2026-11-01T00:00:00Z', updatedAt: '', questionCount: 0, documentCount: 1 },
      { id: 'u2', name: 'Grace Hopper', email: 'grace@example.com', role: 'CUSTOMER', createdAt: '2026-11-02T00:00:00Z', updatedAt: '', questionCount: 4, documentCount: 0 },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    roleCounts: { CUSTOMER: 1, SUPPORT_AGENT: 0, ADMIN: 1 },
  };

  it('lists users, locks the admin’s own row, and changes a role after confirmation', async () => {
    const fetchMock = mockBackend('ADMIN');
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return json(200, session('ADMIN'));
      if (url.includes('/admin/users/u2') && init?.method === 'PATCH') {
        return json(200, { user: { ...LIST.users[1], role: 'SUPPORT_AGENT' } });
      }
      if (url.includes('/admin/users')) return json(200, LIST);
      return json(404, {});
    });
    renderAt('/users');

    expect(await screen.findByText('grace@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Role for Ada Lovelace')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Delete Ada Lovelace' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Role for Grace Hopper'), 'SUPPORT_AGENT');
    expect(screen.getByRole('dialog')).toHaveTextContent('dashboard, analytics and knowledge base');
    await userEvent.click(screen.getByRole('button', { name: 'Change role' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users/u2'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'SUPPORT_AGENT' }) }),
      ),
    );
    expect(await screen.findByText('Role updated')).toBeInTheDocument();
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
