import { describe, expect, it } from "vitest";

import { addDaysIso, diffInCalendarDays, toDateOnly } from "@/lib/dateUtils";

describe("toDateOnly", () => {
  it("extracts the date portion from a plain date", () => {
    expect(toDateOnly("2026-09-03")).toBe("2026-09-03");
  });

  it("extracts the date portion from a datetime string", () => {
    expect(toDateOnly("2026-09-03 17:30")).toBe("2026-09-03");
  });

  it("returns null for invalid input", () => {
    expect(toDateOnly("not a date")).toBeNull();
    expect(toDateOnly("")).toBeNull();
  });
});

describe("addDaysIso", () => {
  it("adds days within a month", () => {
    expect(addDaysIso("2026-09-01", 2)).toBe("2026-09-03");
  });

  it("subtracts days across a month boundary", () => {
    expect(addDaysIso("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("handles year boundaries", () => {
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("diffInCalendarDays", () => {
  it("returns 0 for the same date", () => {
    expect(diffInCalendarDays("2026-09-03", "2026-09-03")).toBe(0);
  });

  it("returns a positive number when a is after b", () => {
    expect(diffInCalendarDays("2026-09-05", "2026-09-03")).toBe(2);
  });

  it("returns a negative number when a is before b", () => {
    expect(diffInCalendarDays("2026-09-01", "2026-09-03")).toBe(-2);
  });
});
