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

export interface MetricSnapshot {
  current: number;
  /** null when there is no prior-day data point to compare against. */
  dayChange: ChangeStat | null;
  /** null when there is no data point 7 days prior to compare against. */
  weekChange: ChangeStat | null;
}

export interface DashboardKpis {
  arr: { inr: MetricSnapshot; usd: MetricSnapshot };
  mrr: { inr: MetricSnapshot; usd: MetricSnapshot };
  aov: { inr: MetricSnapshot; usd: MetricSnapshot };
  activeSubscribers: number;
  lastUpdated: string; // ISO datetime
  staleDays: number;
  isStale: boolean;
}

export interface IntradayTrendPoint {
  /** "HH:mm", the 10-minute bucket start. */
  timeOfDay: string;
  /** Today's blended ARR (USD) at this time of day. Null once past "now" — no bucket yet. */
  todayArrUsd: number | null;
  /** Average blended ARR (USD) at this time of day across up to the last 3 prior calendar days. */
  trendArrUsd: number | null;
}

export interface DailyDashboardData {
  kpis: DashboardKpis;
  series: DayMetrics[];
}

export interface DashboardData extends DailyDashboardData {
  intradayTrend: IntradayTrendPoint[];
}

export interface ApiError {
  message: string;
  code: string;
}

export type ApiResponse =
  | { ok: true; data: DashboardData }
  | { ok: false; error: ApiError };
