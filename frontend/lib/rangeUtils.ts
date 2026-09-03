import { addDaysIso } from "./dateUtils";
import type { DayMetrics } from "./types";

export interface PresetRange {
  type: "preset";
  days: number;
}

export interface CustomRange {
  type: "custom";
  start: string;
  end: string;
}

export type DateRange = PresetRange | CustomRange;

/** Resolves a range against the series' latest date (not "today") so the default 30D window
 * always includes the most recent data point even if the sheet lags behind the calendar. */
export function resolveRange(range: DateRange, series: DayMetrics[]): { start: string; end: string } | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1] as DayMetrics;
  if (range.type === "preset") {
    return { start: addDaysIso(latest.date, -(range.days - 1)), end: latest.date };
  }
  if (!range.start || !range.end) return null;
  return range.start <= range.end ? { start: range.start, end: range.end } : { start: range.end, end: range.start };
}

export function filterSeriesByRange(series: DayMetrics[], range: { start: string; end: string } | null): DayMetrics[] {
  if (!range) return [];
  return series.filter((entry) => entry.date >= range.start && entry.date <= range.end);
}
