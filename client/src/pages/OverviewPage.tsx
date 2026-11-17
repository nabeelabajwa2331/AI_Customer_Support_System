import {
  Activity,
  ArrowRight,
  BookOpen,
  Bot,
  FileSearch,
  FileText,
  Layers,
  MessageSquareText,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { Alert, EmptyState, StatusBadge } from '../components/Feedback';
import { ApiError, api } from '../lib/api';
import { fileTypeLabel, formatCount, formatDate } from '../lib/format';
import type { KnowledgeDocument } from '../types/api';

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

const PIPELINE: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: FileSearch, title: 'Retrieve', text: 'Finds the most relevant passages in ready documents.' },
  { icon: ShieldCheck, title: 'Ground', text: 'Answers only from those passages; says when they don’t cover it.' },
  { icon: MessageSquareText, title: 'Cite', text: 'Shows which documents each answer came from.' },
];

type ApiState = 'checking' | 'online' | 'offline';

export function OverviewPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiState, setApiState] = useState<ApiState>('checking');

  useEffect(() => {
    api
      .listDocuments()
      .then(setDocuments)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load data.'));
    api
      .health()
      .then((health) => setApiState(health.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setApiState('offline'));
  }, []);

  const loaded = documents !== null;
  const ready = documents?.filter((doc) => doc.status === 'READY') ?? [];
  const notReady = (documents?.length ?? 0) - ready.length;
  const chunks = ready.reduce((sum, doc) => sum + doc.chunkCount, 0);
  const characters = ready.reduce((sum, doc) => sum + (doc.characterCount ?? 0), 0);
  const latest = documents?.[0];
  const byType = ready.reduce<Record<string, number>>((acc, doc) => {
    const type = fileTypeLabel(doc.mimeType, doc.source);
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <span className="hero-eyebrow">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span>
          <h1>
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p>
            {!loaded
              ? 'Loading your workspace…'
              : ready.length === 0
                ? 'Your knowledge base is empty. Add policies and FAQs so the assistant can start answering.'
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
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-bubble b1">How long do refunds take?</div>
          <div className="hero-bubble b2">
            <Bot size={14} /> Approved refunds are processed within 5 business days.
          </div>
          <div className="hero-chip">
            <FileText size={12} /> refund-policy
          </div>
        </div>
      </section>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <section className="kpi-grid" aria-label="Key figures">
        <Kpi
          icon={BookOpen}
          label="Documents ready"
          value={loaded ? formatCount(ready.length) : '—'}
          hint={notReady > 0 ? `${notReady} still processing` : 'All documents indexed'}
        />
        <Kpi icon={Layers} label="Indexed passages" value={loaded ? formatCount(chunks) : '—'} hint="Searchable by the assistant" />
        <Kpi icon={FileText} label="Indexed text" value={loaded ? formatCount(characters) : '—'} hint="Characters across ready documents" />
        <Kpi
          icon={Activity}
          label="Service status"
          value={apiState === 'checking' ? 'Checking' : apiState === 'online' ? 'Operational' : 'Offline'}
          hint={latest ? `Last upload ${formatDate(latest.createdAt)}` : 'No uploads yet'}
          tone={apiState === 'offline' ? 'danger' : 'success'}
        />
      </section>

      <div className="grid-2">
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

          {!loaded && !error ? <div className="skeleton-list" aria-hidden="true"><span /><span /><span /></div> : null}
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

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>How answers are made</h2>
                <p className="muted">Retrieval-augmented generation on local models.</p>
              </div>
            </div>
            <ol className="pipeline">
              {PIPELINE.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <span className="pipeline-icon" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <span className="muted small">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {Object.keys(byType).length > 0 ? (
            <section className="card">
              <div className="card-header">
                <h2>Content by type</h2>
              </div>
              <div className="type-bars">
                {Object.entries(byType).map(([type, count]) => (
                  <div key={type} className="type-bar">
                    <span className="type-bar-label">{type}</span>
                    <span className="type-bar-track">
                      <span style={{ width: `${(count / ready.length) * 100}%` }} />
                    </span>
                    <span className="type-bar-value">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
