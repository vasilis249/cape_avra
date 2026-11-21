/**
 * Calendar-date helpers on ISO strings (YYYY-MM-DD), computed in UTC so that
 * time zones and daylight saving never shift a night. Isomorphic (client + server).
 */
export type ISODate = string;

const toUTC = (d: ISODate) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUTC = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);

export const isISODate = (s: unknown): s is ISODate =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;

export const addDays = (d: ISODate, n: number): ISODate => fromUTC(toUTC(d) + n * 86_400_000);
export const diffDays = (from: ISODate, to: ISODate): number => Math.round((toUTC(to) - toUTC(from)) / 86_400_000);
/** 0 = Sunday … 6 = Saturday */
export const weekday = (d: ISODate): number => new Date(toUTC(d)).getUTCDay();
export const month = (d: ISODate): number => Number(d.slice(5, 7));
export const mmdd = (d: ISODate): string => d.slice(5);

export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUTC(target.getTime());
}

/** Nights of a stay: every date from check-in up to (not including) check-out. */
export function nightsOf(checkIn: ISODate, checkOut: ISODate): ISODate[] {
  const n = diffDays(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i));
}

/** "Today" as a calendar date in a given time zone (the property's, not the visitor's). */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Does MM-DD `d` fall in the inclusive recurring range [from, to] (which may wrap the year)? */
export function inRecurringRange(d: ISODate, from: string, to: string): boolean {
  const x = mmdd(d);
  return from <= to ? x >= from && x <= to : x >= from || x <= to;
}
