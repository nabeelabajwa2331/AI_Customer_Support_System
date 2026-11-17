export function Spinner({ label, size = 'md' }: { label?: string; size?: 'sm' | 'md' }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className={`spinner spinner-${size}`} aria-hidden="true" />
      {label ? <span className="spinner-label">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
