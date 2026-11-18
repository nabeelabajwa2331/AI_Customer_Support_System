import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { answerCustomerQuestionMock, verifyAccessTokenMock, findUniqueMock } = vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.AUTH_SECRET = 'test-only-auth-secret-do-not-use-in-production-0123456789';

  return {
    answerCustomerQuestionMock: vi.fn(
      async (..._args: unknown[]): Promise<{ answer: string; sources: unknown[] }> => ({
        answer: '',
        sources: [],
      }),
    ),
    verifyAccessTokenMock: vi.fn(async (..._args: unknown[]) => ({
      sub: 'user-1',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    })),
    findUniqueMock: vi.fn(async (..._args: unknown[]) => ({
      id: 'user-1',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    })),
  };
});

vi.mock('../src/ai/chat.service.js', () => ({
  answerCustomerQuestion: answerCustomerQuestionMock,
}));

// These modules are not exercised here, but mocking them avoids constructing
// real services while loading the shared application.
vi.mock('../src/knowledge/retrieval.js', () => ({
  retrieveKnowledge: vi.fn(),
}));

vi.mock('../src/knowledge/knowledge.repository.js', () => ({
  saveKnowledgeDocument: vi.fn(),
}));

const { chatLogCreateMock } = vi.hoisted(() => ({
  chatLogCreateMock: vi.fn(async (..._args: unknown[]) => ({})),
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
    },
    chatLog: {
      create: chatLogCreateMock,
    },
  },
}));

vi.mock('../src/lib/jwt.js', () => ({
  verifyAccessToken: verifyAccessTokenMock,
  signAccessToken: vi.fn(),
}));

import { createApp } from '../src/app.js';
import { AppError } from '../src/lib/errors.js';

const app = createApp();

const answer = 'Refunds are available within 30 days.';

const sources = [
  {
    chunkId: 'chunk-1',
    documentId: 'document-1',
    chunkIndex: 0,
    tokenCount: 7,
    distance: 0.25,
    similarity: 0.75,
    document: {
      id: 'document-1',
      title: 'Refund policy',
      source: 'refund-policy.md',
      sourceType: 'FILE',
      mimeType: 'text/markdown',
    },
  },
];

function ask(body: Record<string, unknown>, token: string | null = 'valid-token') {
  const req = request(app).post('/api/chat').send(body);

  if (token) {
    req.set('Authorization', `Bearer ${token}`);
  }

  return req;
}

beforeEach(() => {
  answerCustomerQuestionMock.mockReset();
  verifyAccessTokenMock.mockReset();
  findUniqueMock.mockReset();
  chatLogCreateMock.mockReset();
  chatLogCreateMock.mockResolvedValue({});

  answerCustomerQuestionMock.mockResolvedValue({ answer, sources });
  verifyAccessTokenMock.mockResolvedValue({
    sub: 'user-1',
    email: 'customer@example.com',
    role: 'CUSTOMER',
  });
  findUniqueMock.mockResolvedValue({
    id: 'user-1',
    email: 'customer@example.com',
    role: 'CUSTOMER',
  });
});

describe('POST /api/chat', () => {
  it.each(['CUSTOMER', 'SUPPORT_AGENT', 'ADMIN'])(
    'returns an answer and sources for an authenticated %s',
    async (role) => {
      findUniqueMock.mockResolvedValue({
        id: 'user-1',
        email: 'customer@example.com',
        role,
      });

      const res = await ask({ question: '  How do refunds work?  ' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, answer, sources });
      expect(answerCustomerQuestionMock).toHaveBeenCalledWith('How do refunds work?');
      expect(JSON.stringify(res.body)).not.toContain('embedding');
    },
  );

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/chat').send({ question: 'How do refunds work?' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      code: 'UNAUTHENTICATED',
    });
    expect(answerCustomerQuestionMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token', async () => {
    verifyAccessTokenMock.mockRejectedValue(new Error('bad token'));

    const res = await ask({ question: 'How do refunds work?' }, 'not-a-valid-token');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
    expect(answerCustomerQuestionMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing question', {}],
    ['a non-string question', { question: 42 }],
    ['an empty question', { question: '' }],
    ['a whitespace-only question', { question: '   ' }],
  ])('rejects %s', async (_label, body) => {
    const res = await ask(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(answerCustomerQuestionMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      new AppError(500, 'CHAT_RETRIEVAL_FAILED', 'Could not retrieve knowledge for the question.'),
      500,
    ],
    [new AppError(502, 'CHAT_GENERATION_FAILED', 'Could not generate a chat response.'), 502],
  ])('uses the standard error envelope for service failures', async (error, status) => {
    answerCustomerQuestionMock.mockRejectedValue(error);

    const res = await ask({ question: 'How do refunds work?' });

    expect(res.status).toBe(status);
    expect(res.body).toEqual({
      success: false,
      code: error.code,
      message: error.message,
    });
    expect(res.body).not.toHaveProperty('stack');
  });
});

describe('chat logging', () => {
  it('records the question, outcome, cited documents and latency', async () => {
    await ask({ question: 'How do refunds work?' });

    expect(chatLogCreateMock).toHaveBeenCalledTimes(1);
    const data = (chatLogCreateMock.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({
      userId: 'user-1',
      question: 'How do refunds work?',
      answer,
      outcome: 'ANSWERED',
      sourceCount: 1,
      topSimilarity: 0.75,
      documentIds: ['document-1'],
    });
    expect(data.latencyMs).toEqual(expect.any(Number));
  });

  it('records a failed request as FAILED and still returns the error', async () => {
    answerCustomerQuestionMock.mockRejectedValue(
      new AppError(502, 'CHAT_GENERATION_FAILED', 'Could not generate a chat response.'),
    );

    const res = await ask({ question: 'How do refunds work?' });

    expect(res.status).toBe(502);
    const data = (chatLogCreateMock.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ outcome: 'FAILED', answer: null, sourceCount: 0 });
  });

  it('still answers the customer when logging fails', async () => {
    chatLogCreateMock.mockRejectedValue(new Error('database unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await ask({ question: 'How do refunds work?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe(answer);
    errorSpy.mockRestore();
  });

  it('does not log rejected (invalid or unauthenticated) requests', async () => {
    await ask({ question: '' });
    await request(app).post('/api/chat').send({ question: 'Hi' });

    expect(chatLogCreateMock).not.toHaveBeenCalled();
  });
});
