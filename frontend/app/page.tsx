"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DataTable } from "@/components/DataTable";
import { DateRangePicker } from "@/components/DateRangePicker";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Header } from "@/components/Header";
import { KpiRow } from "@/components/KpiRow";
import { RevenueChart } from "@/components/RevenueChart";
import { ChartSkeleton, KpiRowSkeleton, TableSkeleton } from "@/components/Skeletons";
import { TodayTrendChart } from "@/components/TodayTrendChart";
import { DEFAULT_CHART_RANGE_DAYS } from "@/lib/constants";
import { filterSeriesByRange, resolveRange, type DateRange } from "@/lib/rangeUtils";
import type { ApiResponse, Currency, DashboardData } from "@/lib/types";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currency, setCurrency] = useState<Currency>("INR");
  const [range, setRange] = useState<DateRange>({ type: "preset", days: DEFAULT_CHART_RANGE_DAYS });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      const body = (await response.json()) as ApiResponse;
      if (!body.ok) {
        setError(body.error.message);
        return;
      }
      setData(body.data);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolvedRange = useMemo(() => (data ? resolveRange(range, data.series) : null), [data, range]);
  const filteredSeries = useMemo(
    () => (data ? filterSeriesByRange(data.series, resolvedRange) : []),
    [data, resolvedRange],
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <Header
        currency={currency}
        onCurrencyChange={setCurrency}
        lastUpdated={data?.kpis.lastUpdated ?? null}
        staleDays={data?.kpis.staleDays ?? 0}
        isStale={data?.kpis.isStale ?? false}
        onRefresh={load}
        isRefreshing={isLoading}
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      {isLoading && !data ? (
        <>
          <KpiRowSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
          <TableSkeleton />
        </>
      ) : data ? (
        <>
          <KpiRow kpis={data.kpis} currency={currency} />

          <TodayTrendChart points={data.intradayTrend} />

          <DateRangePicker value={range} onChange={setRange} />

          {filteredSeries.length === 0 ? (
            <EmptyState message="try a different date range, or check back once the sheet has more history." />
          ) : (
            <>
              <RevenueChart series={filteredSeries} currency={currency} />
              <DataTable series={filteredSeries} currency={currency} />
            </>
          )}
        </>
      ) : null}
    </main>
  );
}
