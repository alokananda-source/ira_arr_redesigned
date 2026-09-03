import { formatDate } from "@/lib/format";
import type { Currency, DashboardKpis } from "@/lib/types";

import { FreshnessBadge } from "./FreshnessBadge";
import { KpiCard } from "./KpiCard";

export function KpiRow({ kpis, currency }: { kpis: DashboardKpis; currency: Currency }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard title="current ARR" snapshot={kpis.arr[currency === "INR" ? "inr" : "usd"]} currency={currency} />
      <KpiCard title="current MRR" snapshot={kpis.mrr[currency === "INR" ? "inr" : "usd"]} currency={currency} />
      <KpiCard title="current AOV" snapshot={kpis.aov[currency === "INR" ? "inr" : "usd"]} currency={currency} />
      <div className="flex flex-col justify-between rounded-3xl border border-ink/10 bg-paper-surface p-5 shadow-sm">
        <p className="text-sm font-medium text-ink/60">last updated</p>
        <p className="mt-1 text-2xl font-extrabold text-ink">{formatDate(kpis.lastUpdated)}</p>
        <div className="mt-4 border-t border-ink/10 pt-3">
          <FreshnessBadge lastUpdated={kpis.lastUpdated} staleDays={kpis.staleDays} isStale={kpis.isStale} />
        </div>
      </div>
    </div>
  );
}
