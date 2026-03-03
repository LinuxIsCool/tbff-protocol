/**
 * Month key utilities for the monthly convergence model.
 * Month keys are ISO-style strings: "2026-01", "2026-02", etc.
 */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Parse "2026-01" → { year: 2026, month: 1 } */
function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

/** Generate all month keys from start (inclusive) to end (exclusive). */
export function generateMonthKeys(start: string, end: string): string[] {
  const s = parseMonthKey(start);
  const e = parseMonthKey(end);
  const keys: string[] = [];

  let year = s.year;
  let month = s.month;

  while (year < e.year || (year === e.year && month < e.month)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return keys;
}

/** "2026-01" → "Jan 2026" */
export function monthLabel(key: string): string {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Find index of a month key within a generated range. */
export function monthKeyToIndex(key: string, startMonth: string): number {
  const s = parseMonthKey(startMonth);
  const k = parseMonthKey(key);
  return (k.year - s.year) * 12 + (k.month - s.month);
}
