export type Currency = "INR" | "USD";

export interface DayMetrics {
  date: string; // YYYY-MM-DD
  arrInr: number;
  mrrInr: number;
  arrUsd: number;
  mrrUsd: number;
  activeSubscribers: number;
  aovInr: number;
  aovUsd: number;
  /** ARR day-over-day % change vs the previous calendar day, per currency. Null if no prior-day data point. */
  dodArrChangePctInr: number | null;
  dodArrChangePctUsd: number | null;
}

export interface ChangeStat {
  absolute: number;
  percent: number | null;
}

export interface Freshness {
  lastUpdated: string; // ISO datetime
  staleDays: number;
  isStale: boolean;
}

/**
 * "ARR Minute wise" row — one per real minute, already a single blended figure (no gateway
 * breakdown; see DAILY/MINUTE_SHEET_TAB in constants.ts). Shipped to the client so the ticker
 * can compute "vs 1 minute ago" / "vs trailing 15-min avg" without an extra fetch per tick.
 */
export interface MinuteRow {
  timestamp: string; // "YYYY-MM-DD HH:mm"
  date: string;
  activeSubscribers: number;
  aovInr: number;
  mrrInr: number;
  arrInr: number;
  arrUsd: number;
}

export interface DashboardData {
  series: DayMetrics[];
  freshness: Freshness;
  minuteRows: MinuteRow[];
}

export interface ApiError {
  message: string;
  code: string;
}

export type ApiResponse =
  | { ok: true; data: DashboardData }
  | { ok: false; error: ApiError };
