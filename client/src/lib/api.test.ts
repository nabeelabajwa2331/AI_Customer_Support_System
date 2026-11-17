import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api, refreshSession, request, setSession, setSessionExpiredHandler } from './api';
import type { AuthTokens } from '../types/api';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const tokens = (suffix: string): AuthTokens => ({
  accessToken: `access-${suffix}`,
  refreshToken: `refresh-${suffix}`,
  tokenType: 'Bearer',
  expiresIn: '15m',
  user: { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'CUSTOMER', createdAt: '', updatedAt: '' },
});

beforeEach(() => {
  setSession(null);
  setSessionExpiredHandler(null);
});

describe('request', () => {
  it('sends the access token and returns the parsed body', async () => {
    setSession(tokens('1'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { ok: true }));

    await expect(request('/thing')).resolves.toEqual({ ok: true });
    expect(new Headers(fetchMock.mock.calls[0]![1]!.headers).get('Authorization')).toBe('Bearer access-1');
  });

  it('refreshes once on 401, stores the rotated tokens, and retries', async () => {
    setSession(tokens('old'));
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { code: 'UNAUTHENTICATED' }))
      .mockResolvedValueOnce(json(200, tokens('new')))
      .mockResolvedValueOnce(json(200, { ok: true }));

    await expect(request('/thing')).resolves.toEqual({ ok: true });

    expect(fetchMock.mock.calls[1]![0]).toBe('/api/auth/refresh');
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual({ refreshToken: 'refresh-old' });
    expect(new Headers(fetchMock.mock.calls[2]![1]!.headers).get('Authorization')).toBe('Bearer access-new');
    expect(localStorage.getItem('support.refreshToken')).toBe('refresh-new');
  });

  it('clears the session and notifies when the refresh token is rejected', async () => {
    setSession(tokens('old'));
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(401, {}));

    await expect(request('/thing')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(expired).toHaveBeenCalledOnce();
    expect(localStorage.getItem('support.refreshToken')).toBeNull();
  });

  it('turns backend error bodies into ApiError with the stable code', async () => {
    setSession(tokens('1'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(429, { success: false, code: 'RATE_LIMITED', message: 'Too many questions.' }),
    );

    const error = await request('/chat').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', message: 'Too many questions.' });
  });

  it('reports a network failure as NETWORK_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(request('/health', { auth: false })).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});

describe('refreshSession', () => {
  it('shares one in-flight refresh between concurrent callers (rotated tokens cannot be reused)', async () => {
    setSession(tokens('old'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, tokens('new')));

    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(a?.accessToken).toBe('access-new');
    expect(b?.accessToken).toBe('access-new');
  });
});

describe('api.logout', () => {
  it('revokes the refresh token on the server and clears local state', async () => {
    setSession(tokens('1'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { success: true }));

    await api.logout();

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/logout');
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ refreshToken: 'refresh-1' });
    expect(localStorage.getItem('support.refreshToken')).toBeNull();
  });
});
