const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/** Similarity (0-1) as a whole percentage. */
export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function fileTypeLabel(mimeType: string | null, source: string | null): string {
  const extension = source?.split('.').pop()?.toUpperCase();
  if (extension && extension.length <= 4) return extension;
  if (mimeType === 'application/pdf') return 'PDF';
  return 'File';
}
