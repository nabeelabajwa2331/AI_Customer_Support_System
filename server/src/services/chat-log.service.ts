import type { ChatOutcome } from '@prisma/client';

import { ACTION_UNAVAILABLE_PHRASE, NOT_SPECIFIED_PHRASE } from '../ai/answer-phrases.js';
import { prisma } from '../lib/prisma.js';

interface LoggedSource {
  documentId: string;
  similarity: number;
}

/**
 * Classifies an answer from the facts the chat pipeline already guarantees:
 * no sources means the relevance gate rejected everything, and the fixed
 * phrases mark action requests and unanswered questions.
 */
export function classifyOutcome(answer: string, sourceCount: number): ChatOutcome {
  if (sourceCount === 0) return 'NO_EVIDENCE';
  if (answer.startsWith(ACTION_UNAVAILABLE_PHRASE)) return 'ACTION_UNAVAILABLE';
  if (answer.includes(NOT_SPECIFIED_PHRASE)) return 'NOT_SPECIFIED';
  return 'ANSWERED';
}

export interface ChatLogInput {
  userId: string;
  question: string;
  latencyMs: number;
  /** Omitted when the request failed. */
  result?: { answer: string; sources: LoggedSource[] };
}

/**
 * Records one question for staff analytics. Best effort: a logging failure is
 * reported in the server log but never changes the customer's response.
 */
export async function recordChat(input: ChatLogInput): Promise<void> {
  const sources = input.result?.sources ?? [];

  try {
    await prisma.chatLog.create({
      data: {
        userId: input.userId,
        question: input.question,
        answer: input.result?.answer ?? null,
        outcome: input.result ? classifyOutcome(input.result.answer, sources.length) : 'FAILED',
        sourceCount: sources.length,
        topSimilarity: sources.length > 0 ? Math.max(...sources.map((s) => s.similarity)) : null,
        documentIds: [...new Set(sources.map((s) => s.documentId))],
        latencyMs: Math.max(0, Math.round(input.latencyMs)),
      },
    });
  } catch (error) {
    console.error(
      `[chat-log] Could not record a question: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}
