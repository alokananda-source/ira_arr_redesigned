function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink/10 ${className ?? ""}`} />;
}

export function StatPanelSkeleton() {
  return (
    <div className="rounded-3xl border border-ink/10 bg-paper-surface p-6 shadow-sm">
      <Pulse className="h-4 w-32" />
      <Pulse className="mt-2 h-10 w-48" />
      <div className="mt-5 space-y-2 border-t border-ink/10 pt-5">
        <Pulse className="h-8 w-40" />
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="h-80 w-full rounded-3xl border border-ink/10 bg-paper-surface p-4 shadow-sm">
      <Pulse className="h-full w-full" />
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="rounded-3xl border border-ink/10 bg-paper-surface p-4 shadow-sm">
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Pulse key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
