import { Bot, Check, Copy, FileText, Plus, SendHorizontal, Sparkles } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';

import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { ApiError, api } from '../lib/api';
import { formatPercent } from '../lib/format';
import type { ChatSource } from '../types/api';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  at: string;
  sources?: ChatSource[];
}

// A cold model can take ~45s on CPU; the backend allows 120s.
const SLOW_NOTICE_MS = 8_000;
const MAX_QUESTION_LENGTH = 2_000;
export const CHAT_STORAGE_PREFIX = 'support.chat.';

const SUGGESTIONS = [
  'What is your refund policy?',
  'How long does an approved refund take?',
  'What do I need to request a refund?',
  'Can I get a refund 10 days after purchase?',
];

function loadMessages(key: string): Message[] {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

function saveMessages(key: string, messages: Message[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(messages.slice(-60)));
  } catch {
    // Storage full or unavailable: history just won't survive navigation.
  }
}

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

/** Renders **bold** inline. Everything else stays plain text (no HTML injection). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** Paragraphs and "-" / "1." lists, which small models commonly produce. */
function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^\s*([-*•]|\d+[.)])\s+/.test(line))) {
          const ordered = /^\s*\d/.test(lines[0]!);
          const items = lines.map((line, j) => <li key={j}>{inline(line.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>);
          return ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
        }
        return <p key={i}>{inline(block)}</p>;
      })}
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; nothing to do.
    }
  }
  return (
    <button type="button" className="message-action" onClick={() => void copy()} aria-label="Copy answer">
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function AssistantPage() {
  const { user, hasRole } = useAuth();
  const storageKey = `${CHAT_STORAGE_PREFIX}${user?.id ?? 'anonymous'}`;
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(storageKey));
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const isStaff = hasRole('ADMIN', 'SUPPORT_AGENT');

  useEffect(() => saveMessages(storageKey, messages), [storageKey, messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  useEffect(() => () => controller.current?.abort(), []);

  function push(message: Omit<Message, 'id' | 'at'>) {
    setMessages((current) => [
      ...current,
      { ...message, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString() },
    ]);
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
      inputRef.current?.focus();
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

  const empty = messages.length === 0 && !pending;

  return (
    <div className="assistant">
      <div className="assistant-toolbar">
        <div className="assistant-title">
          <span className="assistant-badge" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <div>
            <h1>AI Assistant</h1>
            <p>Answers come only from the knowledge base, with sources.</p>
          </div>
        </div>
        {messages.length > 0 ? (
          <button type="button" className="button button-secondary" onClick={() => setMessages([])} disabled={pending}>
            <Plus size={16} aria-hidden="true" /> New chat
          </button>
        ) : null}
      </div>

      <div className="chat-panel">
        <div className="message-list" ref={listRef} aria-live="polite">
          {empty ? (
            <div className="chat-welcome">
              <span className="chat-welcome-icon" aria-hidden="true">
                <Bot size={26} />
              </span>
              <h2>How can we help{user ? `, ${user.name.split(' ')[0]}` : ''}?</h2>
              <p>
                {isStaff
                  ? 'Test how the assistant answers customers from the documents in the knowledge base.'
                  : 'Ask about refunds, orders or our policies. Every answer is based on our published documents.'}
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" className="suggestion" onClick={() => void ask(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
              <p className="chat-welcome-note">The assistant can't look up orders or process refunds.</p>
            </div>
          ) : null}

          {messages.map((message) => (
            <div key={message.id} className={`message message-${message.role}`}>
              {message.role === 'user' ? (
                user ? <Avatar name={user.name} size="sm" /> : null
              ) : (
                <span className="message-avatar" aria-hidden="true">
                  <Bot size={16} />
                </span>
              )}
              <div className="message-content">
                <div className="message-body">
                  <RichText text={message.text} />
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
                <div className="message-meta">
                  <time dateTime={message.at}>{timeFormat.format(new Date(message.at))}</time>
                  {message.role === 'assistant' ? <CopyButton text={message.text} /> : null}
                </div>
              </div>
            </div>
          ))}

          {pending ? (
            <div className="message message-assistant">
              <span className="message-avatar" aria-hidden="true">
                <Bot size={16} />
              </span>
              <div className="message-content">
                <div className="message-body">
                  <span className="typing" aria-label="Assistant is thinking">
                    <span />
                    <span />
                    <span />
                  </span>
                  {slow ? (
                    <p className="muted small">
                      Still working. The first answer after a quiet period can take up to a minute while the server starts.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <div className="composer-box">
            <label htmlFor="question" className="sr-only">
              Your question
            </label>
            <textarea
              ref={inputRef}
              id="question"
              rows={1}
              placeholder="Ask a question about orders, refunds or policies..."
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
          </div>
          <p className="composer-hint">
            <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
          </p>
        </form>
      </div>
    </div>
  );
}
