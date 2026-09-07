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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * sync_arr.py's Minute3Gateway cycle isn't a single atomic write -- it appends new rows, deletes
 * stale ones, sorts, then rebuilds the P/J-M formula columns, each a separate Sheets API call
 * spanning several real seconds. A read landing in the middle of that sequence can see a state
 * that never actually settles into any row a person would find by opening the sheet a moment
 * later (e.g. a freshly-appended row whose formula columns haven't been rebuilt yet). Detect that
 * by checking whether the latest minute row's own timestamp is suspiciously close to "now" --
 * within the time it takes sync_arr.py to finish one cycle (empirically ~20-30s) -- and if so,
 * wait past that window and re-fetch once rather than serving a snapshot that's still in flux.
 */
function latestMinuteTimestamp(minute: unknown[][]): Date | null {
  const last = minute[minute.length - 1];
  const raw = last?.[0];
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  // Minute3Gateway timestamps are IST wall-clock with no offset in the string -- construct as
  // IST (UTC+5:30) explicitly rather than letting the server's local timezone guess.
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 5, Number(mi) - 30));
}

const SETTLE_WINDOW_MS = 30_000;
const SETTLE_WAIT_MS = 5_000;

export async function fetchDashboardData(): Promise<DashboardData> {
  let { daily, intraday, minute } = await fetchSheetValues();

  const latestTs = latestMinuteTimestamp(minute);
  if (latestTs && Date.now() - latestTs.getTime() < SETTLE_WINDOW_MS) {
    // Caught what looks like an in-progress sync cycle -- wait for it to finish, then re-fetch
    // once rather than serving a possibly-unsettled snapshot.
    await sleep(SETTLE_WAIT_MS);
    ({ daily, intraday, minute } = await fetchSheetValues());
  }

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
