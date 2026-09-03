import { formatCurrencyAbbreviated, formatDate, formatPercent } from "@/lib/format";
import type { FocusStat, StatComparison } from "@/lib/statUtils";
import type { Currency } from "@/lib/types";

import { ArrowDownIcon, ArrowUpIcon } from "./icons";

function DayChange({ change, currency }: { change: FocusStat["dayChange"]; currency: Currency }) {
  if (!change) {
    return <p className="text-sm text-ink/40">no prior-day figure</p>;
  }
  const isPositive = change.absolute > 0;
  const isNegative = change.absolute < 0;
  const colorClass = isPositive ? "text-positive" : isNegative ? "text-negative" : "text-ink/40";

  return (
    <div className={`flex items-center gap-2 ${colorClass}`}>
      {isPositive && <ArrowUpIcon className="h-6 w-6 shrink-0" />}
      {isNegative && <ArrowDownIcon className="h-6 w-6 shrink-0" />}
      <div>
        <p className="text-xl font-extrabold tabular-nums leading-tight">
          {formatCurrencyAbbreviated(change.absolute, currency)}
        </p>
        <p className="text-xs font-semibold tabular-nums">{formatPercent(change.percent)}</p>
      </div>
    </div>
  );
}

function ArrComparison({ comp, currency }: { comp: StatComparison | null; currency: Currency }) {
  if (!comp) {
    return <p className="text-sm text-ink/40">no data</p>;
  }
  const change = comp.change;
  const colorClass = !change
    ? "text-ink/40"
    : change.absolute > 0
      ? "text-positive"
      : change.absolute < 0
        ? "text-negative"
        : "text-ink/40";

  return (
    <div>
      <p className="text-xl font-extrabold tabular-nums leading-tight text-ink">
        {formatCurrencyAbbreviated(comp.value, currency)}
      </p>
      <p className={`text-xs font-semibold tabular-nums ${colorClass}`}>
        {change ? `${formatPercent(change.percent)} vs prior day` : "no prior-day figure"}
      </p>
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
    <div className="rounded-3xl border border-ink/10 bg-paper-surface p-6 shadow-sm" data-testid="stat-panel">
      <p className="text-sm font-medium text-ink/60">{formatDate(stat.date)}&apos;s ARR</p>
      <p className="mt-1 text-4xl font-extrabold tabular-nums text-ink" data-testid="stat-current-arr">
        {formatCurrencyAbbreviated(stat.current, currency)}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-6 border-t border-ink/10 pt-5 sm:grid-cols-3">
        <div data-testid="stat-block-day-change">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">vs previous day</p>
          <div className="mt-1">
            <DayChange change={stat.dayChange} currency={currency} />
          </div>
        </div>

        <div data-testid="stat-block-n1">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
            n-1 day ARR{stat.previousDay ? ` \u00b7 ${formatDate(stat.previousDay.date)}` : ""}
          </p>
          <div className="mt-1">
            <ArrComparison comp={stat.previousDay} currency={currency} />
          </div>
        </div>

        <div data-testid="stat-block-n7">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
            n-7 day ARR{stat.weekAgoDay ? ` \u00b7 ${formatDate(stat.weekAgoDay.date)}` : ""}
          </p>
          <div className="mt-1">
            <ArrComparison comp={stat.weekAgoDay} currency={currency} />
          </div>
        </div>
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
