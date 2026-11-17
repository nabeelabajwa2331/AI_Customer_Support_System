import { Activity, ArrowRight, BookOpen, Bot, Database, FileText, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { Alert, EmptyState, StatusBadge } from '../components/Feedback';
import { Spinner } from '../components/Spinner';
import { ApiError, api } from '../lib/api';
import { formatCount, formatDate } from '../lib/format';
import type { KnowledgeDocument } from '../types/api';

function Kpi({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint ? <span className="kpi-hint">{hint}</span> : null}
    </div>
  );
}

type ApiState = 'checking' | 'online' | 'offline';

export function OverviewPage() {
  const { user } = useAuth();
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

  const ready = documents?.filter((doc) => doc.status === 'READY') ?? [];
  const chunks = ready.reduce((sum, doc) => sum + doc.chunkCount, 0);
  const characters = ready.reduce((sum, doc) => sum + (doc.characterCount ?? 0), 0);
  const latest = documents?.[0];
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <div className="stack">
      <div className="page-intro">
        <h2>Welcome back{firstName ? `, ${firstName}` : ''}</h2>
        <p className="muted">Knowledge base and assistant status.</p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <section className="kpi-grid" aria-label="Key figures">
        <Kpi
          icon={BookOpen}
          label="Documents ready"
          value={documents ? formatCount(ready.length) : '—'}
          hint={documents && documents.length !== ready.length ? `${documents.length - ready.length} not ready` : undefined}
        />
        <Kpi icon={Layers} label="Indexed chunks" value={documents ? formatCount(chunks) : '—'} hint="Searchable passages" />
        <Kpi icon={Database} label="Indexed text" value={documents ? `${formatCount(characters)}` : '—'} hint="Characters" />
        <Kpi
          icon={Activity}
          label="API status"
          value={apiState === 'checking' ? 'Checking' : apiState === 'online' ? 'Online' : 'Offline'}
          hint={latest ? `Last upload ${formatDate(latest.createdAt)}` : undefined}
        />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <h2>Recent documents</h2>
            <Link to="/knowledge" className="link">
              View all <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {documents === null && !error ? <Spinner label="Loading" /> : null}
          {documents && documents.length === 0 ? (
            <EmptyState icon={FileText} title="No documents yet">
              Upload policies in the Knowledge Base so the assistant can answer customers.
            </EmptyState>
          ) : null}
          {documents && documents.length > 0 ? (
            <ul className="list">
              {documents.slice(0, 5).map((doc) => (
                <li key={doc.id} className="list-row">
                  <span className="list-main">
                    <span className="doc-title">{doc.title}</span>
                    <span className="doc-meta">
                      {formatCount(doc.chunkCount)} chunk{doc.chunkCount === 1 ? '' : 's'} · {formatDate(doc.createdAt)}
                    </span>
                  </span>
                  <StatusBadge status={doc.status} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="card">
          <div className="card-header">
            <h2>AI Assistant</h2>
          </div>
          <p className="muted">
            The assistant answers only from ready documents and cites its sources. It says so when the knowledge base
            does not cover a question, and never claims to process refunds or look up orders.
          </p>
          <Link to="/assistant" className="button button-secondary">
            <Bot size={16} aria-hidden="true" /> Try the assistant
          </Link>
          <p className="muted small note">
            Ticket, customer and analytics figures will appear here once those features are added to the backend.
          </p>
        </section>
      </div>
    </div>
  );
}
