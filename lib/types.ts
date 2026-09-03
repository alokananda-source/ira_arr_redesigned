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

/** Per-gateway daily ARR, shipped to the client so it can build an intraday curve for any date it picks. */
export interface GatewayDailyRow {
  date: string;
  gateway: string;
  arrInr: number;
  arrUsd: number;
}

/** Per-gateway 10-minute bucket, shipped raw for the same reason. */
export interface IntradayGatewayRow {
  timestamp: string; // "YYYY-MM-DD HH:mm"
  date: string;
  gateway: string;
  arrInr: number;
  arrUsd: number;
}

export interface TimeOfDayPoint {
  /** "HH:mm", the 10-minute bucket start. */
  timeOfDay: string;
  /** Null once past the latest bucket actually recorded for that date. */
  arrInr: number | null;
  arrUsd: number | null;
}

export interface DashboardData {
  series: DayMetrics[];
  freshness: Freshness;
  dailyRows: GatewayDailyRow[];
  intradayRows: IntradayGatewayRow[];
}

export interface ApiError {
  message: string;
  code: string;
}

export type ApiResponse =
  | { ok: true; data: DashboardData }
  | { ok: false; error: ApiError };
