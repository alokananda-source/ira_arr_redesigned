/** Pure date helpers operating on YYYY-MM-DD calendar strings (no timezone ambiguity). */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function isValidIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

/** Extracts the YYYY-MM-DD portion from a date or datetime string ("2026-09-03 17:30" -> "2026-09-03"). */
export function toDateOnly(value: string): string | null {
  const match = ISO_DATE_RE.exec(value.trim());
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function toUtcMidnight(dateOnly: string): Date {
  const parts = dateOnly.split("-").map(Number);
  const [y, m, d] = parts;
  if (parts.length !== 3 || y === undefined || m === undefined || d === undefined) {
    throw new Error(`Invalid YYYY-MM-DD date: "${dateOnly}"`);
  }
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDaysIso(dateOnly: string, days: number): string {
  const date = toUtcMidnight(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** a - b, in whole calendar days. */
export function diffInCalendarDays(aDateOnly: string, bDateOnly: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toUtcMidnight(aDateOnly).getTime() - toUtcMidnight(bDateOnly).getTime()) / msPerDay);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
