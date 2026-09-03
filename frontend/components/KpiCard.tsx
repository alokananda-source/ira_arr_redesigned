import { formatCurrencyAbbreviated } from "@/lib/format";
import type { Currency, MetricSnapshot } from "@/lib/types";

import { ChangeBadge } from "./ChangeBadge";

export function KpiCard({
  title,
  snapshot,
  currency,
}: {
  title: string;
  snapshot: MetricSnapshot;
  currency: Currency;
}) {
  return (
    <div className="rounded-3xl border border-ink/10 bg-paper-surface p-5 shadow-sm">
      <p className="text-sm font-medium text-ink/60">{title}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-ink">
        {formatCurrencyAbbreviated(snapshot.current, currency)}
      </p>
      <div className="mt-4 space-y-1.5 border-t border-ink/10 pt-3">
        <ChangeBadge label="1d" change={snapshot.dayChange} currency={currency} />
        <ChangeBadge label="7d" change={snapshot.weekChange} currency={currency} />
      </div>
    </div>
  );
}
