import type { Currency } from "@/lib/types";

import { CurrencyToggle } from "./CurrencyToggle";
import { FreshnessBadge } from "./FreshnessBadge";
import { RefreshIcon } from "./icons";

export function Header({
  currency,
  onCurrencyChange,
  lastUpdated,
  staleDays,
  isStale,
  onRefresh,
  isRefreshing,
}: {
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
  lastUpdated: string | null;
  staleDays: number;
  isStale: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-full border border-ink/10 bg-paper-surface px-6 py-3 shadow-sm">
      <div>
        <h1 className="font-sans text-xl font-extrabold tracking-tight text-ink">ira arr/mrr dashboard</h1>
        <p className="text-sm text-ink/60">live revenue from the IRA ARR sheet</p>
      </div>
      <div className="flex items-center gap-4">
        {lastUpdated && <FreshnessBadge lastUpdated={lastUpdated} staleDays={staleDays} isStale={isStale} />}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="refresh dashboard"
          title="refresh dashboard from the sheet"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-paper text-ink/70 transition-colors hover:text-ink disabled:opacity-50"
        >
          <RefreshIcon className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
        <CurrencyToggle value={currency} onChange={onCurrencyChange} />
      </div>
    </header>
  );
}
