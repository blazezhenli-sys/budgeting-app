import { addMonths, endOfMonth, format, parse, startOfMonth } from "date-fns";

import type { MonthKey } from "@/lib/types";

export function currentMonthKey(now = new Date()): MonthKey {
  return format(now, "yyyy-MM") as MonthKey;
}

export function isMonthKey(value: string): value is MonthKey {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthBounds(month: MonthKey): { start: Date; end: Date } {
  const parsed = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  return { start: startOfMonth(parsed), end: endOfMonth(parsed) };
}

export function previousMonth(month: MonthKey): MonthKey {
  const parsed = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  return format(addMonths(parsed, -1), "yyyy-MM") as MonthKey;
}

export function compareMonthKey(a: MonthKey, b: MonthKey): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
