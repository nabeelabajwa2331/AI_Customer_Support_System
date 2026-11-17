import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import type { DocumentStatus } from '../types/api';

type Tone = 'error' | 'success' | 'info';

const toneIcon: Record<Tone, LucideIcon> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const Icon = toneIcon[tone];
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

const statusLabel: Record<DocumentStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  READY: 'Ready',
  FAILED: 'Failed',
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{statusLabel[status]}</span>;
}
