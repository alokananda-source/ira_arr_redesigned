import { describe, expect, it } from "vitest";

import { formatCurrencyAbbreviated, formatCurrencyFull, formatDate, formatPercent } from "@/lib/format";

describe("formatCurrencyAbbreviated", () => {
  it("formats INR in crores above 1,00,00,000", () => {
    expect(formatCurrencyAbbreviated(19_48_23_456, "INR")).toBe("₹19.48 Cr");
  });

  it("formats INR in lakhs between 1,00,000 and 1,00,00,000", () => {
    expect(formatCurrencyAbbreviated(4_50_000, "INR")).toBe("₹4.50 L");
  });

  it("formats small INR values with plain grouping", () => {
    expect(formatCurrencyAbbreviated(1234, "INR")).toBe("₹1,234");
  });

  it("formats USD in millions", () => {
    expect(formatCurrencyAbbreviated(2_500_000, "USD")).toBe("$2.50M");
  });

  it("formats USD in thousands", () => {
    expect(formatCurrencyAbbreviated(4500, "USD")).toBe("$4.50K");
  });

  it("formats small USD values plainly", () => {
    expect(formatCurrencyAbbreviated(42, "USD")).toBe("$42");
  });
});

describe("formatCurrencyFull", () => {
  it("uses Indian digit grouping for INR", () => {
    expect(formatCurrencyFull(12345678, "INR")).toBe("₹1,23,45,678");
  });

  it("uses standard grouping for USD", () => {
    expect(formatCurrencyFull(1234567, "USD")).toBe("$1,234,567");
  });

  it("keeps decimal precision for small values instead of rounding to a whole unit", () => {
    expect(formatCurrencyFull(5.75, "USD")).toBe("$5.75");
    expect(formatCurrencyFull(545.41, "INR")).toBe("₹545.41");
  });

  it("still shows whole units once a small value's rounded delta would be trivial", () => {
    expect(formatCurrencyFull(545, "INR")).toBe("₹545");
  });
});

describe("formatPercent", () => {
  it("renders one decimal place with a leading + for positive values", () => {
    expect(formatPercent(12.345)).toBe("+12.3%");
  });

  it("renders negative values without a forced sign", () => {
    expect(formatPercent(-5.06)).toBe("-5.1%");
  });

  it("renders an em dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as 'D MMM YYYY'", () => {
    expect(formatDate("2026-09-03")).toBe("3 Sep 2026");
  });
});
