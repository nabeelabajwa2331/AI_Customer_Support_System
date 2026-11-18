import {
  Activity,
  ArrowRight,
  BookOpen,
  Bot,
  CircleHelp,
  FileText,
  MessageSquareText,
  Timer,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { Alert, EmptyState, StatusBadge } from '../components/Feedback';
import { ApiError, api } from '../lib/api';
import { fileTypeLabel, formatCount, formatDate, formatDateTime } from '../lib/format';
import type { ChatAnalytics, ChatOutcome, KnowledgeDocument } from '../types/api';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface KpiProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}

function Kpi({ icon: Icon, label, value, hint, tone = 'accent' }: KpiProps) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className={`kpi-icon tone-${tone}`} aria-hidden="true">
          <Icon size={17} />
        </span>
      </div>
      <span className="kpi-value">{value}</span>
      <span className="kpi-hint">{hint}</span>
    </div>
  );
}

const OUTCOME_LABEL: Record<ChatOutcome, string> = {
  ANSWERED: 'Answered',
  NOT_SPECIFIED: 'Not covered by documents',
  NO_EVIDENCE: 'No relevant documents',
  ACTION_UNAVAILABLE: 'Action requests',
  FAILED: 'Errors',
};

const OUTCOME_ORDER: ChatOutcome[] = ['ANSWERED', 'NOT_SPECIFIED', 'NO_EVIDENCE', 'ACTION_UNAVAILABLE', 'FAILED'];

const PERIODS = [7, 30, 90] as const;

const dayLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Questions per day: one series, so the card title names it and no legend is needed. */
function DailyChart({ daily }: { daily: ChatAnalytics['daily'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.questions));
  const active = hover === null ? null : daily[hover];
  const labelEvery = daily.length > 31 ? 14 : daily.length > 7 ? 7 : 1;

  return (
    <div className="daily-chart">
      <div className="daily-tooltip" aria-hidden="true" data-visible={active ? 'true' : 'false'}>
        {active ? (
          <>
            <strong>{dayLabel.format(new Date(active.date))}</strong>
            <span>
              {formatCount(active.questions)} question{active.questions === 1 ? '' : 's'}
              {active.unanswered > 0 ? ` · ${formatCount(active.unanswered)} unanswered` : ''}
            </span>
          </>
        ) : null}
      </div>
      <div className="daily-plot" onMouseLeave={() => setHover(null)}>
        <span className="daily-max muted small" aria-hidden="true">
          {formatCount(max)}
        </span>
        {daily.map((day, index) => (
          <button
            key={day.date}
            type="button"
            className={`daily-col ${hover === index ? 'is-hover' : ''}`}
            onMouseEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
            aria-label={`${dayLabel.format(new Date(day.date))}: ${day.questions} questions, ${day.unanswered} unanswered`}
          >
            <span
              className="daily-bar"
              style={{ height: day.questions === 0 ? '0' : `max(3px, ${(day.questions / max) * 100}%)` }}
            />
          </button>
        ))}
      </div>
      <div className="daily-axis" aria-hidden="true">
        {daily.map((day, index) => (
          <span key={day.date}>
            {index % labelEvery === 0 || index === daily.length - 1 ? dayLabel.format(new Date(day.date)) : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Questions per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Questions</th>
            <th>Unanswered</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{day.questions}</td>
              <td>{day.unanswered}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ApiState = 'checking' | 'online' | 'offline';

export function OverviewPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [analytics, setAnalytics] = useState<ChatAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiState, setApiState] = useState<ApiState>('checking');

  useEffect(() => {
    api
      .listDocuments()
      .then(setDocuments)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load documents.'));
    api
      .health()
      .then((health) => setApiState(health.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setApiState('offline'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAnalyticsError(null);
    api
      .analytics(days)
      .then((result) => {
        if (!cancelled) setAnalytics(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setAnalyticsError(err instanceof ApiError ? err.message : 'Could not load analytics.');
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const loaded = documents !== null;
  const ready = documents?.filter((doc) => doc.status === 'READY') ?? [];
  const chunks = ready.reduce((sum, doc) => sum + doc.chunkCount, 0);
  const firstName = user?.name.split(' ')[0] ?? '';

  const totals = analytics?.totals;
  const unanswered = totals ? totals.byOutcome.NOT_SPECIFIED + totals.byOutcome.NO_EVIDENCE : 0;
  const maxOutcome = totals ? Math.max(1, ...OUTCOME_ORDER.map((o) => totals.byOutcome[o])) : 1;
  const maxCitations = Math.max(1, ...(analytics?.topDocuments.map((d) => d.citations) ?? [1]));

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <span className="hero-eyebrow">
            {isAdmin ? 'Administrator' : 'Support agent'} ·{' '}
            {new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
          </span>
          <h1>
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p>
            {!loaded
              ? 'Loading your workspace…'
              : ready.length === 0
                ? 'Your knowledge base is empty. Add policies and FAQs so the assistant can start answering.'
                : unanswered > 0
                  ? `${formatCount(unanswered)} question${unanswered === 1 ? '' : 's'} in the last ${days} days could not be answered. Review them below to see what content is missing.`
                  : `The assistant is answering from ${ready.length} document${ready.length === 1 ? '' : 's'} and ${formatCount(chunks)} indexed passage${chunks === 1 ? '' : 's'}.`}
          </p>
          <div className="hero-actions">
            <Link to="/assistant" className="button button-light">
              <Bot size={16} aria-hidden="true" /> Open assistant
            </Link>
            {isAdmin ? (
              <Link to="/knowledge" className="button button-outline-light">
                <Upload size={16} aria-hidden="true" /> Upload document
              </Link>
            ) : null}
            {isAdmin ? (
              <Link to="/users" className="button button-outline-light">
                <Users size={16} aria-hidden="true" /> Manage users
              </Link>
            ) : null}
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-bubble b1">How long do refunds take?</div>
          <div className="hero-bubble b2">
            <Bot size={14} /> Refunds are processed within 5 business days.
          </div>
          <div className="hero-chip">
            <FileText size={12} /> refund-policy
          </div>
        </div>
      </section>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {analyticsError ? <Alert tone="error">{analyticsError}</Alert> : null}

      <div className="section-bar">
        <h2>Assistant activity</h2>
        <div className="segmented" role="tablist" aria-label="Time range">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              role="tab"
              aria-selected={days === period}
              className={days === period ? 'is-active' : ''}
              onClick={() => setDays(period)}
            >
              {period} days
            </button>
          ))}
        </div>
      </div>

      <section className="kpi-grid" aria-label="Key figures">
        <Kpi
          icon={MessageSquareText}
          label="Questions"
          value={totals ? formatCount(totals.questions) : '—'}
          hint={totals ? `From ${formatCount(totals.activeUsers)} user${totals.activeUsers === 1 ? '' : 's'}` : `Last ${days} days`}
        />
        <Kpi
          icon={Activity}
          label="Answer rate"
          value={totals?.answerRate == null ? '—' : `${Math.round(totals.answerRate * 100)}%`}
          hint="Answered from the knowledge base"
          tone="success"
        />
        <Kpi
          icon={CircleHelp}
          label="Unanswered"
          value={totals ? formatCount(unanswered) : '—'}
          hint="Missing or unclear content"
          tone={unanswered > 0 ? 'warning' : 'success'}
        />
        <Kpi
          icon={Timer}
          label="Avg. response time"
          value={formatLatency(totals?.averageLatencyMs ?? null)}
          hint={apiState === 'offline' ? 'Service offline' : apiState === 'online' ? 'Service operational' : 'Checking service'}
          tone={apiState === 'offline' ? 'danger' : 'accent'}
        />
      </section>

      {isAdmin && analytics?.users ? (
        <section className="kpi-grid kpi-grid-3" aria-label="Accounts and content">
          <Kpi icon={Users} label="Total users" value={formatCount(analytics.users.total)} hint="All roles" />
          <Kpi
            icon={UserPlus}
            label="New users"
            value={formatCount(analytics.users.newInPeriod)}
            hint={`Joined in the last ${days} days`}
          />
          <Kpi
            icon={BookOpen}
            label="Documents ready"
            value={loaded ? formatCount(ready.length) : '—'}
            hint={`${formatCount(chunks)} indexed passages`}
          />
        </section>
      ) : null}

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Questions per day</h2>
            <p className="muted">Hover a bar for the day’s details.</p>
          </div>
        </div>
        {analytics ? (
          totals && totals.questions > 0 ? (
            <DailyChart daily={analytics.daily} />
          ) : (
            <EmptyState icon={MessageSquareText} title="No questions yet">
              Activity appears here once people start using the assistant.
            </EmptyState>
          )
        ) : (
          <div className="skeleton-list" aria-hidden="true">
            <span />
            <span />
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Unanswered questions</h2>
              <p className="muted">What customers asked that the documents don’t cover.</p>
            </div>
            {isAdmin ? (
              <Link to="/knowledge" className="link">
                Add content <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          {analytics && analytics.recentUnanswered.length === 0 ? (
            <p className="muted">Nothing here. Every recent question found relevant content.</p>
          ) : null}
          {analytics && analytics.recentUnanswered.length > 0 ? (
            <ul className="list">
              {analytics.recentUnanswered.map((item) => (
                <li key={item.id} className="list-row">
                  <span className="question-icon" aria-hidden="true">
                    <CircleHelp size={15} />
                  </span>
                  <span className="list-main">
                    <span className="doc-title wrap">{item.question}</span>
                    <span className="doc-meta">
                      {OUTCOME_LABEL[item.outcome]} · {formatDateTime(item.createdAt)}
                      {item.user ? ` · ${item.user.name}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>How questions were handled</h2>
                <p className="muted">Last {days} days.</p>
              </div>
            </div>
            {totals ? (
              <div className="type-bars">
                {OUTCOME_ORDER.map((outcome) => (
                  <div key={outcome} className="type-bar type-bar-wide">
                    <span className="type-bar-label">{OUTCOME_LABEL[outcome]}</span>
                    <span className="type-bar-track">
                      <span style={{ width: `${(totals.byOutcome[outcome] / maxOutcome) * 100}%` }} />
                    </span>
                    <span className="type-bar-value">{formatCount(totals.byOutcome[outcome])}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Most used documents</h2>
                <p className="muted">How often each document was cited in answers.</p>
              </div>
            </div>
            {analytics && analytics.topDocuments.length === 0 ? (
              <p className="muted">No documents have been cited yet.</p>
            ) : null}
            {analytics && analytics.topDocuments.length > 0 ? (
              <div className="type-bars">
                {analytics.topDocuments.map((doc) => (
                  <div key={doc.id} className="type-bar type-bar-wide">
                    <span className="type-bar-label" title={doc.title}>
                      {doc.title}
                    </span>
                    <span className="type-bar-track">
                      <span style={{ width: `${(doc.citations / maxCitations) * 100}%` }} />
                    </span>
                    <span className="type-bar-value">{formatCount(doc.citations)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Recent documents</h2>
            <p className="muted">The newest material the assistant can use.</p>
          </div>
          <Link to="/knowledge" className="link">
            View all <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        {!loaded && !error ? (
          <div className="skeleton-list" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {documents && documents.length === 0 ? (
          <EmptyState icon={FileText} title="No documents yet">
            {isAdmin ? 'Upload your first policy to get started.' : 'An administrator needs to upload documents.'}
          </EmptyState>
        ) : null}
        {documents && documents.length > 0 ? (
          <ul className="list">
            {documents.slice(0, 5).map((doc) => (
              <li key={doc.id} className="list-row">
                <span className="doc-type" aria-hidden="true">
                  {fileTypeLabel(doc.mimeType, doc.source)}
                </span>
                <span className="list-main">
                  <span className="doc-title">{doc.title}</span>
                  <span className="doc-meta">
                    {formatCount(doc.chunkCount)} passage{doc.chunkCount === 1 ? '' : 's'} · {formatDate(doc.createdAt)}
                    {doc.createdBy ? ` · ${doc.createdBy.name}` : ''}
                  </span>
                </span>
                <StatusBadge status={doc.status} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
