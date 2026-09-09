// As of the 2026-09-09 sheet simplification, the source sheet has two tabs, both already a
// single blended series (no per-gateway breakdown, no separate 10-minute bucket tab) — see
// arr_recalculated/ARR_RECALCULATED_LOGIC.md (Rumik_on root) and backend/sync_arr_simplified.py.
export const DAILY_SHEET_TAB = process.env.GOOGLE_SHEET_DAILY_TAB || "ARR Daywise";
// 1-minute tab — the freshest source, updated every minute by sync_arr_simplified.py.
export const MINUTE_SHEET_TAB = process.env.GOOGLE_SHEET_MINUTE_TAB || "ARR Minute wise";

export const STALE_THRESHOLD_DAYS = Number(process.env.STALE_THRESHOLD_DAYS || 2);

export const DEFAULT_CHART_RANGE_DAYS = 30;

export const RANGE_PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
] as const;

export const AUTH_COOKIE_NAME = "ira_dashboard_session";
