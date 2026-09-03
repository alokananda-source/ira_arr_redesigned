import type { Currency } from "./types";

const CRORE = 1_00_00_000;
const LAKH = 1_00_000;

const inrFullFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const usdFullFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
// Sub-lakh/sub-thousand values (e.g. AOV, or its day-over-day change) can be well under 1 unit —
// round-to-0 would otherwise hide a genuine change like "+₹0.30" behind "+₹0".
const inrSmallFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const usdSmallFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Abbreviated headline figure: lakh/crore grouping for INR, K/M for USD. */
export function formatCurrencyAbbreviated(value: number, currency: Currency): string {
  if (currency === "INR") {
    const abs = Math.abs(value);
    if (abs >= CRORE) return `₹${(value / CRORE).toFixed(2)} Cr`;
    if (abs >= LAKH) return `₹${(value / LAKH).toFixed(2)} L`;
    return `₹${inrSmallFormatter.format(value)}`;
  }
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${usdSmallFormatter.format(value)}`;
}

/** Below this, whole-unit rounding loses too much (e.g. AOV of $5.75 rounding to "$6"). */
const SMALL_VALUE_THRESHOLD = 1000;

/** Full-precision figure (used in the day-wise table) with locale-appropriate grouping. */
export function formatCurrencyFull(value: number, currency: Currency): string {
  const useSmallFormatter = Math.abs(value) < SMALL_VALUE_THRESHOLD;
  if (currency === "INR") return `₹${(useSmallFormatter ? inrSmallFormatter : inrFullFormatter).format(value)}`;
  return `$${(useSmallFormatter ? usdSmallFormatter : usdFullFormatter).format(value)}`;
}

export function formatPercent(value: number | null, options: { signDisplay?: boolean } = {}): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = options.signDisplay !== false && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// Fixed abbreviations rather than Intl.DateTimeFormat: ICU's "short month" data varies by
// Node/ICU version (e.g. "Sept" vs "Sep"), which would make this format inconsistent across
// deploy environments.
const MONTH_ABBREVIATIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function formatDate(isoDate: string): string {
  const dateOnly = isoDate.slice(0, 10);
  const [y, m, d] = dateOnly.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return isoDate;
  return `${d} ${MONTH_ABBREVIATIONS[m - 1]} ${y}`;
}

export function formatDateTime(isoDateTime: string): string {
  const hasTime = isoDateTime.length > 10;
  const datePart = formatDate(isoDateTime);
  if (!hasTime) return datePart;
  const timePart = isoDateTime.slice(11, 16);
  return timePart ? `${datePart}, ${timePart}` : datePart;
}
