import { describe, expect, it } from "vitest";

import { buildDashboardData, parseDailyRows, parseMinuteRows } from "@/lib/sheetsTransform";
import { STALE_THRESHOLD_DAYS } from "@/lib/constants";

/** Builds 8 days (01/01/2026..08/01/2026, DD/MM/YYYY as the sheet writes it) of daily rows.
 * MRR grows linearly per day so day-over-day math is easy to predict. */
function buildDailyFixture(): unknown[][] {
  const rows: unknown[][] = [];
  for (let day = 1; day <= 8; day++) {
    const date = `${String(day).padStart(2, "0")}/01/2026`;
    const mrr = 1500 + day * 15;
    const subs = 20;
    rows.push([date, subs, mrr / subs, mrr, mrr * 12, (mrr * 12) / 94.54]);
  }
  return rows;
}

function totalsFor(day: number) {
  const mrrInr = 1500 + day * 15;
  return { mrrInr, arrInr: mrrInr * 12, subs: 20 };
}

describe("parseDailyRows", () => {
  it("parses well-formed DD/MM/YYYY rows into ISO dates", () => {
    const rows = parseDailyRows([["01/09/2026", 5, 200, 1000, 12000, 126.94]]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: "2026-09-01", activeSubscribers: 5, aovInr: 200, mrrInr: 1000, arrInr: 12000 });
  });

  it("skips rows with an unparseable date", () => {
    const rows = parseDailyRows([["not a date", 5, 200, 1000, 12000, 126.94]]);
    expect(rows).toHaveLength(0);
  });

  it("accepts ISO dates as a fallback", () => {
    const rows = parseDailyRows([["2026-09-01", 5, 200, 1000, 12000, 126.94]]);
    expect(rows[0]?.date).toBe("2026-09-01");
  });

  it("coerces comma-grouped numeric strings", () => {
    const rows = parseDailyRows([["01/09/2026", "1,234", "5.5", "1,234.56", "14,814.72", "156.7"]]);
    expect(rows[0]?.mrrInr).toBeCloseTo(1234.56);
    expect(rows[0]?.arrInr).toBeCloseTo(14814.72);
  });
});

describe("parseMinuteRows", () => {
  it("extracts date + normalized timestamp from a 'DD/MM/YYYY HH:mm' row", () => {
    const rows = parseMinuteRows([["09/09/2026 14:36", 28130, 806.21, 22685345, 272224140, 2879460]]);
    expect(rows[0]).toMatchObject({
      date: "2026-09-09",
      timestamp: "2026-09-09 14:36",
      activeSubscribers: 28130,
      arrInr: 272224140,
    });
  });

  it("skips rows with an unparseable timestamp", () => {
    const rows = parseMinuteRows([["garbage", 1, 1, 1, 1, 1]]);
    expect(rows).toHaveLength(0);
  });
});

describe("buildDashboardData", () => {
  it("returns an empty, non-stale result for an empty sheet", () => {
    const result = buildDashboardData([], [], new Date("2026-01-08T12:00:00Z"));
    expect(result.series).toHaveLength(0);
    expect(result.freshness.staleDays).toBe(0);
    expect(result.freshness.isStale).toBe(false);
  });

  it("passes daily rows through with derived USD figures", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], new Date("2026-01-08T12:00:00Z"));

    expect(result.series).toHaveLength(8);
    const day3 = result.series[2] as NonNullable<(typeof result.series)[number]>;
    const expected = totalsFor(3);
    expect(day3.mrrInr).toBe(expected.mrrInr);
    expect(day3.arrInr).toBe(expected.arrInr);
    expect(day3.activeSubscribers).toBe(expected.subs);
    expect(day3.mrrUsd).toBeCloseTo(day3.arrUsd / 12);
    expect(day3.aovUsd).toBeCloseTo(day3.mrrUsd / expected.subs);
  });

  it("computes day-over-day ARR % change against the previous calendar day", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], new Date("2026-01-08T12:00:00Z"));

    const day2 = result.series[1] as NonNullable<(typeof result.series)[number]>;
    const totalsDay1 = totalsFor(1);
    const totalsDay2 = totalsFor(2);
    const expectedPct = ((totalsDay2.arrInr - totalsDay1.arrInr) / totalsDay1.arrInr) * 100;
    expect(day2.dodArrChangePctInr).toBeCloseTo(expectedPct);
  });

  it("has no day-over-day change for the very first day in the series", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const result = buildDashboardData(daily, [], new Date("2026-01-08T12:00:00Z"));
    expect(result.series[0]?.dodArrChangePctInr).toBeNull();
  });

  it("prefers the latest same-day 'ARR Minute wise' row over the flat daily total", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const minute = parseMinuteRows([
      ["08/01/2026 09:00", 21, 100, 2100, 25200, 266.6],
      ["08/01/2026 09:01", 22, 105, 2310, 27720, 293.2],
    ]);
    const result = buildDashboardData(daily, minute, new Date("2026-01-08T12:00:00Z"));

    const last = result.series[result.series.length - 1];
    expect(last?.date).toBe("2026-01-08");
    expect(last?.mrrInr).toBe(2310); // the freshest minute row, not the flat daily figure
    expect(result.freshness.lastUpdated).toBe("2026-01-08T09:01:00");
  });

  it("falls back to the daily row when there's no same-day minute row", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const minute = parseMinuteRows([["07/01/2026 09:01", 1, 1, 100, 1200, 12.7]]);
    const result = buildDashboardData(daily, minute, new Date("2026-01-08T12:00:00Z"));

    const last = result.series[result.series.length - 1];
    expect(last?.mrrInr).toBe(totalsFor(8).mrrInr);
    expect(result.freshness.lastUpdated).toBe("2026-01-08T00:00:00");
  });

  it("flags data as stale once it exceeds the configured threshold", () => {
    const daily = parseDailyRows(buildDailyFixture());
    const freshNow = new Date("2026-01-08T12:00:00Z");
    const staleNow = new Date(`2026-01-${String(8 + STALE_THRESHOLD_DAYS + 1).padStart(2, "0")}T12:00:00Z`);

    const fresh = buildDashboardData(daily, [], freshNow);
    expect(fresh.freshness.isStale).toBe(false);

    const stale = buildDashboardData(daily, [], staleNow);
    expect(stale.freshness.isStale).toBe(true);
    expect(stale.freshness.staleDays).toBe(STALE_THRESHOLD_DAYS + 1);
  });

  it("returns AOV of 0 rather than dividing by zero when there are no active subscribers", () => {
    const daily = parseDailyRows([["01/01/2026", 0, 0, 0, 0, 0]]);
    const result = buildDashboardData(daily, [], new Date("2026-01-01T12:00:00Z"));
    expect(result.series[0]?.aovInr).toBe(0);
    expect(result.series[0]?.aovUsd).toBe(0);
  });
});
