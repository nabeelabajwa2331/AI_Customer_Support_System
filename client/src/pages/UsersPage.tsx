import { ChevronLeft, ChevronRight, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Alert, EmptyState } from '../components/Feedback';
import { ROLE_LABEL } from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { ApiError, api } from '../lib/api';
import { formatCount, formatDate } from '../lib/format';
import type { AdminUser, Role, UserList } from '../types/api';

const PAGE_SIZE = 20;
const ROLES: Role[] = ['CUSTOMER', 'SUPPORT_AGENT', 'ADMIN'];

const ROLE_HELP: Record<Role, string> = {
  CUSTOMER: 'Can use the AI assistant only.',
  SUPPORT_AGENT: 'Can also see the dashboard, analytics and knowledge base.',
  ADMIN: 'Full access, including uploads, deletions and user management.',
};

type Filter = Role | 'ALL';

type PendingAction =
  | { kind: 'role'; user: AdminUser; role: Role }
  | { kind: 'delete'; user: AdminUser };

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UserList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  // Search waits for a short pause in typing instead of firing on every key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(
        await api.listUsers({
          search: search || undefined,
          role: filter === 'ALL' ? undefined : filter,
          page,
          pageSize: PAGE_SIZE,
        }),
      );
    } catch (error) {
      setLoadError(errorText(error, 'Could not load users.'));
    }
  }, [filter, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  function requestRoleChange(user: AdminUser, role: Role) {
    if (role === user.role) return;
    setPending({ kind: 'role', user, role });
  }

  async function confirmPending() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'role') {
        await api.updateUserRole(pending.user.id, pending.role);
        toast.success('Role updated', `${pending.user.name} is now ${ROLE_LABEL[pending.role].toLowerCase()}.`);
      } else {
        await api.deleteUser(pending.user.id);
        toast.success('User deleted', `${pending.user.name}'s account was removed.`);
      }
      setPending(null);
      await load();
    } catch (error) {
      toast.error(pending.kind === 'role' ? 'Role not changed' : 'User not deleted', errorText(error, 'Please try again.'));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  const counts = data?.roleCounts;
  const allCount = counts ? counts.CUSTOMER + counts.SUPPORT_AGENT + counts.ADMIN : null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filters: Array<{ value: Filter; label: string; count: number | null }> = [
    { value: 'ALL', label: 'All users', count: allCount },
    { value: 'CUSTOMER', label: 'Customers', count: counts?.CUSTOMER ?? null },
    { value: 'SUPPORT_AGENT', label: 'Support agents', count: counts?.SUPPORT_AGENT ?? null },
    { value: 'ADMIN', label: 'Admins', count: counts?.ADMIN ?? null },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Users"
        description="Everyone with an account. Promote trusted people to support agent, or remove accounts."
        actions={
          <button type="button" className="button button-secondary" onClick={() => void load()}>
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
        }
      />

      <div className="stat-strip">
        {filters.map((item) => (
          <div key={item.value}>
            <span>{item.label}</span>
            <strong>{item.count === null ? '—' : formatCount(item.count)}</strong>
          </div>
        ))}
      </div>

      <section className="card card-flush">
        <div className="users-toolbar padded">
          <div className="segmented" role="tablist" aria-label="Filter by role">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                className={filter === item.value ? 'is-active' : ''}
                onClick={() => {
                  setFilter(item.value);
                  setPage(1);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="input-icon users-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search name or email"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Search users"
            />
          </span>
        </div>

        {loadError ? (
          <div className="padded">
            <Alert tone="error">{loadError}</Alert>
          </div>
        ) : null}

        {data === null && !loadError ? (
          <div className="skeleton-list padded" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {data && data.users.length === 0 ? (
          <EmptyState icon={Users} title="No users found">
            {search ? `Nobody matches “${search}”.` : 'No accounts have this role yet.'}
          </EmptyState>
        ) : null}

        {data && data.users.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th className="num hide-sm">Questions</th>
                  <th className="hide-sm">Joined</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => {
                  const isMe = user.id === me?.id;
                  return (
                    <tr key={user.id}>
                      <td>
                        <span className="user-cell">
                          <Avatar name={user.name} size="sm" />
                          <span className="min-w-0">
                            <span className="doc-title">
                              {user.name}
                              {isMe ? <span className="tag tag-accent you-tag">You</span> : null}
                            </span>
                            <span className="doc-meta">{user.email}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <select
                          className="select"
                          value={user.role}
                          disabled={isMe}
                          title={isMe ? 'You cannot change your own role' : ROLE_HELP[user.role]}
                          aria-label={`Role for ${user.name}`}
                          onChange={(event) => requestRoleChange(user, event.target.value as Role)}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="num hide-sm">{formatCount(user.questionCount)}</td>
                      <td className="hide-sm">{formatDate(user.createdAt)}</td>
                      <td className="row-actions">
                        {isMe ? null : (
                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={() => setPending({ kind: 'delete', user })}
                            aria-label={`Delete ${user.name}`}
                            title="Delete account"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {data && data.total > data.pageSize ? (
          <div className="pager padded">
            <span className="muted small">
              Page {data.page} of {totalPages} · {formatCount(data.total)} users
            </span>
            <span className="pager-buttons">
              <button
                type="button"
                className="button button-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={15} aria-hidden="true" /> Previous
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight size={15} aria-hidden="true" />
              </button>
            </span>
          </div>
        ) : null}
      </section>

      {pending?.kind === 'role' ? (
        <ConfirmDialog
          title={`Make ${pending.user.name} ${ROLE_LABEL[pending.role].toLowerCase()}?`}
          confirmLabel={busy ? 'Saving' : 'Change role'}
          tone="primary"
          busy={busy}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        >
          <p>
            {ROLE_HELP[pending.role]} The change applies the next time they open a page.
          </p>
        </ConfirmDialog>
      ) : null}

      {pending?.kind === 'delete' ? (
        <ConfirmDialog
          title="Delete this account?"
          confirmLabel={busy ? 'Deleting' : 'Delete account'}
          busy={busy}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        >
          <p>
            {pending.user.name} ({pending.user.email}) will be signed out and can no longer sign in. Documents they
            uploaded and their question history stay, without their name. This cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
