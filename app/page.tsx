"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ArrChart } from "@/components/ArrChart";
import { DataTable } from "@/components/DataTable";
import { DateRangePicker } from "@/components/DateRangePicker";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Header } from "@/components/Header";
import { ModeToggle, type ChartMode } from "@/components/ModeToggle";
import { ChartSkeleton, StatPanelSkeleton, TableSkeleton } from "@/components/Skeletons";
import { SingleDatePicker } from "@/components/SingleDatePicker";
import { StatPanel } from "@/components/StatPanel";
import { DEFAULT_CHART_RANGE_DAYS } from "@/lib/constants";
import { filterSeriesByRange, resolveRange, type DateRange } from "@/lib/rangeUtils";
import { buildTimeOfDaySeries } from "@/lib/sheetsTransform";
import { computeFocusStat } from "@/lib/statUtils";
import type { ApiResponse, Currency, DashboardData } from "@/lib/types";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currency, setCurrency] = useState<Currency>("INR");
  const [mode, setMode] = useState<ChartMode>("day");
  const [range, setRange] = useState<DateRange>({ type: "preset", days: DEFAULT_CHART_RANGE_DAYS });
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [focusTimeOfDay, setFocusTimeOfDay] = useState<string | null>(null);

  const handleModeChange = useCallback((nextMode: ChartMode) => {
    setMode(nextMode);
    setFocusTimeOfDay(null);
  }, []);

  const handleFocusDateChange = useCallback((date: string) => {
    setFocusDate(date);
    setFocusTimeOfDay(null);
  }, []);

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

  const firstDate = data?.series[0]?.date ?? null;
  const latestDate = data?.series[data.series.length - 1]?.date ?? null;
  const effectiveFocusDate = focusDate ?? latestDate;

  const resolvedRange = useMemo(() => (data ? resolveRange(range, data.series) : null), [data, range]);
  const filteredSeries = useMemo(
    () => (data ? filterSeriesByRange(data.series, resolvedRange) : []),
    [data, resolvedRange],
  );

  const timeOfDayPoints = useMemo(() => {
    if (!data || mode !== "time" || !effectiveFocusDate) return [];
    return buildTimeOfDaySeries(data.dailyRows, data.intradayRows, effectiveFocusDate);
  }, [data, mode, effectiveFocusDate]);

  const focusStat = useMemo(() => {
    if (!data || !effectiveFocusDate) return null;
    return computeFocusStat(data.series, effectiveFocusDate, currency);
  }, [data, effectiveFocusDate, currency]);

  // When a specific intraday point is clicked, pin the headline number to that point's ARR
  // while the day-over-day / 7-day-average comparisons stay anchored to the whole focused day.
  const panelStat = useMemo(() => {
    if (!focusStat || mode !== "time" || !focusTimeOfDay) return focusStat;
    const point = timeOfDayPoints.find((p) => p.timeOfDay === focusTimeOfDay);
    const current = point ? (currency === "INR" ? point.arrInr : point.arrUsd) : null;
    if (current === null || current === undefined) return focusStat;
    return { ...focusStat, current, timeOfDay: focusTimeOfDay };
  }, [focusStat, mode, focusTimeOfDay, timeOfDayPoints, currency]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <Header
        currency={currency}
        onCurrencyChange={setCurrency}
        lastUpdated={data?.freshness.lastUpdated ?? null}
        staleDays={data?.freshness.staleDays ?? 0}
        isStale={data?.freshness.isStale ?? false}
        onRefresh={load}
        isRefreshing={isLoading}
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      {isLoading && !data ? (
        <>
          <StatPanelSkeleton />
          <ChartSkeleton />
          <TableSkeleton />
        </>
      ) : data ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ModeToggle value={mode} onChange={handleModeChange} />
            {mode === "time" && firstDate && latestDate && effectiveFocusDate && (
              <SingleDatePicker
                value={effectiveFocusDate}
                min={firstDate}
                max={latestDate}
                onChange={handleFocusDateChange}
              />
            )}
            {mode === "day" && <DateRangePicker value={range} onChange={setRange} />}
          </div>

          {panelStat ? (
            <StatPanel stat={panelStat} currency={currency} />
          ) : (
            <EmptyState message="no data for the selected date yet." />
          )}

          {mode === "day" ? (
            filteredSeries.length === 0 ? (
              <EmptyState message="try a different date range, or check back once the sheet has more history." />
            ) : (
              <>
                <ArrChart
                  mode="day"
                  series={filteredSeries}
                  timeOfDayPoints={[]}
                  currency={currency}
                  onPointClick={handleFocusDateChange}
                />
                <DataTable series={filteredSeries} currency={currency} />
              </>
            )
          ) : timeOfDayPoints.every((point) => point.arrInr === null) ? (
            <EmptyState
              title="no intraday data for this date"
              message="the 10-minute feed hasn't reported any buckets for this date yet."
            />
          ) : (
            <ArrChart
              mode="time"
              series={[]}
              timeOfDayPoints={timeOfDayPoints}
              currency={currency}
              onPointClick={setFocusTimeOfDay}
            />
          )}
        </>
      ) : null}
    </main>
  );
}
