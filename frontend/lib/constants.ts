export const DAILY_SHEET_TAB = process.env.GOOGLE_SHEET_DAILY_TAB || "Sheet 1";
export const INTRADAY_SHEET_TAB = process.env.GOOGLE_SHEET_INTRADAY_TAB || "Intraday10min";

export const STALE_THRESHOLD_DAYS = Number(process.env.STALE_THRESHOLD_DAYS || 2);

export const DEFAULT_CHART_RANGE_DAYS = 30;

export const RANGE_PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
] as const;

export const AUTH_COOKIE_NAME = "ira_dashboard_session";
