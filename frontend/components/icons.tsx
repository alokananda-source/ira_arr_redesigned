export function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6 2l4 4H8v4H4V6H2l4-4z" />
    </svg>
  );
}

export function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6 10L2 6h2V2h4v4h2l-4 4z" />
    </svg>
  );
}

export function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden="true">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 2.5v3.6h-3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SortIcon({ direction, className }: { direction: "asc" | "desc" | null; className?: string }) {
  if (direction === "asc") return <ArrowUpIcon className={className} />;
  if (direction === "desc") return <ArrowDownIcon className={className} />;
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className={className} aria-hidden="true" opacity={0.35}>
      <path d="M6 2l3 3H3l3-3zM6 10l-3-3h6l-3 3z" />
    </svg>
  );
}
