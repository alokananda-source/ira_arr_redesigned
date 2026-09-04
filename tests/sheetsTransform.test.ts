import { describe, expect, it } from "vitest";

import { buildDashboardData, buildTimeOfDaySeries, parseDailyRows, parseIntradayRows, parseMinuteRows, toPublicDailyRows, toPublicIntradayRows } from "@/lib/sheetsTransform";
import { STALE_THRESHOLD_DAYS } from "@/lib/constants";

/** Builds 8 days (2026-01-01..2026-01-08) of per-gateway daily rows for gateways A and B.
 * mrrInr grows linearly per day so day-over-day math is easy to predict. */
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
  it("returns an empty, non-stale result for an empty sheet", () => {
    const result = buildDashboardData([], [], [], new Date("2026-01-08T12:00:00Z"));
    expect(result.series).toHaveLength(0);
    expect(result.freshness.staleDays).toBe(0);
    expect(result.freshness.isStale).toBe(false);
  });

  it("rolls up gateways per day and computes AOV as total MRR / total subscribers", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], [], new Date("2026-01-08T12:00:00Z"));

    expect(result.series).toHaveLength(8);
    const day3 = result.series[2];
    const expectedDay3 = dailyTotalsFor(3);
    expect(day3?.mrrInr).toBe(expectedDay3.mrrInr);
    expect(day3?.arrInr).toBe(expectedDay3.arrInr);
    expect(day3?.aovInr).toBeCloseTo(expectedDay3.mrrInr / expectedDay3.subs);
  });

  it("computes day-over-day ARR % change against the previous calendar day", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], [], new Date("2026-01-08T12:00:00Z"));

    const day2 = result.series[1] as NonNullable<(typeof result.series)[number]>;
    const totalsDay1 = dailyTotalsFor(1);
    const totalsDay2 = dailyTotalsFor(2);
    const expectedPct = ((totalsDay2.arrInr - totalsDay1.arrInr) / totalsDay1.arrInr) * 100;
    expect(day2.dodArrChangePctInr).toBeCloseTo(expectedPct);
  });

  it("has no day-over-day change for the very first day in the series", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], [], new Date("2026-01-08T12:00:00Z"));
    expect(result.series[0]?.dodArrChangePctInr).toBeNull();
  });

  it("blends the latest same-day intraday bucket into the live total, per gateway", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const intraday = parseIntradayRows([
      // Gateway A gets a fresher, higher intraday figure for the last day (2026-01-08).
      ["2026-01-08 09:00", "A", 1, 1, 10, 10, 15, 70, 1200, 14400, 13.3, 160],
      ["2026-01-08 10:00", "A", 1, 1, 10, 20, 16, 71, 1300, 15600, 14.4, 173.3],
    ]);
    const result = buildDashboardData(daily, intraday, [], new Date("2026-01-08T12:00:00Z"));

    const dailyBTotalsDay8 = 500 + 8 * 5; // gateway B keeps its Sheet 1 value (no intraday feed)
    const liveMrrInr = 1300 + dailyBTotalsDay8;
    const last = result.series[result.series.length - 1];
    expect(last?.date).toBe("2026-01-08");
    expect(last?.mrrInr).toBe(liveMrrInr);
    expect(result.freshness.lastUpdated).toBe("2026-01-08T10:00:00");
  });

  it("prefers Minute3Gateway's latest row over the Intraday10min blend when it's fresher", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const intraday = parseIntradayRows([
      ["2026-01-08 09:00", "A", 1, 1, 10, 10, 15, 70, 1200, 14400, 13.3, 160],
    ]);
    // Minute3Gateway is already combined across every gateway and one minute fresher.
    const minute = parseMinuteRows([
      ["2026-01-08 09:01", 1, 1, 10, 10, 31, 0, 0, 71, 2201, 26412, 24.5, 293.5],
    ]);
    const result = buildDashboardData(daily, intraday, minute, new Date("2026-01-08T12:00:00Z"));

    const last = result.series[result.series.length - 1];
    expect(last?.mrrInr).toBe(2201); // the combined minute row's own figure, not re-summed with anything else
    expect(result.freshness.lastUpdated).toBe("2026-01-08T09:01:00");
  });

  it("falls back to the Intraday10min blend when Minute3Gateway has no row for the latest date", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const intraday = parseIntradayRows([
      ["2026-01-08 09:00", "A", 1, 1, 10, 10, 15, 70, 1200, 14400, 13.3, 160],
    ]);
    const minute = parseMinuteRows([
      ["2026-01-07 09:01", 1, 1, 10, 10, 31, 0, 0, 71, 2201, 26412, 24.5, 293.5],
    ]);
    const result = buildDashboardData(daily, intraday, minute, new Date("2026-01-08T12:00:00Z"));

    const last = result.series[result.series.length - 1];
    expect(result.freshness.lastUpdated).toBe("2026-01-08T09:00:00");
    expect(last?.mrrInr).toBe(1200 + (500 + 8 * 5));
  });

  it("falls back to the daily rollup's last date when no intraday bucket exists", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], [], new Date("2026-01-08T12:00:00Z"));
    expect(result.freshness.lastUpdated).toBe("2026-01-08T00:00:00");
  });

  it("flags data as stale once it exceeds the configured threshold", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const freshNow = new Date("2026-01-08T12:00:00Z");
    const staleNow = new Date(`2026-01-${String(8 + STALE_THRESHOLD_DAYS + 1).padStart(2, "0")}T12:00:00Z`);

    const fresh = buildDashboardData(daily, [], [], freshNow);
    expect(fresh.freshness.isStale).toBe(false);

    const stale = buildDashboardData(daily, [], [], staleNow);
    expect(stale.freshness.isStale).toBe(true);
    expect(stale.freshness.staleDays).toBe(STALE_THRESHOLD_DAYS + 1);
  });

  it("returns AOV of 0 rather than dividing by zero when there are no active subscribers", () => {
    const daily = parseDailyRows([["2026-01-01", "Razorpay", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]);
    const result = buildDashboardData(daily, [], [], new Date("2026-01-01T12:00:00Z"));
    expect(result.series[0]?.aovInr).toBe(0);
    expect(result.series[0]?.aovUsd).toBe(0);
  });
});

describe("buildTimeOfDaySeries", () => {
  // Gateway A reports intraday; gateway B never does (mirrors Cashfree/Paytm in the real sheet)
  // and always falls back to its flat Sheet 1 daily total for every time-of-day slot.
  const daily = toPublicDailyRows(
    parseDailyRows([
      ["2026-02-01", "A", 0, 0, 0, 0, 0, 0, 0, 0, 1000, 0, 1000],
      ["2026-02-01", "B", 0, 0, 0, 0, 0, 0, 0, 0, 200, 0, 200],
    ]),
  );
  const intraday = toPublicIntradayRows(
    parseIntradayRows([
      ["2026-02-01 00:00", "A", 0, 0, 0, 0, 0, 0, 0, 0, 0, 100],
      ["2026-02-01 00:10", "A", 0, 0, 0, 0, 0, 0, 0, 0, 0, 110],
    ]),
  );

  it("returns all 144 ten-minute time-of-day slots", () => {
    const series = buildTimeOfDaySeries(daily, intraday, "2026-02-01");
    expect(series).toHaveLength(144);
    expect(series[0]?.timeOfDay).toBe("00:00");
    expect(series[1]?.timeOfDay).toBe("00:10");
    expect(series[143]?.timeOfDay).toBe("23:50");
  });

  it("blends the intraday gateway with the other gateway's flat daily total", () => {
    const series = buildTimeOfDaySeries(daily, intraday, "2026-02-01");
    expect(series[0]).toMatchObject({ timeOfDay: "00:00", arrUsd: 100 + 200 });
    expect(series[1]).toMatchObject({ timeOfDay: "00:10", arrUsd: 110 + 200 });
  });

  it("leaves slots null once past the latest bucket actually recorded", () => {
    const series = buildTimeOfDaySeries(daily, intraday, "2026-02-01");
    expect(series[2]?.arrUsd).toBeNull();
    expect(series[2]?.arrInr).toBeNull();
  });

  it("returns an all-null series for a date with no intraday coverage at all", () => {
    const series = buildTimeOfDaySeries(daily, intraday, "2026-03-01");
    expect(series.every((point) => point.arrUsd === null && point.arrInr === null)).toBe(true);
  });
});
