import type { BookingConfig } from "./config-schema";
import { addDays, addMonths, diffDays, isISODate, nightsOf, weekday, type ISODate } from "./dates";
import { seasonFor } from "./pricing";

export type StayInput = { checkIn: ISODate; checkOut: ISODate; guests: number };

export type StayProblem =
  | { code: "invalid" }
  | { code: "guests"; max: number }
  | { code: "tooSoon"; minAdvanceDays: number }
  | { code: "tooFar"; maxAdvanceMonths: number }
  | { code: "closed"; date: ISODate }
  | { code: "minNights"; minNights: number }
  | { code: "maxNights"; maxNights: number }
  | { code: "checkInDay"; days: number[] }
  | { code: "unavailable"; date: ISODate };

/** Nights (YYYY-MM-DD) already taken: confirmed bookings, active holds, manual blocks, external calendars. */
export type Unavailable = ReadonlySet<ISODate>;

/** Expand [start, end) ranges into a set of blocked nights. */
export function nightsFromRanges(ranges: { start: ISODate; end: ISODate }[]): Set<ISODate> {
  const set = new Set<ISODate>();
  for (const r of ranges) for (const n of nightsOf(r.start, r.end)) set.add(n);
  return set;
}

/** Is this date a possible arrival day (rules only, ignoring availability)? */
export function canCheckInOn(config: BookingConfig, date: ISODate): boolean {
  const season = seasonFor(config, date);
  if (!season) return !config.closedOutsideSeasons;
  return !season.checkInDays || season.checkInDays.includes(weekday(date));
}

/** Minimum nights for a stay starting on `checkIn` (the arrival night's season decides). */
export function minNightsFor(config: BookingConfig, checkIn: ISODate): number {
  return seasonFor(config, checkIn)?.minNights ?? 1;
}

/**
 * Validates a requested stay against the rules and current availability.
 * `today` must be the property's local date (see todayIn).
 */
export function checkStay(config: BookingConfig, unavailable: Unavailable, stay: StayInput, today: ISODate): StayProblem | null {
  const { checkIn, checkOut, guests } = stay;
  if (!isISODate(checkIn) || !isISODate(checkOut) || diffDays(checkIn, checkOut) < 1) return { code: "invalid" };
  if (!Number.isInteger(guests) || guests < 1 || guests > config.maxGuests) return { code: "guests", max: config.maxGuests };
  if (diffDays(today, checkIn) < config.minAdvanceDays) return { code: "tooSoon", minAdvanceDays: config.minAdvanceDays };
  if (checkOut > addMonths(today, config.maxAdvanceMonths)) return { code: "tooFar", maxAdvanceMonths: config.maxAdvanceMonths };

  const nights = nightsOf(checkIn, checkOut);
  for (const n of nights) {
    if (!seasonFor(config, n) && config.closedOutsideSeasons) return { code: "closed", date: n };
  }
  const season = seasonFor(config, checkIn);
  if (season?.checkInDays && !season.checkInDays.includes(weekday(checkIn))) return { code: "checkInDay", days: season.checkInDays };
  const min = minNightsFor(config, checkIn);
  if (nights.length < min) return { code: "minNights", minNights: min };
  if (nights.length > config.maxNights) return { code: "maxNights", maxNights: config.maxNights };
  for (const n of nights) if (unavailable.has(n)) return { code: "unavailable", date: n };
  return null;
}

/**
 * For the calendar: the latest possible check-out after `checkIn`, i.e. the first
 * blocked or closed night ends the run. Used to grey out impossible departure dates.
 */
export function lastPossibleCheckOut(config: BookingConfig, unavailable: Unavailable, checkIn: ISODate): ISODate {
  let d = checkIn;
  for (let i = 0; i < config.maxNights; i++) {
    if (unavailable.has(d)) break;
    if (!seasonFor(config, d) && config.closedOutsideSeasons) break;
    d = addDays(d, 1);
  }
  return d;
}
