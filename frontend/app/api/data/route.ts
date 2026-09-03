import { NextResponse } from "next/server";

import { fetchDashboardData, SheetsConfigError, SheetsFetchError } from "@/lib/googleSheets";
import type { ApiResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    const data = await fetchDashboardData();
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SheetsConfigError) {
      return NextResponse.json({ ok: false, error: { message: error.message, code: error.code } }, { status: 500 });
    }
    if (error instanceof SheetsFetchError) {
      return NextResponse.json({ ok: false, error: { message: error.message, code: error.code } }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error loading dashboard data.";
    return NextResponse.json({ ok: false, error: { message, code: "UNKNOWN_ERROR" } }, { status: 500 });
  }
}
