import type { ChatOutcome } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const OUTCOMES: ChatOutcome[] = [
  'ANSWERED',
  'NOT_SPECIFIED',
  'NO_EVIDENCE',
  'ACTION_UNAVAILABLE',
  'FAILED',
];

/** Questions the knowledge base could not answer: the main signal for new content. */
const UNANSWERED: ChatOutcome[] = ['NOT_SPECIFIED', 'NO_EVIDENCE'];

export interface ChatAnalytics {
  days: number;
  since: Date;
  totals: {
    questions: number;
    byOutcome: Record<ChatOutcome, number>;
    /** Share of questions answered, 0-1; null when there were no questions. */
    answerRate: number | null;
    averageLatencyMs: number | null;
    activeUsers: number;
  };
  /** One entry per UTC day, oldest first, including days without questions. */
  daily: Array<{ date: string; questions: number; unanswered: number }>;
  recentUnanswered: Array<{
    id: string;
    question: string;
    outcome: ChatOutcome;
    createdAt: Date;
    user: { id: string; name: string } | null;
  }>;
  topDocuments: Array<{ id: string; title: string; citations: number }>;
  /** Only for administrators. */
  users?: { total: number; newInPeriod: number };
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function getChatAnalytics(
  days: number,
  options: { includeUsers: boolean },
  now = new Date(),
): Promise<ChatAnalytics> {
  // Whole UTC days, ending today.
  const since = new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
  const where = { createdAt: { gte: since } };

  const [grouped, latency, activeUsers, dailyRows, recentUnanswered, citationRows, users] =
    await Promise.all([
      prisma.chatLog.groupBy({ by: ['outcome'], where, _count: { _all: true } }),
      prisma.chatLog.aggregate({
        where: { ...where, outcome: { not: 'FAILED' } },
        _avg: { latencyMs: true },
      }),
      prisma.chatLog.findMany({
        where: { ...where, userId: { not: null } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      prisma.$queryRaw<Array<{ day: Date; questions: bigint; unanswered: bigint }>>`
        SELECT date_trunc('day', created_at) AS day,
               count(*) AS questions,
               count(*) FILTER (WHERE outcome IN ('NOT_SPECIFIED', 'NO_EVIDENCE')) AS unanswered
        FROM chat_logs
        WHERE created_at >= ${since}
        GROUP BY 1`,
      prisma.chatLog.findMany({
        where: { ...where, outcome: { in: UNANSWERED } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          question: true,
          outcome: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.$queryRaw<Array<{ id: string; citations: bigint }>>`
        SELECT doc_id::text AS id, count(*) AS citations
        FROM chat_logs, unnest(document_ids) AS doc_id
        WHERE created_at >= ${since}
        GROUP BY doc_id
        ORDER BY citations DESC
        LIMIT 5`,
      options.includeUsers
        ? Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { createdAt: { gte: since } } }),
          ])
        : Promise.resolve(null),
    ]);

  const byOutcome = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<ChatOutcome, number>;
  for (const group of grouped) byOutcome[group.outcome] = group._count._all;
  const questions = OUTCOMES.reduce((sum, o) => sum + byOutcome[o], 0);

  const perDay = new Map(
    dailyRows.map((row) => [
      startOfUtcDay(new Date(row.day)).toISOString().slice(0, 10),
      { questions: Number(row.questions), unanswered: Number(row.unanswered) },
    ]),
  );
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(since.getTime() + index * DAY_MS).toISOString().slice(0, 10);
    return { date, ...(perDay.get(date) ?? { questions: 0, unanswered: 0 }) };
  });

  // Deleted documents drop out: their citations remain in the log, but there
  // is no title to show.
  const documents = await prisma.knowledgeDocument.findMany({
    where: { id: { in: citationRows.map((row) => row.id) } },
    select: { id: true, title: true },
  });
  const titles = new Map(documents.map((doc) => [doc.id, doc.title]));
  const topDocuments = citationRows
    .filter((row) => titles.has(row.id))
    .map((row) => ({ id: row.id, title: titles.get(row.id)!, citations: Number(row.citations) }));

  return {
    days,
    since,
    totals: {
      questions,
      byOutcome,
      answerRate: questions > 0 ? byOutcome.ANSWERED / questions : null,
      averageLatencyMs:
        latency._avg.latencyMs === null ? null : Math.round(latency._avg.latencyMs),
      activeUsers: activeUsers.length,
    },
    daily,
    recentUnanswered,
    topDocuments,
    ...(users ? { users: { total: users[0], newInPeriod: users[1] } } : {}),
  };
}
