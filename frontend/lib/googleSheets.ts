import { google } from "googleapis";

import { DAILY_SHEET_TAB, INTRADAY_SHEET_TAB } from "./constants";
import { buildDashboardData, parseDailyRows, parseIntradayRows, toPublicDailyRows, toPublicIntradayRows } from "./sheetsTransform";
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
  const { series, freshness } = buildDashboardData(dailyRows, intradayRows);
  return {
    series,
    freshness,
    dailyRows: toPublicDailyRows(dailyRows),
    intradayRows: toPublicIntradayRows(intradayRows),
  };
}
