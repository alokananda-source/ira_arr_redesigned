import { addDaysIso } from "./dateUtils";
import type { ChangeStat, Currency, DayMetrics } from "./types";

export interface FocusStat {
  date: string;
  current: number;
  /** vs the previous calendar day. Null if that day isn't in the series. */
  dayChange: ChangeStat | null;
  /** vs the average of up to the trailing 7 days ending at (and including) the focused date. */
  sevenDayAvgChange: ChangeStat | null;
}

function arrValue(entry: DayMetrics, currency: Currency): number {
  return currency === "INR" ? entry.arrInr : entry.arrUsd;
}

function changeStat(current: number, reference: number): ChangeStat {
  const absolute = current - reference;
  return { absolute, percent: reference !== 0 ? (absolute / reference) * 100 : null };
}

/** Pure — computes the stat-panel figures for whichever date is focused (defaults to the series' last date). */
export function computeFocusStat(series: DayMetrics[], focusDate: string, currency: Currency): FocusStat | null {
  const byDate = new Map(series.map((entry) => [entry.date, entry]));
  const focused = byDate.get(focusDate);
  if (!focused) return null;

  const current = arrValue(focused, currency);

  const previous = byDate.get(addDaysIso(focusDate, -1));
  const dayChange = previous ? changeStat(current, arrValue(previous, currency)) : null;

  const trailingValues: number[] = [];
  for (let i = 0; i < 7; i++) {
    const entry = byDate.get(addDaysIso(focusDate, -i));
    if (entry) trailingValues.push(arrValue(entry, currency));
  }
  const sevenDayAvgChange =
    trailingValues.length > 0
      ? changeStat(current, trailingValues.reduce((a, b) => a + b, 0) / trailingValues.length)
      : null;

  return { date: focusDate, current, dayChange, sevenDayAvgChange };
}
