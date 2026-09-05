/**
 * Pure data transforms for the IRA ARR sheet — no network access, safe to import from both
 * server code (the API route) and client components (the time-wise chart recomputes this
 * in-browser for whatever date the viewer picks). Keeping this free of the `googleapis` import
 * matters: that package is Node-only and must never end up in the client bundle.
 */
import { STALE_THRESHOLD_DAYS } from "./constants";
import { addDaysIso, diffInCalendarDays, toDateOnly } from "./dateUtils";
import type {
  DayMetrics,
  Freshness,
  GatewayDailyRow as PublicGatewayDailyRow,
  IntradayGatewayRow as PublicIntradayGatewayRow,
  MinuteRow as PublicMinuteRow,
  TimeOfDayPoint,
} from "./types";

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

/** Minute3Gateway rows are already summed across all gateways — no per-gateway blend needed. */
interface MinuteRow extends GatewayDayTotals {
  timestamp: string;
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

function numOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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

export function parseMinuteRows(rows: unknown[][]): MinuteRow[] {
  const parsed: MinuteRow[] = [];
  // Active Subscribers comes from column P (index 15, "Active Subscribers (Recursive)") — the
  // live self-referencing spreadsheet formula — never from column F (index 5). If a row's P
  // value is missing or unparseable (e.g. a #REF!/#VALUE! string, or a row written before this
  // column existed), carry forward the last valid P reading rather than falling back to F.
  let lastGoodActive = 0;
  for (const row of rows) {
    const timestamp = str(row[0]);
    const date = toDateOnly(timestamp);
    if (!date) continue;
    const activeFromP = numOrNull(row[15]);
    if (activeFromP !== null) lastGoodActive = activeFromP;
    parsed.push({
      timestamp,
      date,
      mrrInr: num(row[9]),
      activeSubscribers: lastGoodActive,
      arrInr: num(row[10]),
      mrrUsd: num(row[11]),
      arrUsd: num(row[12]),
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

/**
 * Rolls up per-gateway daily rows by date, then overrides the most recent day's totals with the
 * freshest live figure available, in order of preference:
 *   1. Minute3Gateway's latest same-day row — already summed across every gateway, updated every
 *      minute, so this is what makes the live number actually move minute to minute.
 *   2. Falling back to whichever gateways have a same-day Intraday10min (10-minute) bucket, for
 *      gateways/periods Minute3Gateway hasn't covered.
 *   3. Falling back further to that gateway's flat Sheet 1 daily total.
 */
export function buildDashboardData(
  dailyRows: GatewayDailyRow[],
  intradayRows: IntradayBucketRow[],
  minuteRows: MinuteRow[] = [],
  now: Date = new Date(),
): { series: DayMetrics[]; freshness: Freshness } {
  const byDate = new Map<string, GatewayDayTotals>();
  const dailyRowByDateGateway = new Map<string, GatewayDayTotals>(); // key: `${date}|${gateway}`

  for (const row of dailyRows) {
    byDate.set(row.date, addTotals(byDate.get(row.date) ?? emptyTotals(), row));
    dailyRowByDateGateway.set(`${row.date}|${row.gateway}`, row);
  }

  const sortedDates = [...byDate.keys()].sort();

  if (sortedDates.length === 0) {
    return { series: [], freshness: { lastUpdated: now.toISOString(), staleDays: 0, isStale: false } };
  }

  const lastDate = sortedDates[sortedDates.length - 1] as string;

  // Latest intraday bucket per gateway, restricted to gateways reporting for the sheet's last date.
  // Ties (>=, not >) resolve to whichever row this scan reaches last: the backend appends a fresh
  // replacement row before deleting the stale one it's replacing, so a read caught in that few-
  // second window can see both rows sharing one timestamp -- the fresher one always sorts later
  // in sheet order (appends land at the bottom), so preferring the later duplicate on a tie is
  // exactly "trust the newer write."
  const latestIntradayByGateway = new Map<string, IntradayBucketRow>();
  for (const bucket of intradayRows) {
    if (bucket.date !== lastDate) continue;
    const existing = latestIntradayByGateway.get(bucket.gateway);
    if (!existing || bucket.timestamp >= existing.timestamp) {
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

  // Minute3Gateway is already summed across every gateway and updates every minute — prefer its
  // latest same-day row outright whenever it's fresher than what the Intraday10min blend gave us,
  // rather than trying to merge the two (mixing "some gateways from a combined minute row, others
  // from their own 10-minute bucket" would double count).
  //
  // Ties (>=, not >) resolve to whichever row this scan reaches last, same reasoning as the
  // intraday picker above: the backend appends a fresh replacement row for a minute before
  // deleting the stale row it's replacing, so a read caught in that window can see two rows for
  // the same minute with different figures. The fresh one always lands later in sheet order, so
  // on a tie the later-scanned row is the newer write and should win.
  let latestMinuteRow: MinuteRow | null = null;
  for (const row of minuteRows) {
    if (row.date !== lastDate) continue;
    if (!latestMinuteRow || row.timestamp >= latestMinuteRow.timestamp) latestMinuteRow = row;
  }
  if (latestMinuteRow && (!latestIntradayTimestamp || latestMinuteRow.timestamp > latestIntradayTimestamp)) {
    liveTotals = latestMinuteRow;
    latestIntradayTimestamp = latestMinuteRow.timestamp;
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

  const lastUpdated = latestIntradayTimestamp
    ? `${latestIntradayTimestamp.replace(" ", "T")}:00`
    : `${lastDate}T00:00:00`;
  const nowIso = now.toISOString().slice(0, 10);
  const staleDays = Math.max(0, diffInCalendarDays(nowIso, toDateOnly(lastUpdated) ?? lastDate));

  return {
    series,
    freshness: { lastUpdated, staleDays, isStale: staleDays > STALE_THRESHOLD_DAYS },
  };
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

function timeOfDayOf(timestamp: string): string | null {
  const match = /^\d{4}-\d{2}-\d{2} (\d{2}:\d{2})/.exec(timestamp);
  return match?.[1] ?? null;
}

/**
 * Builds the intraday ARR curve (144 ten-minute slots) for one specific calendar date: at each
 * slot, sums every gateway's ARR, preferring that gateway's intraday bucket at that time when one
 * exists and falling back to its Sheet 1 daily total otherwise (mirrors the live-blend rule in
 * buildDashboardData, generalized to any date rather than only the sheet's last date). Slots past
 * the latest bucket actually recorded for the date are null rather than fabricated. A date with no
 * intraday coverage at all returns an all-null series (caller shows an empty state).
 *
 * Takes the trimmed public row shapes (date/gateway/arr only) so it can run client-side against
 * whatever the API already shipped — no extra fetch per date change.
 */
export function buildTimeOfDaySeries(
  dailyRows: PublicGatewayDailyRow[],
  intradayRows: PublicIntradayGatewayRow[],
  date: string,
): TimeOfDayPoint[] {
  const dailyByGateway = new Map<string, PublicGatewayDailyRow>();
  const gateways = new Set<string>();
  for (const row of dailyRows) {
    if (row.date !== date) continue;
    dailyByGateway.set(row.gateway, row);
    gateways.add(row.gateway);
  }

  const intradayByTimeGateway = new Map<string, PublicIntradayGatewayRow>();
  let maxTimeOfDay: string | null = null;
  for (const bucket of intradayRows) {
    if (bucket.date !== date) continue;
    const timeOfDay = timeOfDayOf(bucket.timestamp);
    if (!timeOfDay) continue;
    intradayByTimeGateway.set(`${timeOfDay}|${bucket.gateway}`, bucket);
    gateways.add(bucket.gateway);
    if (!maxTimeOfDay || timeOfDay > maxTimeOfDay) maxTimeOfDay = timeOfDay;
  }

  if (!maxTimeOfDay) {
    return TIME_OF_DAY_SLOTS.map((timeOfDay) => ({ timeOfDay, arrInr: null, arrUsd: null }));
  }

  return TIME_OF_DAY_SLOTS.map((timeOfDay) => {
    if (timeOfDay > (maxTimeOfDay as string)) return { timeOfDay, arrInr: null, arrUsd: null };
    let arrInr = 0;
    let arrUsd = 0;
    for (const gateway of gateways) {
      const intraday = intradayByTimeGateway.get(`${timeOfDay}|${gateway}`);
      const daily = dailyByGateway.get(gateway);
      arrInr += intraday?.arrInr ?? daily?.arrInr ?? 0;
      arrUsd += intraday?.arrUsd ?? daily?.arrUsd ?? 0;
    }
    return { timeOfDay, arrInr, arrUsd };
  });
}

export function toPublicDailyRows(rows: GatewayDailyRow[]): PublicGatewayDailyRow[] {
  return rows.map((row) => ({ date: row.date, gateway: row.gateway, arrInr: row.arrInr, arrUsd: row.arrUsd }));
}

export function toPublicIntradayRows(rows: IntradayBucketRow[]): PublicIntradayGatewayRow[] {
  return rows.map((row) => ({
    timestamp: row.timestamp,
    date: row.date,
    gateway: row.gateway,
    arrInr: row.arrInr,
    arrUsd: row.arrUsd,
  }));
}

export function toPublicMinuteRows(rows: MinuteRow[]): PublicMinuteRow[] {
  return rows.map((row) => ({
    timestamp: row.timestamp,
    date: row.date,
    arrInr: row.arrInr,
    arrUsd: row.arrUsd,
  }));
}
