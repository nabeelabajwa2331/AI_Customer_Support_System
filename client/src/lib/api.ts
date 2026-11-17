import type {
  AuthTokens,
  ChatAnswer,
  HealthStatus,
  KnowledgeDocument,
  SearchResult,
  UploadedDocument,
  User,
} from '../types/api';

const BASE_URL = '/api';
const REFRESH_KEY = 'support.refreshToken';

/** Error with the backend's stable code, so screens can react to specific cases. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// The access token lives in memory only. The refresh token is kept in
// localStorage so a page reload keeps the session; it is rotated on every use
// and revoked on logout.
let accessToken: string | null = null;
let refreshInFlight: Promise<AuthTokens | null> | null = null;
let onSessionExpired: (() => void) | null = null;

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Storage unavailable (private mode): the session simply won't survive a reload.
  }
}

export function setSession(tokens: AuthTokens | null): void {
  accessToken = tokens?.accessToken ?? null;
  writeRefreshToken(tokens?.refreshToken ?? null);
}

export function hasStoredSession(): boolean {
  return readRefreshToken() !== null;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function parseError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as {
    code?: string;
    message?: string;
    details?: unknown;
  } | null;

  return new ApiError(
    response.status,
    body?.code ?? `HTTP_${response.status}`,
    body?.message ?? 'Something went wrong. Please try again.',
    body?.details,
  );
}

/** Exchanges the stored refresh token for a new pair. Concurrent callers share one request. */
export function refreshSession(): Promise<AuthTokens | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  refreshInFlight ??= fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) {
        setSession(null);
        return null;
      }
      const tokens = (await response.json()) as AuthTokens;
      setSession(tokens);
      return tokens;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

async function send(path: string, { method = 'GET', body, auth = true, signal }: RequestOptions) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isForm = body instanceof FormData;

  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    signal,
  });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;

  try {
    response = await send(path, options);

    // An expired access token is refreshed once, then the request is retried.
    if (response.status === 401 && options.auth !== false && readRefreshToken()) {
      const tokens = await refreshSession();
      if (!tokens) {
        onSessionExpired?.();
        throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
      }
      response = await send(path, options);
    }
  } catch (error) {
    if (error instanceof ApiError || (error instanceof DOMException && error.name === 'AbortError')) {
      throw error;
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check that the API is running.');
  }

  if (!response.ok) throw await parseError(response);

  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthTokens>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),

  register: (name: string, email: string, password: string) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: { name, email, password },
      auth: false,
    }),

  logout: async () => {
    const refreshToken = readRefreshToken();
    setSession(null);
    if (refreshToken) {
      await request('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }).catch(
        () => undefined,
      );
    }
  },

  me: () => request<{ user: User }>('/auth/me').then((body) => body.user),

  health: () => request<HealthStatus>('/health', { auth: false }),

  askQuestion: (question: string, signal?: AbortSignal) =>
    request<ChatAnswer>('/chat', { method: 'POST', body: { question }, signal }),

  listDocuments: () =>
    request<{ documents: KnowledgeDocument[] }>('/knowledge/documents').then((b) => b.documents),

  deleteDocument: (id: string) =>
    request(`/knowledge/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ document: UploadedDocument }>('/knowledge/upload', {
      method: 'POST',
      body: form,
    }).then((b) => b.document);
  },

  searchKnowledge: (query: string, topK = 5) =>
    request<{ results: SearchResult[] }>('/knowledge/search', {
      method: 'POST',
      body: { query, topK },
    }).then((b) => b.results),
};
