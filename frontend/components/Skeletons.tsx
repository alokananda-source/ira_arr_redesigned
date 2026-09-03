function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink/10 ${className ?? ""}`} />;
}

export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-3xl border border-ink/10 bg-paper-surface p-5 shadow-sm">
          <Pulse className="h-4 w-24" />
          <Pulse className="mt-2 h-7 w-32" />
          <div className="mt-4 space-y-2 border-t border-ink/10 pt-3">
            <Pulse className="h-3 w-full" />
            <Pulse className="h-3 w-full" />
          </div>
        </div>
      ))}
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
