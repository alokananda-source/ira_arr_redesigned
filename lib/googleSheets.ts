import { google } from "googleapis";

import { DAILY_SHEET_TAB, MINUTE_SHEET_TAB } from "./constants";
import { buildDashboardData, parseDailyRows, parseMinuteRows, toPublicMinuteRows } from "./sheetsTransform";
import type { DashboardData } from "./types";

export class SheetsConfigError extends Error {
  code = "CONFIG_ERROR";
}

export class SheetsFetchError extends Error {
  code = "FETCH_ERROR";
}

function quoteSheetTab(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'`;
}

async function fetchSheetValues(): Promise<{ daily: unknown[][]; minute: unknown[][] }> {
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
      // Both tabs share the same 6-column shape: Date/Minute, Active Subscribers, AOV, MRR, ARR, ARR usd.
      ranges: [`${quoteSheetTab(DAILY_SHEET_TAB)}!A2:F`, `${quoteSheetTab(MINUTE_SHEET_TAB)}!A2:F`],
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error contacting Google Sheets API";
    throw new SheetsFetchError(message);
  }

  const [dailyRange, minuteRange] = response.data.valueRanges ?? [];
  return {
    daily: (dailyRange?.values ?? []) as unknown[][],
    minute: (minuteRange?.values ?? []) as unknown[][],
  };
}

/**
 * sync_arr_simplified.py's cycle isn't a single atomic write per tab -- it appends new rows,
 * deletes the stale ones they replace, then sorts, each a separate Sheets API call. A read
 * landing mid-sequence could in principle see a transient state, though the append-before-delete
 * ordering (see upsert_rows() in the backend script) means a reader never sees a genuine gap —
 * at worst a duplicate row for one instant, and the later-scanned duplicate always wins in
 * buildDashboardData's tie-break. No settle-lag trim is needed here the way the old
 * Minute3Gateway multi-call formula rebuild needed one.
 */

export async function fetchDashboardData(): Promise<DashboardData> {
  const { daily, minute } = await fetchSheetValues();

  const dailyRows = parseDailyRows(daily);
  const minuteRows = parseMinuteRows(minute);
  const { series, freshness } = buildDashboardData(dailyRows, minuteRows);
  return {
    series,
    freshness,
    minuteRows: toPublicMinuteRows(minuteRows),
  };
}
