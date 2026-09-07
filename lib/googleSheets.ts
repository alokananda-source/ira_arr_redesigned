import { google } from "googleapis";

import { DAILY_SHEET_TAB, INTRADAY_SHEET_TAB, MINUTE_SHEET_TAB } from "./constants";
import {
  buildDashboardData,
  parseDailyRows,
  parseIntradayRows,
  parseMinuteRows,
  toPublicDailyRows,
  toPublicIntradayRows,
  toPublicMinuteRows,
} from "./sheetsTransform";
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

async function fetchSheetValues(): Promise<{ daily: unknown[][]; intraday: unknown[][]; minute: unknown[][] }> {
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
        `${quoteSheetTab(MINUTE_SHEET_TAB)}!A2:P`,
      ],
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error contacting Google Sheets API";
    throw new SheetsFetchError(message);
  }

  const [dailyRange, intradayRange, minuteRange] = response.data.valueRanges ?? [];
  return {
    daily: (dailyRange?.values ?? []) as unknown[][],
    intraday: (intradayRange?.values ?? []) as unknown[][],
    minute: (minuteRange?.values ?? []) as unknown[][],
  };
}

/**
 * sync_arr.py's Minute3Gateway cycle isn't a single atomic write -- it appends new rows, deletes
 * stale ones, sorts, then rebuilds the P/J-M formula columns, each a separate Sheets API call
 * spanning several real seconds. A read landing in the middle of that sequence can see a row that
 * never actually settles into anything a person would find by opening the sheet a moment later
 * (e.g. a freshly-appended row whose formula columns haven't been rebuilt yet).
 *
 * A previous fix waited 5s and re-fetched once, but only when the latest row's timestamp was
 * within 30s of "now" -- a reactive check that still races if any single cycle ever takes longer
 * than that 30s+5s budget (a slow Sheets API response, a retry, etc.), which is exactly the
 * "still see abrupt numbers" report that came back after that fix shipped.
 *
 * The permanent fix removes the race entirely instead of shrinking it: never look at a
 * Minute3Gateway row younger than FRESHNESS_LAG_MS. sync_arr.py runs roughly every 60-90s, so a
 * row that's a full 60s old has always been through one complete cycle by the time we read it,
 * regardless of how long that cycle took -- there is no timing window left to race.
 */
const FRESHNESS_LAG_MS = 60_000;

function rowTimestamp(row: unknown[] | undefined): Date | null {
  const raw = row?.[0];
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  // Minute3Gateway timestamps are IST wall-clock with no offset in the string -- construct as
  // IST (UTC+5:30) explicitly rather than letting the server's local timezone guess.
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 5, Number(mi) - 30));
}

/** Drops trailing minute rows younger than FRESHNESS_LAG_MS, oldest-first order assumed. */
function trimToSettled(minute: unknown[][]): unknown[][] {
  const cutoff = Date.now() - FRESHNESS_LAG_MS;
  let end = minute.length;
  while (end > 0) {
    const ts = rowTimestamp(minute[end - 1]);
    if (ts === null || ts.getTime() <= cutoff) break;
    end -= 1;
  }
  return minute.slice(0, end);
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const { daily, intraday, minute: rawMinute } = await fetchSheetValues();
  const minute = trimToSettled(rawMinute);

  const dailyRows = parseDailyRows(daily);
  const intradayRows = parseIntradayRows(intraday);
  const minuteRows = parseMinuteRows(minute);
  const { series, freshness } = buildDashboardData(dailyRows, intradayRows, minuteRows);
  return {
    series,
    freshness,
    dailyRows: toPublicDailyRows(dailyRows),
    intradayRows: toPublicIntradayRows(intradayRows),
    minuteRows: toPublicMinuteRows(minuteRows),
  };
}
