import { google } from "googleapis";

import { DAILY_SHEET_TAB, INTRADAY_SHEET_TAB, STALE_THRESHOLD_DAYS } from "./constants";
import { addDaysIso, diffInCalendarDays, toDateOnly } from "./dateUtils";
import type {
  ChangeStat,
  DailyDashboardData,
  DashboardData,
  DashboardKpis,
  DayMetrics,
  IntradayTrendPoint,
  MetricSnapshot,
} from "./types";

export class SheetsConfigError extends Error {
  code = "CONFIG_ERROR";
}

export class SheetsFetchError extends Error {
  code = "FETCH_ERROR";
}

interface GatewayDayTotals {
  mrrInr: number;
  arrInr: number;
  activeSubscribers: number;
  mrrUsd: number;
  arrUsd: number;
}

interface GatewayDailyRow extends GatewayDayTotals {
  date: string;
  gateway: string;
}

interface IntradayBucketRow extends GatewayDayTotals {
  /** Raw "YYYY-MM-DD HH:mm" bucket start as read from the sheet. */
  timestamp: string;
  date: string;
  gateway: string;
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

export function parseDailyRows(rows: unknown[][]): GatewayDailyRow[] {
  const parsed: GatewayDailyRow[] = [];
  for (const row of rows) {
    const date = toDateOnly(str(row[0]));
    const gateway = str(row[1]);
    if (!date || !gateway) continue;
    parsed.push({
      date,
      gateway,
      mrrInr: num(row[2]),
      activeSubscribers: num(row[6]),
      arrInr: num(row[10]),
      mrrUsd: num(row[11]),
      arrUsd: num(row[12]),
    });
  }
  return parsed;
}

export function parseIntradayRows(rows: unknown[][]): IntradayBucketRow[] {
  const parsed: IntradayBucketRow[] = [];
  for (const row of rows) {
    const timestamp = str(row[0]);
    const date = toDateOnly(timestamp);
    const gateway = str(row[1]);
    if (!date || !gateway) continue;
    parsed.push({
      timestamp,
      date,
      gateway,
      mrrInr: num(row[8]),
      activeSubscribers: num(row[6]),
      arrInr: num(row[9]),
      mrrUsd: num(row[10]),
      arrUsd: num(row[11]),
    });
  }
  return parsed;
}

function emptyTotals(): GatewayDayTotals {
  return { mrrInr: 0, arrInr: 0, activeSubscribers: 0, mrrUsd: 0, arrUsd: 0 };
}

function addTotals(a: GatewayDayTotals, b: GatewayDayTotals): GatewayDayTotals {
  return {
    mrrInr: a.mrrInr + b.mrrInr,
    arrInr: a.arrInr + b.arrInr,
    activeSubscribers: a.activeSubscribers + b.activeSubscribers,
    mrrUsd: a.mrrUsd + b.mrrUsd,
    arrUsd: a.arrUsd + b.arrUsd,
  };
}

function aov(mrr: number, subscribers: number): number {
  return subscribers > 0 ? mrr / subscribers : 0;
}

function changeStat(current: number, previous: number | undefined): ChangeStat | null {
  if (previous === undefined) return null;
  const absolute = current - previous;
  const percent = previous !== 0 ? (absolute / previous) * 100 : null;
  return { absolute, percent };
}

function metricSnapshot(
  current: number,
  yesterday: number | undefined,
  weekAgo: number | undefined,
): MetricSnapshot {
  return {
    current,
    dayChange: changeStat(current, yesterday),
    weekChange: changeStat(current, weekAgo),
  };
}

/**
 * Rolls up per-gateway daily rows by date, then overrides the most recent day's totals with
 * whichever gateways have a same-day Intraday10min bucket (only Razorpay reports intraday today,
 * so Cashfree/Paytm keep their Sheet 1 value while Razorpay gets the freshest 10-minute figure).
 * Pure function — no network access — so it's exercised directly in tests against fixture rows.
 */
export function buildDashboardData(
  dailyRows: GatewayDailyRow[],
  intradayRows: IntradayBucketRow[],
  now: Date = new Date(),
): DailyDashboardData {
  const byDate = new Map<string, GatewayDayTotals>();
  const dailyRowByDateGateway = new Map<string, GatewayDayTotals>(); // key: `${date}|${gateway}`

  for (const row of dailyRows) {
    byDate.set(row.date, addTotals(byDate.get(row.date) ?? emptyTotals(), row));
    dailyRowByDateGateway.set(`${row.date}|${row.gateway}`, row);
  }

  const sortedDates = [...byDate.keys()].sort();

  if (sortedDates.length === 0) {
    return {
      kpis: {
        arr: { inr: metricSnapshot(0, undefined, undefined), usd: metricSnapshot(0, undefined, undefined) },
        mrr: { inr: metricSnapshot(0, undefined, undefined), usd: metricSnapshot(0, undefined, undefined) },
        aov: { inr: metricSnapshot(0, undefined, undefined), usd: metricSnapshot(0, undefined, undefined) },
        activeSubscribers: 0,
        lastUpdated: now.toISOString(),
        staleDays: 0,
        isStale: false,
      },
      series: [],
    };
  }

  const lastDate = sortedDates[sortedDates.length - 1] as string;

  // Latest intraday bucket per gateway, restricted to gateways reporting for the sheet's last date.
  const latestIntradayByGateway = new Map<string, IntradayBucketRow>();
  for (const bucket of intradayRows) {
    if (bucket.date !== lastDate) continue;
    const existing = latestIntradayByGateway.get(bucket.gateway);
    if (!existing || bucket.timestamp > existing.timestamp) {
      latestIntradayByGateway.set(bucket.gateway, bucket);
    }
  }

  const gatewaysOnLastDate = new Set<string>(dailyRows.filter((row) => row.date === lastDate).map((row) => row.gateway));
  for (const gateway of latestIntradayByGateway.keys()) gatewaysOnLastDate.add(gateway);

  let liveTotals = emptyTotals();
  let latestIntradayTimestamp: string | null = null;
  for (const gateway of gatewaysOnLastDate) {
    const intraday = latestIntradayByGateway.get(gateway);
    if (intraday) {
      liveTotals = addTotals(liveTotals, intraday);
      if (!latestIntradayTimestamp || intraday.timestamp > latestIntradayTimestamp) {
        latestIntradayTimestamp = intraday.timestamp;
      }
    } else {
      const daily = dailyRowByDateGateway.get(`${lastDate}|${gateway}`);
      if (daily) liveTotals = addTotals(liveTotals, daily);
    }
  }

  // Build the full series, swapping the last day's rolled-up totals for the live-blended figure.
  const series: DayMetrics[] = sortedDates.map((date) => {
    const totals = date === lastDate ? liveTotals : (byDate.get(date) as GatewayDayTotals);
    return {
      date,
      arrInr: totals.arrInr,
      mrrInr: totals.mrrInr,
      arrUsd: totals.arrUsd,
      mrrUsd: totals.mrrUsd,
      activeSubscribers: totals.activeSubscribers,
      aovInr: aov(totals.mrrInr, totals.activeSubscribers),
      aovUsd: aov(totals.mrrUsd, totals.activeSubscribers),
      dodArrChangePctInr: null,
      dodArrChangePctUsd: null,
    };
  });

  const seriesByDate = new Map(series.map((entry) => [entry.date, entry]));
  for (const entry of series) {
    const previous = seriesByDate.get(addDaysIso(entry.date, -1));
    if (previous) {
      entry.dodArrChangePctInr = previous.arrInr !== 0 ? ((entry.arrInr - previous.arrInr) / previous.arrInr) * 100 : null;
      entry.dodArrChangePctUsd = previous.arrUsd !== 0 ? ((entry.arrUsd - previous.arrUsd) / previous.arrUsd) * 100 : null;
    }
  }

  const current = series[series.length - 1] as DayMetrics;
  const yesterday = seriesByDate.get(addDaysIso(lastDate, -1));
  const weekAgo = seriesByDate.get(addDaysIso(lastDate, -7));

  const lastUpdated = latestIntradayTimestamp
    ? `${latestIntradayTimestamp.replace(" ", "T")}:00`
    : `${lastDate}T00:00:00`;
  const nowIso = now.toISOString().slice(0, 10);
  const staleDays = Math.max(0, diffInCalendarDays(nowIso, toDateOnly(lastUpdated) ?? lastDate));

  const kpis: DashboardKpis = {
    arr: {
      inr: metricSnapshot(current.arrInr, yesterday?.arrInr, weekAgo?.arrInr),
      usd: metricSnapshot(current.arrUsd, yesterday?.arrUsd, weekAgo?.arrUsd),
    },
    mrr: {
      inr: metricSnapshot(current.mrrInr, yesterday?.mrrInr, weekAgo?.mrrInr),
      usd: metricSnapshot(current.mrrUsd, yesterday?.mrrUsd, weekAgo?.mrrUsd),
    },
    aov: {
      inr: metricSnapshot(current.aovInr, yesterday?.aovInr, weekAgo?.aovInr),
      usd: metricSnapshot(current.aovUsd, yesterday?.aovUsd, weekAgo?.aovUsd),
    },
    activeSubscribers: current.activeSubscribers,
    lastUpdated,
    staleDays,
    isStale: staleDays > STALE_THRESHOLD_DAYS,
  };

  return { kpis, series };
}

function timeOfDaySlots(): string[] {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 10) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
}

const TIME_OF_DAY_SLOTS = timeOfDaySlots();
const TREND_LOOKBACK_DAYS = 3;

function timeOfDayOf(timestamp: string): string | null {
  const match = /^\d{4}-\d{2}-\d{2} (\d{2}:\d{2})/.exec(timestamp);
  return match?.[1] ?? null;
}

/**
 * Builds a "today vs. recent trend" series for the intraday hero chart: today's blended ARR (USD)
 * at each 10-minute time-of-day slot (solid line, naturally stopping at the latest bucket we've
 * actually seen — no fabricated future values), and the average of the same time-of-day slot over
 * up to the last 3 prior calendar days that have intraday coverage (dotted comparison line).
 *
 * A date only contributes at all if it has at least one Intraday10min row — a date with none (no
 * intraday feed reached it yet) is excluded rather than flattened across all 144 slots using only
 * its single Sheet 1 daily total, which would misrepresent its actual intraday shape.
 */
export function buildIntradayTrend(dailyRows: GatewayDailyRow[], intradayRows: IntradayBucketRow[]): IntradayTrendPoint[] {
  const dailyDates = new Set(dailyRows.map((row) => row.date));
  const intradayDates = new Set(intradayRows.map((row) => row.date));
  const allDates = [...dailyDates, ...intradayDates].sort();
  if (allDates.length === 0) return [];
  const lastDate = allDates[allDates.length - 1] as string;

  const dailyArrUsdByDateGateway = new Map<string, number>();
  const gatewaysByDate = new Map<string, Set<string>>();
  for (const row of dailyRows) {
    dailyArrUsdByDateGateway.set(`${row.date}|${row.gateway}`, row.arrUsd);
    const set = gatewaysByDate.get(row.date) ?? new Set<string>();
    set.add(row.gateway);
    gatewaysByDate.set(row.date, set);
  }

  const intradayArrUsdByDateTimeGateway = new Map<string, number>();
  const maxTimeOfDayByDate = new Map<string, string>();
  for (const bucket of intradayRows) {
    const timeOfDay = timeOfDayOf(bucket.timestamp);
    if (!timeOfDay) continue;
    intradayArrUsdByDateTimeGateway.set(`${bucket.date}|${timeOfDay}|${bucket.gateway}`, bucket.arrUsd);
    const set = gatewaysByDate.get(bucket.date) ?? new Set<string>();
    set.add(bucket.gateway);
    gatewaysByDate.set(bucket.date, set);
    const currentMax = maxTimeOfDayByDate.get(bucket.date);
    if (!currentMax || timeOfDay > currentMax) maxTimeOfDayByDate.set(bucket.date, timeOfDay);
  }

  function blendedTotal(date: string, timeOfDay: string): number | null {
    const cap = maxTimeOfDayByDate.get(date);
    if (!cap || timeOfDay > cap) return null;
    let total = 0;
    for (const gateway of gatewaysByDate.get(date) ?? []) {
      const intradayValue = intradayArrUsdByDateTimeGateway.get(`${date}|${timeOfDay}|${gateway}`);
      total += intradayValue ?? dailyArrUsdByDateGateway.get(`${date}|${gateway}`) ?? 0;
    }
    return total;
  }

  const trendDates = Array.from({ length: TREND_LOOKBACK_DAYS }, (_, i) => addDaysIso(lastDate, -(i + 1))).filter(
    (date) => maxTimeOfDayByDate.has(date),
  );

  return TIME_OF_DAY_SLOTS.map((timeOfDay) => {
    const todayArrUsd = blendedTotal(lastDate, timeOfDay);

    const trendValues = trendDates
      .map((date) => blendedTotal(date, timeOfDay))
      .filter((value): value is number => value !== null);
    const trendArrUsd = trendValues.length > 0 ? trendValues.reduce((a, b) => a + b, 0) / trendValues.length : null;

    return { timeOfDay, todayArrUsd, trendArrUsd };
  });
}

function quoteSheetTab(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'`;
}

async function fetchSheetValues(): Promise<{ daily: unknown[][]; intraday: unknown[][] }> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !rawKey || !spreadsheetId) {
    throw new SheetsConfigError(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, or GOOGLE_SHEET_ID environment variable.",
    );
  }

  const auth = new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  let response;
  try {
    response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [
        `${quoteSheetTab(DAILY_SHEET_TAB)}!A2:M`,
        `${quoteSheetTab(INTRADAY_SHEET_TAB)}!A2:L`,
      ],
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error contacting Google Sheets API";
    throw new SheetsFetchError(message);
  }

  const [dailyRange, intradayRange] = response.data.valueRanges ?? [];
  return {
    daily: (dailyRange?.values ?? []) as unknown[][],
    intraday: (intradayRange?.values ?? []) as unknown[][],
  };
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const { daily, intraday } = await fetchSheetValues();
  const dailyRows = parseDailyRows(daily);
  const intradayRows = parseIntradayRows(intraday);
  const { kpis, series } = buildDashboardData(dailyRows, intradayRows);
  const intradayTrend = buildIntradayTrend(dailyRows, intradayRows);
  return { kpis, series, intradayTrend };
}
