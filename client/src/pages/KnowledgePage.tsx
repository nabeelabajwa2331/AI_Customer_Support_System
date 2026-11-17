import { BookOpen, FileText, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Alert, EmptyState, StatusBadge } from '../components/Feedback';
import { Spinner } from '../components/Spinner';
import { ApiError, api } from '../lib/api';
import { fileTypeLabel, formatCount, formatDate, formatPercent } from '../lib/format';
import type { KnowledgeDocument, SearchResult } from '../types/api';

const ACCEPT = '.pdf,.docx,.txt,.md';
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

export function KnowledgePage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');

  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
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

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setNotice(null);
    if (file.size > MAX_BYTES) {
      setNotice({ tone: 'error', text: 'Files must be 10 MB or smaller.' });
      return;
    }

    setUploading(file.name);
    try {
      const uploaded = await api.uploadDocument(file);
      setNotice({
        tone: 'success',
        text: `"${uploaded.title}" was indexed into ${uploaded.chunkCount} chunk${uploaded.chunkCount === 1 ? '' : 's'}.`,
      });
      await load();
    } catch (error) {
      setNotice({ tone: 'error', text: uploadErrorText(error) });
    } finally {
      setUploading(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteDocument(toDelete.id);
      setNotice({ tone: 'success', text: `"${toDelete.title}" was deleted.` });
      setToDelete(null);
      await load();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof ApiError ? error.message : 'Delete failed.' });
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await api.searchKnowledge(query.trim()));
    } catch (error) {
      setSearchError(error instanceof ApiError ? error.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  const uploadButton = isAdmin ? (
    <>
      <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={handleFile} data-testid="file-input" />
      <button
        type="button"
        className="button button-primary"
        onClick={() => fileInput.current?.click()}
        disabled={!!uploading}
      >
        {uploading ? <Spinner size="sm" /> : <Upload size={16} aria-hidden="true" />}
        {uploading ? 'Indexing' : 'Upload document'}
      </button>
    </>
  ) : null;

  return (
    <div className="stack">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Documents</h2>
            <p className="muted">PDF, DOCX, TXT or MD, up to 10 MB. The assistant answers only from these.</p>
          </div>
          <div className="card-actions">
            <button type="button" className="icon-button" onClick={() => void load()} aria-label="Refresh documents">
              <RefreshCw size={16} />
            </button>
            {uploadButton}
          </div>
        </div>

        {uploading ? (
          <Alert tone="info">
            Indexing "{uploading}". Each section is embedded by the local model, which can take a while for long files.
          </Alert>
        ) : null}
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
        {loadError ? <Alert tone="error">{loadError}</Alert> : null}

        {documents === null && !loadError ? (
          <div className="card-loading">
            <Spinner label="Loading documents" />
          </div>
        ) : null}

        {documents && documents.length === 0 ? (
          <EmptyState icon={BookOpen} title="No documents yet" action={uploadButton}>
            {isAdmin
              ? 'Upload your policies and FAQs so the assistant can answer from them.'
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
                  <th className="num">Chunks</th>
                  <th className="num hide-sm">Characters</th>
                  <th className="hide-sm">Uploaded</th>
                  {isAdmin ? <th aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <span className="doc-cell">
                        <span className="doc-type">{fileTypeLabel(doc.mimeType, doc.source)}</span>
                        <span>
                          <span className="doc-title">{doc.title}</span>
                          {doc.createdBy ? <span className="doc-meta">by {doc.createdBy.name}</span> : null}
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
            <h2>Search the knowledge base</h2>
            <p className="muted">See which passages the assistant would retrieve for a question.</p>
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
          <button type="submit" className="button button-secondary" disabled={searching || !query.trim()}>
            {searching ? <Spinner size="sm" /> : null} Search
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
                    <span className="muted small"> · section {result.chunkIndex + 1}</span>
                  </span>
                  <span className="score">{formatPercent(result.similarity)} match</span>
                </div>
                <p className="result-text">{result.content}</p>
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
            "{toDelete.title}" and its {toDelete.chunkCount} indexed chunk{toDelete.chunkCount === 1 ? '' : 's'} will be
            removed. The assistant will no longer use it. This cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
