export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-3xl border border-red-200 bg-red-50 px-5 py-3">
      <div>
        <p className="text-sm font-medium text-red-800">couldn&apos;t load dashboard data</p>
        <p className="text-sm text-red-600">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        retry
      </button>
    </div>
  );
}
