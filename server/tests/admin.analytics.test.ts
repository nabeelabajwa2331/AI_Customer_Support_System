import type { ChatOutcome, Role } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getChatAnalytics } from '../src/services/analytics.service.js';
import { classifyOutcome } from '../src/services/chat-log.service.js';
import {
  ACTION_UNAVAILABLE_PHRASE,
  NOT_SPECIFIED_FALLBACK_ANSWER,
} from '../src/ai/answer-phrases.js';
import { resetDatabase } from './helpers/db.js';

const app = createApp();
const PASSWORD = 'CorrectHorse123';

beforeEach(async () => {
  await resetDatabase();
  await prisma.knowledgeDocument.deleteMany();
});
afterAll(async () => {
  await prisma.knowledgeDocument.deleteMany();
  await prisma.$disconnect();
});

async function account(name: string, role: Role) {
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
  await request(app).post('/api/auth/register').send({ name, email, password: PASSWORD });
  const user = await prisma.user.update({ where: { email }, data: { role } });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { id: user.id, token: login.body.accessToken as string };
}

function log(
  outcome: ChatOutcome,
  createdAt: Date,
  extra: { userId?: string; documentIds?: string[]; latencyMs?: number; question?: string } = {},
) {
  return prisma.chatLog.create({
    data: {
      outcome,
      createdAt,
      question: extra.question ?? `Question ${outcome}`,
      latencyMs: extra.latencyMs ?? 1000,
      userId: extra.userId ?? null,
      documentIds: extra.documentIds ?? [],
    },
  });
}

describe('classifyOutcome', () => {
  it('derives the outcome from sources and the fixed phrases', () => {
    expect(classifyOutcome('anything', 0)).toBe('NO_EVIDENCE');
    expect(classifyOutcome(`${ACTION_UNAVAILABLE_PHRASE} Contact support.`, 2)).toBe('ACTION_UNAVAILABLE');
    expect(classifyOutcome(NOT_SPECIFIED_FALLBACK_ANSWER, 1)).toBe('NOT_SPECIFIED');
    expect(classifyOutcome('Refunds take 5 business days.', 1)).toBe('ANSWERED');
  });
});

describe('getChatAnalytics', () => {
  const now = new Date('2026-11-18T15:00:00Z');

  it('counts outcomes, answer rate, latency, active users and daily totals in the period', async () => {
    const customer = await account('Carl Customer', 'CUSTOMER');
    const doc = await prisma.knowledgeDocument.create({ data: { title: 'refunds.md', status: 'READY' } });

    await log('ANSWERED', new Date('2026-11-18T09:00:00Z'), { userId: customer.id, documentIds: [doc.id], latencyMs: 1000 });
    await log('ANSWERED', new Date('2026-11-17T09:00:00Z'), { userId: customer.id, documentIds: [doc.id], latencyMs: 3000 });
    await log('NO_EVIDENCE', new Date('2026-11-18T10:00:00Z'), { question: 'Do you ship to the UK?' });
    await log('FAILED', new Date('2026-11-18T11:00:00Z'), { latencyMs: 99_000 });
    // Outside a 7-day window.
    await log('ANSWERED', new Date('2026-11-01T09:00:00Z'));

    const result = await getChatAnalytics(7, { includeUsers: true }, now);

    expect(result.totals.questions).toBe(4);
    expect(result.totals.byOutcome).toEqual({
      ANSWERED: 2,
      NOT_SPECIFIED: 0,
      NO_EVIDENCE: 1,
      ACTION_UNAVAILABLE: 0,
      FAILED: 1,
    });
    expect(result.totals.answerRate).toBe(0.5);
    // Failed requests are excluded from the average response time.
    expect(result.totals.averageLatencyMs).toBe(Math.round((1000 + 3000 + 1000) / 3));
    expect(result.totals.activeUsers).toBe(1);

    expect(result.daily).toHaveLength(7);
    expect(result.daily[0]!.date).toBe('2026-11-12');
    expect(result.daily.at(-1)).toEqual({ date: '2026-11-18', questions: 3, unanswered: 1 });
    expect(result.daily.at(-2)).toEqual({ date: '2026-11-17', questions: 1, unanswered: 0 });

    expect(result.recentUnanswered.map((item) => item.question)).toEqual(['Do you ship to the UK?']);
    expect(result.topDocuments).toEqual([{ id: doc.id, title: 'refunds.md', citations: 2 }]);
    expect(result.users).toEqual({ total: 1, newInPeriod: 1 });
  });

  it('handles an empty period and omits user totals when not requested', async () => {
    const result = await getChatAnalytics(30, { includeUsers: false }, now);

    expect(result.totals.questions).toBe(0);
    expect(result.totals.answerRate).toBeNull();
    expect(result.totals.averageLatencyMs).toBeNull();
    expect(result.daily).toHaveLength(30);
    expect(result.daily.every((day) => day.questions === 0)).toBe(true);
    expect(result).not.toHaveProperty('users');
  });

  it('leaves out documents that were deleted after being cited', async () => {
    await log('ANSWERED', new Date('2026-11-18T09:00:00Z'), {
      documentIds: ['0f8fad5b-d9cb-469f-a165-70867728950e'],
    });

    const result = await getChatAnalytics(7, { includeUsers: false }, now);
    expect(result.topDocuments).toEqual([]);
  });
});

describe('GET /api/admin/analytics', () => {
  it('returns user totals to admins only', async () => {
    const admin = await account('Ada Admin', 'ADMIN');
    const agent = await account('Sam Agent', 'SUPPORT_AGENT');

    const asAdmin = await request(app).get('/api/admin/analytics?days=7').set('Authorization', `Bearer ${admin.token}`);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.analytics.users.total).toBe(2);

    const asAgent = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${agent.token}`);
    expect(asAgent.status).toBe(200);
    expect(asAgent.body.analytics.days).toBe(30);
    expect(asAgent.body.analytics).not.toHaveProperty('users');
  });

  it('is forbidden for customers and validates the period', async () => {
    const customer = await account('Carl Customer', 'CUSTOMER');
    const admin = await account('Ada Admin', 'ADMIN');

    expect(
      (await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${customer.token}`)).status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/admin/analytics?days=365').set('Authorization', `Bearer ${admin.token}`)).status,
    ).toBe(400);
  });
});
