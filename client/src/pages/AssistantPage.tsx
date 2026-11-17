import { Bot, FileText, SendHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/Feedback';
import { ApiError, api } from '../lib/api';
import { formatPercent } from '../lib/format';
import type { ChatSource } from '../types/api';

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
  sources?: ChatSource[];
}

// The backend has a 120s chat timeout; a cold model can take ~45s on CPU.
const SLOW_NOTICE_MS = 8_000;
const MAX_QUESTION_LENGTH = 2_000;

/** One entry per document, keeping its best match. */
function uniqueDocuments(sources: ChatSource[]): ChatSource[] {
  const best = new Map<string, ChatSource>();
  for (const source of sources) {
    const existing = best.get(source.documentId);
    if (!existing || source.similarity > existing.similarity) best.set(source.documentId, source);
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity);
}

function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.code === 'RATE_LIMITED') return 'You are sending questions quickly. Please wait a minute and try again.';
  if (error.status === 502) return 'The AI model is unavailable right now. Please try again shortly.';
  return error.message;
}

export function AssistantPage() {
  const { hasRole } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  useEffect(() => () => controller.current?.abort(), []);

  function push(message: Omit<Message, 'id'>) {
    setMessages((current) => [...current, { ...message, id: nextId.current++ }]);
  }

  async function ask(question: string) {
    push({ role: 'user', text: question });
    setDraft('');
    setPending(true);
    setSlow(false);

    controller.current = new AbortController();
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_NOTICE_MS);

    try {
      const result = await api.askQuestion(question, controller.current.signal);
      push({ role: 'assistant', text: result.answer, sources: result.sources });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      push({ role: 'error', text: errorText(error) });
    } finally {
      window.clearTimeout(slowTimer);
      setPending(false);
      setSlow(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (question && !pending) void ask(question);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  const isStaff = hasRole('ADMIN', 'SUPPORT_AGENT');

  return (
    <div className="assistant">
      <div className="card assistant-card">
        <div className="assistant-header">
          <div>
            <h2>AI Assistant</h2>
            <p className="muted">
              Answers come only from the knowledge base. The assistant cannot look up orders or process refunds.
            </p>
          </div>
          {messages.length > 0 ? (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setMessages([])}
              disabled={pending}
            >
              <Trash2 size={16} aria-hidden="true" /> Clear
            </button>
          ) : null}
        </div>

        <div className="message-list" ref={listRef} aria-live="polite">
          {messages.length === 0 && !pending ? (
            <EmptyState icon={Bot} title="Ask a question">
              {isStaff
                ? 'Test how the assistant answers customers using the documents in the knowledge base.'
                : 'Ask about refunds, orders or policies. Answers are based on our published policies.'}
            </EmptyState>
          ) : null}

          {messages.map((message) => (
            <div key={message.id} className={`message message-${message.role}`}>
              {message.role !== 'user' ? (
                <span className="message-avatar" aria-hidden="true">
                  <Bot size={16} />
                </span>
              ) : null}
              <div className="message-body">
                <p>{message.text}</p>
                {message.sources && message.sources.length > 0 ? (
                  <div className="sources">
                    <span className="sources-label">Sources</span>
                    {uniqueDocuments(message.sources).map((source) => (
                      <span key={source.documentId} className="source-chip" title={source.document.source ?? undefined}>
                        <FileText size={13} aria-hidden="true" />
                        {source.document.title}
                        {isStaff ? <span className="source-score">{formatPercent(source.similarity)}</span> : null}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {pending ? (
            <div className="message message-assistant">
              <span className="message-avatar" aria-hidden="true">
                <Bot size={16} />
              </span>
              <div className="message-body">
                <span className="typing" aria-label="Assistant is thinking">
                  <span />
                  <span />
                  <span />
                </span>
                {slow ? (
                  <p className="muted small">
                    Still working. The first answer after a quiet period can take up to a minute while the model loads.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <label htmlFor="question" className="sr-only">
            Your question
          </label>
          <textarea
            id="question"
            rows={1}
            placeholder="Type your question..."
            value={draft}
            maxLength={MAX_QUESTION_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={pending}
          />
          <button
            type="submit"
            className="button button-primary composer-send"
            disabled={pending || !draft.trim()}
            aria-label="Send question"
          >
            <SendHorizontal size={18} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
