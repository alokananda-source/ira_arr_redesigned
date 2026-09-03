import { formatCurrencyAbbreviated, formatPercent } from "@/lib/format";
import type { ChangeStat, Currency } from "@/lib/types";

import { ArrowDownIcon, ArrowUpIcon } from "./icons";

export function ChangeBadge({
  label,
  change,
  currency,
}: {
  label: string;
  change: ChangeStat | null;
  currency: Currency;
}) {
  if (!change) {
    return (
      <div className="flex items-center justify-between text-xs text-ink/40">
        <span>{label}</span>
        <span>—</span>
      </div>
    );
  }

  const isPositive = change.absolute > 0;
  const isNegative = change.absolute < 0;
  const colorClass = isPositive ? "text-positive" : isNegative ? "text-negative" : "text-ink/40";

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-ink/40">{label}</span>
      <span className={`flex items-center gap-1 font-medium ${colorClass}`}>
        {isPositive && <ArrowUpIcon className="h-3 w-3" />}
        {isNegative && <ArrowDownIcon className="h-3 w-3" />}
        {formatCurrencyAbbreviated(change.absolute, currency)} ({formatPercent(change.percent)})
      </span>
    </div>
  );
}
