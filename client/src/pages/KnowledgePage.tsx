import { BookOpen, CloudUpload, FileText, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from 'react';

import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Alert, EmptyState, StatusBadge } from '../components/Feedback';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { ApiError, api } from '../lib/api';
import { fileTypeLabel, formatCount, formatDate, formatPercent } from '../lib/format';
import type { KnowledgeDocument, SearchResult } from '../types/api';

const ACCEPT = '.pdf,.docx,.txt,.md';
const ALLOWED = /\.(pdf|docx|txt|md)$/i;
const MAX_BYTES = 10 * 1024 * 1024;

function uploadErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Upload failed. Please try again.';
  switch (error.code) {
    case 'DUPLICATE_DOCUMENT':
      return 'This file has already been uploaded.';
    case 'RATE_LIMITED':
      return 'Upload limit reached. Please try again later.';
    case 'EMBEDDING_FAILED':
      return 'The embedding model is unavailable, so the document could not be indexed.';
    default:
      return error.message;
  }
}

/** Highlights query words in a passage without injecting HTML. */
function highlight(text: string, query: string): ReactNode {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>,
  );
}

function Dropzone({ uploading, onFile }: { uploading: string | null; onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFile(file);
  }

  return (
    <div
      className={`dropzone ${over ? 'is-over' : ''} ${uploading ? 'is-busy' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!uploading) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={uploading ? (e) => e.preventDefault() : handleDrop}
    >
      <input ref={input} type="file" accept={ACCEPT} hidden onChange={handleChange} data-testid="file-input" />
      <span className="dropzone-icon" aria-hidden="true">
        {uploading ? <Spinner /> : <CloudUpload size={22} />}
      </span>
      {uploading ? (
        <div>
          <strong>Indexing “{uploading}”</strong>
          <p className="muted small">Each section is embedded for search. Long files can take a few minutes.</p>
        </div>
      ) : (
        <div>
          <strong>Drop a file here, or </strong>
          <button type="button" className="link-button" onClick={() => input.current?.click()}>
            browse
          </button>
          <p className="muted small">PDF, DOCX, TXT or MD · up to 10 MB</p>
        </div>
      )}
    </div>
  );
}

export function KnowledgePage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const toast = useToast();

  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [query, setQuery] = useState('');
  const [searchedFor, setSearchedFor] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setDocuments(await api.listDocuments());
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load documents.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFile(file: File) {
    if (!ALLOWED.test(file.name)) {
      toast.error('Unsupported file type', 'Upload a PDF, DOCX, TXT or MD file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('File too large', 'Files must be 10 MB or smaller.');
      return;
    }

    setUploading(file.name);
    try {
      const uploaded = await api.uploadDocument(file);
      toast.success(
        'Document indexed',
        `“${uploaded.title}” is ready (${uploaded.chunkCount} passage${uploaded.chunkCount === 1 ? '' : 's'}).`,
      );
      await load();
    } catch (error) {
      toast.error('Upload failed', uploadErrorText(error));
    } finally {
      setUploading(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteDocument(toDelete.id);
      toast.success('Document deleted', `“${toDelete.title}” is no longer used by the assistant.`);
      setToDelete(null);
      await load();
    } catch (error) {
      toast.error('Delete failed', error instanceof ApiError ? error.message : undefined);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await api.searchKnowledge(q));
      setSearchedFor(q);
    } catch (error) {
      setSearchError(error instanceof ApiError ? error.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  const ready = documents?.filter((d) => d.status === 'READY').length ?? 0;
  const passages = documents?.reduce((sum, d) => sum + d.chunkCount, 0) ?? 0;

  return (
    <div className="page">
      <PageHeader
        title="Knowledge Base"
        description="The documents the assistant answers from. Keep them accurate and up to date."
        actions={
          <button type="button" className="button button-secondary" onClick={() => void load()}>
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
        }
      />

      <div className="stat-strip">
        <div>
          <span>Documents</span>
          <strong>{documents ? formatCount(documents.length) : '—'}</strong>
        </div>
        <div>
          <span>Ready</span>
          <strong>{documents ? formatCount(ready) : '—'}</strong>
        </div>
        <div>
          <span>Indexed passages</span>
          <strong>{documents ? formatCount(passages) : '—'}</strong>
        </div>
        <div>
          <span>Last update</span>
          <strong>{documents?.[0] ? formatDate(documents[0].createdAt) : '—'}</strong>
        </div>
      </div>

      {isAdmin ? <Dropzone uploading={uploading} onFile={(file) => void handleFile(file)} /> : null}

      <section className="card card-flush">
        <div className="card-header padded">
          <div>
            <h2>Documents</h2>
            <p className="muted">Newest first.</p>
          </div>
        </div>

        {loadError ? (
          <div className="padded">
            <Alert tone="error">{loadError}</Alert>
          </div>
        ) : null}

        {documents === null && !loadError ? (
          <div className="skeleton-list padded" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {documents && documents.length === 0 ? (
          <EmptyState icon={BookOpen} title="No documents yet">
            {isAdmin
              ? 'Drop your policies and FAQs above so the assistant can answer from them.'
              : 'An administrator needs to upload documents before the assistant can answer.'}
          </EmptyState>
        ) : null}

        {documents && documents.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Status</th>
                  <th className="num">Passages</th>
                  <th className="num hide-sm">Characters</th>
                  <th className="hide-sm">Added</th>
                  {isAdmin ? <th aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <span className="doc-cell">
                        <span className="doc-type">{fileTypeLabel(doc.mimeType, doc.source)}</span>
                        <span className="min-w-0">
                          <span className="doc-title">{doc.title}</span>
                          {doc.createdBy ? <span className="doc-meta">Added by {doc.createdBy.name}</span> : null}
                        </span>
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="num">{formatCount(doc.chunkCount)}</td>
                    <td className="num hide-sm">{doc.characterCount === null ? '—' : formatCount(doc.characterCount)}</td>
                    <td className="hide-sm">{formatDate(doc.createdAt)}</td>
                    {isAdmin ? (
                      <td className="row-actions">
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => setToDelete(doc)}
                          aria-label={`Delete ${doc.title}`}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Test retrieval</h2>
            <p className="muted">See which passages the assistant would read for a question, and how closely they match.</p>
          </div>
        </div>

        <form className="search-row" onSubmit={handleSearch}>
          <span className="input-icon">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="e.g. How long do refunds take?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search query"
            />
          </span>
          <button type="submit" className="button button-primary" disabled={searching || !query.trim()}>
            {searching ? <Spinner size="sm" /> : <Search size={15} aria-hidden="true" />} Search
          </button>
        </form>

        {searchError ? <Alert tone="error">{searchError}</Alert> : null}
        {results && results.length === 0 ? <p className="muted">No indexed passages found.</p> : null}

        {results && results.length > 0 ? (
          <ol className="results">
            {results.map((result) => (
              <li key={result.chunkId} className="result">
                <div className="result-head">
                  <span className="result-title">
                    <FileText size={14} aria-hidden="true" /> {result.document.title}
                    <span className="muted small"> · passage {result.chunkIndex + 1}</span>
                  </span>
                  <span className="match">
                    <span className="match-bar">
                      <span style={{ width: formatPercent(result.similarity) }} />
                    </span>
                    {formatPercent(result.similarity)}
                  </span>
                </div>
                <p className="result-text">{highlight(result.content, searchedFor)}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      {toDelete ? (
        <ConfirmDialog
          title="Delete document?"
          confirmLabel={deleting ? 'Deleting' : 'Delete'}
          busy={deleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        >
          <p>
            “{toDelete.title}” and its {toDelete.chunkCount} indexed passage{toDelete.chunkCount === 1 ? '' : 's'} will be
            removed. The assistant will no longer use it. This cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
