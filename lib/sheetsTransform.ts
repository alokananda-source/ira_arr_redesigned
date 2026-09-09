/**
 * Pure data transforms for the IRA ARR sheet — no network access, safe to import from both
 * server code (the API route) and client components. Keeping this free of the `googleapis`
 * import matters: that package is Node-only and must never end up in the client bundle.
 *
 * As of the 2026-09-09 sheet simplification, both source tabs ("ARR Daywise" and "ARR Minute
 * wise") share one flat column shape and are already a single blended series — no per-gateway
 * rollup needed. See arr_recalculated/ARR_RECALCULATED_LOGIC.md (Rumik_on root) for how the
 * sheet itself is computed, and backend/sync_arr_simplified.py for the writer.
 */
import { STALE_THRESHOLD_DAYS } from "./constants";
import { addDaysIso, diffInCalendarDays, toDateOnly } from "./dateUtils";
import type { DayMetrics, Freshness, MinuteRow as PublicMinuteRow } from "./types";

const FX_RATE = 94.54; // fixed INR->USD constant — see ARR_MRR_logic.md / ARR_RECALCULATED_LOGIC.md

interface Metrics {
  activeSubscribers: number;
  aovInr: number;
  mrrInr: number;
  arrInr: number;
  arrUsd: number;
}

interface DailyRow extends Metrics {
  date: string; // YYYY-MM-DD
}

interface MinuteRow extends Metrics {
  timestamp: string; // "YYYY-MM-DD HH:mm"
  date: string;
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const SHEET_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const SHEET_DATETIME_RE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;

/** "DD/MM/YYYY" -> "YYYY-MM-DD", or null if it doesn't match. The sheet writer
 * (sync_arr_simplified.py) always writes this format; ISO is accepted too as a fallback so a
 * hand-edited or differently-formatted row doesn't just silently vanish. */
function parseSheetDate(value: string): string | null {
  const m = SHEET_DATE_RE.exec(value);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return toDateOnly(value);
}

/** "DD/MM/YYYY HH:mm" -> { date: "YYYY-MM-DD", timestamp: "YYYY-MM-DD HH:mm" }, or null. */
function parseSheetDateTime(value: string): { date: string; timestamp: string } | null {
  const m = SHEET_DATETIME_RE.exec(value);
  if (m) {
    const date = `${m[3]}-${m[2]}-${m[1]}`;
    return { date, timestamp: `${date} ${m[4]}:${m[5]}` };
  }
  const date = toDateOnly(value);
  if (date) return { date, timestamp: value };
  return null;
}

/** Parses "ARR Daywise": Date | Active Subscribers | AOV | MRR | ARR | ARR usd */
export function parseDailyRows(rows: unknown[][]): DailyRow[] {
  const parsed: DailyRow[] = [];
  for (const row of rows) {
    const date = parseSheetDate(str(row[0]));
    if (!date) continue;
    parsed.push({
      date,
      activeSubscribers: num(row[1]),
      aovInr: num(row[2]),
      mrrInr: num(row[3]),
      arrInr: num(row[4]),
      arrUsd: num(row[5]),
    });
  }
  return parsed;
}

/** Parses "ARR Minute wise": Minute (IST) | Active Subscribers | AOV | MRR | ARR | ARR usd */
export function parseMinuteRows(rows: unknown[][]): MinuteRow[] {
  const parsed: MinuteRow[] = [];
  for (const row of rows) {
    const parsedTs = parseSheetDateTime(str(row[0]));
    if (!parsedTs) continue;
    parsed.push({
      timestamp: parsedTs.timestamp,
      date: parsedTs.date,
      activeSubscribers: num(row[1]),
      aovInr: num(row[2]),
      mrrInr: num(row[3]),
      arrInr: num(row[4]),
      arrUsd: num(row[5]),
    });
  }
  return parsed;
}

function toDayMetrics(row: Metrics, date: string): DayMetrics {
  const mrrUsd = row.arrUsd / 12;
  return {
    date,
    activeSubscribers: row.activeSubscribers,
    aovInr: row.aovInr,
    mrrInr: row.mrrInr,
    arrInr: row.arrInr,
    mrrUsd,
    arrUsd: row.arrUsd,
    aovUsd: row.activeSubscribers > 0 ? mrrUsd / row.activeSubscribers : 0,
    dodArrChangePctInr: null,
    dodArrChangePctUsd: null,
  };
}

/**
 * Builds the daily series, overriding the most recent day's row with the freshest same-day
 * "ARR Minute wise" row when one is available (that tab updates every minute, so this is what
 * makes the live figure move minute to minute rather than only once a day).
 */
export function buildDashboardData(
  dailyRows: DailyRow[],
  minuteRows: MinuteRow[] = [],
  now: Date = new Date(),
): { series: DayMetrics[]; freshness: Freshness } {
  const byDate = new Map<string, DailyRow>();
  for (const row of dailyRows) byDate.set(row.date, row);

  const sortedDates = [...byDate.keys()].sort();

  if (sortedDates.length === 0) {
    return { series: [], freshness: { lastUpdated: now.toISOString(), staleDays: 0, isStale: false } };
  }

  const lastDate = sortedDates[sortedDates.length - 1] as string;

  // Latest same-day minute row wins ties (>=, not >): the backend appends a fresh replacement
  // row before deleting the stale one it's replacing, so a read caught mid-cycle can see two
  // rows sharing one timestamp — the fresher write always sorts later in sheet scan order.
  let latestMinuteRow: MinuteRow | null = null;
  for (const row of minuteRows) {
    if (row.date !== lastDate) continue;
    if (!latestMinuteRow || row.timestamp >= latestMinuteRow.timestamp) latestMinuteRow = row;
  }

  const liveRow: Metrics = latestMinuteRow ?? (byDate.get(lastDate) as DailyRow);
  const liveTimestamp = latestMinuteRow?.timestamp ?? null;

  const series: DayMetrics[] = sortedDates.map((date) =>
    toDayMetrics(date === lastDate ? liveRow : (byDate.get(date) as DailyRow), date),
  );

  const seriesByDate = new Map(series.map((entry) => [entry.date, entry]));
  for (const entry of series) {
    const previous = seriesByDate.get(addDaysIso(entry.date, -1));
    if (previous) {
      entry.dodArrChangePctInr = previous.arrInr !== 0 ? ((entry.arrInr - previous.arrInr) / previous.arrInr) * 100 : null;
      entry.dodArrChangePctUsd = previous.arrUsd !== 0 ? ((entry.arrUsd - previous.arrUsd) / previous.arrUsd) * 100 : null;
    }
  }

  const lastUpdated = liveTimestamp ? `${liveTimestamp.replace(" ", "T")}:00` : `${lastDate}T00:00:00`;
  const nowIso = now.toISOString().slice(0, 10);
  const staleDays = Math.max(0, diffInCalendarDays(nowIso, toDateOnly(lastUpdated) ?? lastDate));

  return {
    series,
    freshness: { lastUpdated, staleDays, isStale: staleDays > STALE_THRESHOLD_DAYS },
  };
}

export function toPublicMinuteRows(rows: MinuteRow[]): PublicMinuteRow[] {
  return rows.map((row) => ({
    timestamp: row.timestamp,
    date: row.date,
    activeSubscribers: row.activeSubscribers,
    aovInr: row.aovInr,
    mrrInr: row.mrrInr,
    arrInr: row.arrInr,
    arrUsd: row.arrUsd,
  }));
}

// FX_RATE is exported for anything client-side that needs to derive USD from an INR figure the
// sheet didn't already provide in USD (the sheet only ships MRR/ARR/ARR usd for daily rows, no
// separate "MRR usd" or "AOV usd" columns — toDayMetrics() above derives those the same way).
export { FX_RATE };
