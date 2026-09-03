import { formatCurrencyAbbreviated, formatDate, formatPercent } from "@/lib/format";
import type { FocusStat } from "@/lib/statUtils";
import type { Currency } from "@/lib/types";

import { ArrowDownIcon, ArrowUpIcon } from "./icons";

function BigArrow({ change, currency }: { change: FocusStat["dayChange"]; currency: Currency }) {
  if (!change) {
    return <p className="text-sm text-ink/40">no prior-day figure to compare against</p>;
  }
  const isPositive = change.absolute > 0;
  const isNegative = change.absolute < 0;
  const colorClass = isPositive ? "text-positive" : isNegative ? "text-negative" : "text-ink/40";

  return (
    <div className={`flex items-center gap-3 ${colorClass}`}>
      {isPositive && <ArrowUpIcon className="h-8 w-8 shrink-0" />}
      {isNegative && <ArrowDownIcon className="h-8 w-8 shrink-0" />}
      <div>
        <p className="text-2xl font-extrabold tabular-nums leading-tight">
          {formatCurrencyAbbreviated(change.absolute, currency)}
        </p>
        <p className="text-sm font-semibold tabular-nums">{formatPercent(change.percent)} vs previous day</p>
      </div>
    </div>
  );
}

export function StatPanel({ stat, currency }: { stat: FocusStat; currency: Currency }) {
  const sevenDay = stat.sevenDayAvgChange;
  const sevenDayColor = !sevenDay
    ? "text-ink/40"
    : sevenDay.absolute > 0
      ? "text-positive"
      : sevenDay.absolute < 0
        ? "text-negative"
        : "text-ink/40";

  return (
    <div className="rounded-3xl border border-ink/10 bg-paper-surface p-6 shadow-sm">
      <p className="text-sm font-medium text-ink/60">{formatDate(stat.date)}&apos;s ARR</p>
      <p className="mt-1 text-4xl font-extrabold tabular-nums text-ink">
        {formatCurrencyAbbreviated(stat.current, currency)}
      </p>

      <div className="mt-5 border-t border-ink/10 pt-5">
        <BigArrow change={stat.dayChange} currency={currency} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-4 text-sm">
        <span className="text-ink/50">vs 7-day average</span>
        <span className={`font-semibold tabular-nums ${sevenDayColor}`}>
          {sevenDay ? formatPercent(sevenDay.percent) : "—"}
        </span>
      </div>
    </div>
  );
}
