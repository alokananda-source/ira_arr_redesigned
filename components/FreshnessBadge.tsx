import { formatDateTime } from "@/lib/format";

function relativeLabel(staleDays: number): string {
  if (staleDays <= 0) return "updated today";
  if (staleDays === 1) return "updated yesterday";
  return `updated ${staleDays} days ago`;
}

export function FreshnessBadge({
  lastUpdated,
  staleDays,
  isStale,
}: {
  lastUpdated: string;
  staleDays: number;
  isStale: boolean;
}) {
  const dotClass = isStale ? "bg-warning" : "bg-positive";
  const textClass = isStale ? "text-warning" : "text-ink/60";

  return (
    <div className="flex flex-col items-end">
      <div className={`flex items-center gap-1.5 text-sm font-medium ${textClass}`}>
        <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
        {relativeLabel(staleDays)}
      </div>
      <p className="text-xs text-ink/40">last updated: {formatDateTime(lastUpdated)}</p>
    </div>
  );
}
