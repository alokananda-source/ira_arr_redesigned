import { describe, expect, it } from "vitest";

import { computeFocusStat } from "@/lib/statUtils";
import type { DayMetrics } from "@/lib/types";

function day(date: string, arrInr: number): DayMetrics {
  return {
    date,
    arrInr,
    mrrInr: arrInr / 12,
    arrUsd: arrInr / 90,
    mrrUsd: arrInr / 12 / 90,
    activeSubscribers: 10,
    aovInr: 0,
    aovUsd: 0,
    dodArrChangePctInr: null,
    dodArrChangePctUsd: null,
  };
}

// 8 days, 2026-01-01..2026-01-08, ARR growing by 1200/day for easy math.
const series: DayMetrics[] = Array.from({ length: 8 }, (_, i) =>
  day(`2026-01-${String(i + 1).padStart(2, "0")}`, 12000 + i * 1200),
);

describe("computeFocusStat", () => {
  it("returns null when the focused date isn't in the series", () => {
    expect(computeFocusStat(series, "2026-05-01", "INR")).toBeNull();
  });

  it("uses the focused date's own ARR as current, in the selected currency", () => {
    const stat = computeFocusStat(series, "2026-01-05", "INR");
    expect(stat?.current).toBe(12000 + 4 * 1200);

    const statUsd = computeFocusStat(series, "2026-01-05", "USD");
    expect(statUsd?.current).toBeCloseTo((12000 + 4 * 1200) / 90);
  });

  it("computes day-over-day change against the previous calendar day", () => {
    const stat = computeFocusStat(series, "2026-01-05", "INR");
    expect(stat?.dayChange?.absolute).toBe(1200);
    expect(stat?.dayChange?.percent).toBeCloseTo((1200 / (12000 + 3 * 1200)) * 100);
  });

  it("returns the previous day's own date and ARR value alongside the delta", () => {
    const stat = computeFocusStat(series, "2026-01-05", "INR");
    expect(stat?.previousDay).toEqual({ date: "2026-01-04", value: 12000 + 3 * 1200 });
  });

  it("returns a null dayChange and previousDay for the first date in the series", () => {
    const stat = computeFocusStat(series, "2026-01-01", "INR");
    expect(stat?.dayChange).toBeNull();
    expect(stat?.previousDay).toBeNull();
  });

  it("compares against the average of up to the trailing 7 days including the focused date", () => {
    // Day 8 (2026-01-08): trailing 7 days available are days 2..8 (7 values).
    const stat = computeFocusStat(series, "2026-01-08", "INR");
    const trailing = [2, 3, 4, 5, 6, 7, 8].map((d) => 12000 + (d - 1) * 1200);
    const avg = trailing.reduce((a, b) => a + b, 0) / trailing.length;
    const current = 12000 + 7 * 1200;
    expect(stat?.sevenDayAvgChange?.absolute).toBeCloseTo(current - avg);
    expect(stat?.sevenDayAvg).toBeCloseTo(avg);
  });

  it("averages over fewer than 7 days when less history exists", () => {
    // Day 3 (2026-01-03): only days 1..3 exist.
    const stat = computeFocusStat(series, "2026-01-03", "INR");
    const trailing = [1, 2, 3].map((d) => 12000 + (d - 1) * 1200);
    const avg = trailing.reduce((a, b) => a + b, 0) / trailing.length;
    const current = 12000 + 2 * 1200;
    expect(stat?.sevenDayAvgChange?.absolute).toBeCloseTo(current - avg);
    expect(stat?.sevenDayAvg).toBeCloseTo(avg);
  });
});
