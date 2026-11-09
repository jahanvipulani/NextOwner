export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-muted" role="status" aria-live="polite">
      <svg width="20" height="20" viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line)" strokeWidth="3" />
        <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="var(--royal)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span>{label ?? 'Loading'}</span>
    </div>
  );
}
