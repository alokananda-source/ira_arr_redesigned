export function EmptyState({ title = "no data for this range", message }: { title?: string; message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-ink/20 bg-paper-surface text-center">
      <p className="text-sm font-medium text-ink/70">{title}</p>
      <p className="mt-1 text-sm text-ink/40">{message}</p>
    </div>
  );
}
