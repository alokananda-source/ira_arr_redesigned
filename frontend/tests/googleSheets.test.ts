import { describe, expect, it } from "vitest";

import { STALE_THRESHOLD_DAYS } from "@/lib/constants";
import { buildDashboardData, buildIntradayTrend, parseDailyRows, parseIntradayRows } from "@/lib/googleSheets";

/** Builds 8 days (2026-01-01..2026-01-08) of per-gateway daily rows for gateways A and B.
 * mrrInr grows linearly per day so day-over-day and week-over-week math is easy to predict. */
function buildDailyFixture(): unknown[][] {
  const rows: unknown[][] = [];
  for (let day = 1; day <= 8; day++) {
    const date = `2026-01-${String(day).padStart(2, "0")}`;
    const gatewayA = { mrr: 1000 + day * 10, subs: 10 };
    const gatewayB = { mrr: 500 + day * 5, subs: 10 };
    for (const [gateway, g] of [
      ["A", gatewayA],
      ["B", gatewayB],
    ] as const) {
      rows.push([date, gateway, g.mrr, 0, 0, 0, g.subs, 0, 0, g.mrr, g.mrr * 12, g.mrr / 90, (g.mrr * 12) / 90]);
    }
  }
  return rows;
}

function dailyTotalsFor(day: number) {
  const mrrA = 1000 + day * 10;
  const mrrB = 500 + day * 5;
  const mrrInr = mrrA + mrrB;
  return { mrrInr, arrInr: mrrInr * 12, subs: 20 };
}

describe("parseDailyRows", () => {
  it("parses well-formed rows and skips rows missing a date or gateway", () => {
    const rows = parseDailyRows([
      ["2026-01-01", "Razorpay", 100, 0, 0, 0, 5, 0, 20, 100, 1200, 1.1, 13.2],
      ["", "Cashfree", 50, 0, 0, 0, 2, 0, 25, 50, 600, 0.5, 6],
      ["2026-01-01", "", 50, 0, 0, 0, 2, 0, 25, 50, 600, 0.5, 6],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: "2026-01-01", gateway: "Razorpay", mrrInr: 100, arrInr: 1200 });
  });

  it("coerces comma-grouped numeric strings", () => {
    const rows = parseDailyRows([["2026-01-01", "Razorpay", "1,234.56", 0, 0, 0, 5, 0, 0, 0, "14,814.72", 0, 0]]);
    expect(rows[0]?.mrrInr).toBeCloseTo(1234.56);
    expect(rows[0]?.arrInr).toBeCloseTo(14814.72);
  });
});

describe("parseIntradayRows", () => {
  it("extracts the date from a 'YYYY-MM-DD HH:mm' bucket timestamp", () => {
    const rows = parseIntradayRows([
      ["2026-01-08 10:00", "Razorpay", 1, 1, 100, 100, 27000, 600, 16200000, 194400000, 171000, 2052000],
    ]);
    expect(rows[0]).toMatchObject({ date: "2026-01-08", timestamp: "2026-01-08 10:00", gateway: "Razorpay" });
  });

  it("skips rows without a gateway", () => {
    const rows = parseIntradayRows([["2026-01-08 10:00", "", 1, 1, 100, 100, 27000, 600, 16200000, 194400000, 171000, 2052000]]);
    expect(rows).toHaveLength(0);
  });
});

describe("buildDashboardData", () => {
  it("returns a zeroed, non-stale result for an empty sheet", () => {
    const result = buildDashboardData([], [], new Date("2026-01-08T12:00:00Z"));
    expect(result.series).toHaveLength(0);
    expect(result.kpis.arr.inr.current).toBe(0);
    expect(result.kpis.staleDays).toBe(0);
    expect(result.kpis.isStale).toBe(false);
  });

  it("rolls up gateways per day and computes AOV as total MRR / total subscribers", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], new Date("2026-01-08T12:00:00Z"));

    expect(result.series).toHaveLength(8);
    const day3 = result.series[2];
    const expectedDay3 = dailyTotalsFor(3);
    expect(day3?.mrrInr).toBe(expectedDay3.mrrInr);
    expect(day3?.arrInr).toBe(expectedDay3.arrInr);
    expect(day3?.aovInr).toBeCloseTo(expectedDay3.mrrInr / expectedDay3.subs);
  });

  it("computes day-over-day ARR % change against the previous calendar day", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], new Date("2026-01-08T12:00:00Z"));

    const day2 = result.series[1] as NonNullable<(typeof result.series)[number]>;
    const totalsDay1 = dailyTotalsFor(1);
    const totalsDay2 = dailyTotalsFor(2);
    const expectedPct = ((totalsDay2.arrInr - totalsDay1.arrInr) / totalsDay1.arrInr) * 100;
    expect(day2.dodArrChangePctInr).toBeCloseTo(expectedPct);
  });

  it("has no day-over-day change for the very first day in the series", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], new Date("2026-01-08T12:00:00Z"));
    expect(result.series[0]?.dodArrChangePctInr).toBeNull();
  });

  it("blends the latest same-day intraday bucket into the live total, per gateway", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const intraday = parseIntradayRows([
      // Gateway A gets a fresher, higher intraday figure for the last day (2026-01-08).
      ["2026-01-08 09:00", "A", 1, 1, 10, 10, 15, 70, 1200, 14400, 13.3, 160],
      ["2026-01-08 10:00", "A", 1, 1, 10, 20, 16, 71, 1300, 15600, 14.4, 173.3],
    ]);
    const result = buildDashboardData(daily, intraday, new Date("2026-01-08T12:00:00Z"));

    const dailyBTotalsDay8 = 500 + 8 * 5; // gateway B keeps its Sheet 1 value (no intraday feed)
    const liveMrrInr = 1300 + dailyBTotalsDay8;
    const last = result.series[result.series.length - 1];
    expect(last?.date).toBe("2026-01-08");
    expect(last?.mrrInr).toBe(liveMrrInr);
    expect(result.kpis.arr.inr.current).toBe(liveMrrInr * 12);
    expect(result.kpis.lastUpdated).toBe("2026-01-08T10:00:00");
  });

  it("falls back to the daily rollup's last date when no intraday bucket exists", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], new Date("2026-01-08T12:00:00Z"));
    expect(result.kpis.lastUpdated).toBe("2026-01-08T00:00:00");
  });

  it("computes week-over-week change against the entry 7 days prior", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], new Date("2026-01-08T12:00:00Z"));

    const totalsDay1 = dailyTotalsFor(1);
    const totalsDay8 = dailyTotalsFor(8);
    expect(result.kpis.arr.inr.weekChange?.absolute).toBe(totalsDay8.arrInr - totalsDay1.arrInr);
  });

  it("flags data as stale once it exceeds the configured threshold", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const freshNow = new Date("2026-01-08T12:00:00Z");
    const staleNow = new Date(`2026-01-${String(8 + STALE_THRESHOLD_DAYS + 1).padStart(2, "0")}T12:00:00Z`);

    const fresh = buildDashboardData(daily, [], freshNow);
    expect(fresh.kpis.isStale).toBe(false);

    const stale = buildDashboardData(daily, [], staleNow);
    expect(stale.kpis.isStale).toBe(true);
    expect(stale.kpis.staleDays).toBe(STALE_THRESHOLD_DAYS + 1);
  });

  it("returns AOV of 0 rather than dividing by zero when there are no active subscribers", () => {
    const daily = parseDailyRows([["2026-01-01", "Razorpay", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]);
    const result = buildDashboardData(daily, [], new Date("2026-01-01T12:00:00Z"));
    expect(result.series[0]?.aovInr).toBe(0);
    expect(result.series[0]?.aovUsd).toBe(0);
  });
});

describe("buildIntradayTrend", () => {
  // Gateway A reports intraday every day; gateway B never does (mirrors Cashfree/Paytm in the
  // real sheet) and always falls back to its flat Sheet 1 daily total for every time-of-day slot.
  // Day 4 ("today") only has a 00:00 bucket so far — 00:10 hasn't happened yet.
  const daily = parseDailyRows([
    ["2026-02-01", "A", 0, 0, 0, 0, 0, 0, 0, 0, 1000, 0, 1000],
    ["2026-02-01", "B", 0, 0, 0, 0, 0, 0, 0, 0, 200, 0, 200],
    ["2026-02-02", "B", 0, 0, 0, 0, 0, 0, 0, 0, 210, 0, 210],
    ["2026-02-03", "B", 0, 0, 0, 0, 0, 0, 0, 0, 220, 0, 220],
    ["2026-02-04", "B", 0, 0, 0, 0, 0, 0, 0, 0, 230, 0, 230],
  ]);
  const intraday = parseIntradayRows([
    ["2026-02-01 00:00", "A", 0, 0, 0, 0, 0, 0, 0, 0, 0, 100],
    ["2026-02-01 00:10", "A", 0, 0, 0, 0, 0, 0, 0, 0, 0, 110],
    ["2026-02-02 00:00", "A", 0, 0, 0, 0, 0, 0, 0, 0, 0, 120],
    ["2026-02-02 00:10", "A", 0, 0, 0, 0, 0, 0, 0, 0, 0, 130],
    ["2026-02-03 00:00", "A", 0, 0, 0, 0, 0, 0, 0, 0, 0, 140],
    ["2026-02-03 00:10", "A", 0, 0, 0, 0, 0, 0, 0, 0, 0, 150],
    ["2026-02-04 00:00", "A", 0, 0, 0, 0, 0, 0, 0, 0, 0, 160],
  ]);

  it("returns all 144 ten-minute time-of-day slots", () => {
    const trend = buildIntradayTrend(daily, intraday);
    expect(trend).toHaveLength(144);
    expect(trend[0]?.timeOfDay).toBe("00:00");
    expect(trend[1]?.timeOfDay).toBe("00:10");
    expect(trend[143]?.timeOfDay).toBe("23:50");
  });

  it("blends today's intraday gateway with the other gateways' flat daily total", () => {
    const trend = buildIntradayTrend(daily, intraday);
    expect(trend[0]).toMatchObject({ timeOfDay: "00:00", todayArrUsd: 160 + 230 });
  });

  it("leaves today's slot null once past the latest bucket actually seen", () => {
    const trend = buildIntradayTrend(daily, intraday);
    expect(trend[1]?.todayArrUsd).toBeNull(); // 00:10 hasn't happened yet for 2026-02-04
    expect(trend[2]?.todayArrUsd).toBeNull(); // 00:20 likewise
  });

  it("averages the last 3 prior days with intraday coverage at the same time of day", () => {
    const trend = buildIntradayTrend(daily, intraday);
    const day1 = 100 + 200;
    const day2 = 120 + 210;
    const day3 = 140 + 220;
    expect(trend[0]?.trendArrUsd).toBeCloseTo((day1 + day2 + day3) / 3);

    const day1b = 110 + 200;
    const day2b = 130 + 210;
    const day3b = 150 + 220;
    expect(trend[1]?.trendArrUsd).toBeCloseTo((day1b + day2b + day3b) / 3);
  });

  it("returns null for both series once no date has coverage for that slot", () => {
    const trend = buildIntradayTrend(daily, intraday);
    expect(trend[2]).toMatchObject({ timeOfDay: "00:20", todayArrUsd: null, trendArrUsd: null });
  });

  it("returns an empty array when there is no data at all", () => {
    expect(buildIntradayTrend([], [])).toEqual([]);
  });

  it("excludes a trend day entirely if it has no intraday rows, rather than flattening it", () => {
    const dailyOnly = parseDailyRows([
      ["2026-02-01", "A", 0, 0, 0, 0, 0, 0, 0, 0, 1000, 0, 1000], // no intraday row for this date at all
      ["2026-02-02", "A", 0, 0, 0, 0, 0, 0, 0, 0, 1200, 0, 1200],
    ]);
    const intradayOnlyDay2 = parseIntradayRows([["2026-02-02 00:00", "A", 0, 0, 0, 0, 0, 0, 0, 0, 0, 50]]);
    const trend = buildIntradayTrend(dailyOnly, intradayOnlyDay2);
    // 2026-02-01 has no intraday coverage, so it can't contribute to the trend average at all —
    // there's only one qualifying prior day here, and this is "today" itself so no trend anyway.
    expect(trend[0]).toMatchObject({ timeOfDay: "00:00", todayArrUsd: 50, trendArrUsd: null });
  });
});
