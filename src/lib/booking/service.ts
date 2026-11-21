import "server-only";
import { checkStay, nightsFromRanges, type StayInput, type StayProblem } from "./availability";
import type { BookingConfig } from "./config-schema";
import { loadBookingConfig } from "./config";
import { addDays, addMonths, todayIn, type ISODate } from "./dates";
import { quoteStay, withCustomTotal, type Quote } from "./pricing";
import { calendarWindow, getBookingStore, StoreUnavailableError, type BookingStore, type GuestDetails, type Reservation } from "./store";
import { hashToken, newRef, newToken } from "./tokens";

export type CalendarData = { today: ISODate; until: ISODate; unavailable: ISODate[]; config: BookingConfig };

/** Everything the availability calendar needs (sent to the browser). */
export async function getCalendarData(): Promise<CalendarData> {
  const config = await loadBookingConfig();
  const today = todayIn(config.timeZone);
  const [from, to] = calendarWindow(today, config.maxAdvanceMonths);
  const ranges = await getBookingStore().blockedRanges(from, to);
  const unavailable = [...nightsFromRanges(ranges)].filter((n) => n >= from && n < to).sort();
  return { today, until: addMonths(today, config.maxAdvanceMonths), unavailable, config };
}

export type HoldResult =
  | { ok: true; ref: string; token: string; quote: Quote; expiresAt: string }
  | { ok: false; problem: StayProblem | { code: "unavailable"; date?: ISODate } | { code: "storeUnavailable" } };

/** Re-validate against fresh availability, price on the server, then hold the dates. */
export async function holdStay(stay: StayInput, locale: "en" | "el"): Promise<HoldResult> {
  const config = await loadBookingConfig();
  const today = todayIn(config.timeZone);
  let store;
  try {
    store = getBookingStore();
  } catch (e) {
    if (e instanceof StoreUnavailableError) return { ok: false, problem: { code: "storeUnavailable" } };
    throw e;
  }
  const ranges = await store.blockedRanges(stay.checkIn, stay.checkOut);
  const problem = checkStay(config, nightsFromRanges(ranges), stay, today);
  if (problem) return { ok: false, problem };

  const quote = quoteStay(config, stay, today);
  const token = newToken();
  // a reference collision is astronomically unlikely, but retry once rather than fail
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await store.createHold({
        ref: newRef(),
        tokenHash: hashToken(token),
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        guests: stay.guests,
        locale,
        quote,
        holdMinutes: config.holdMinutes,
      });
      if (!r) return { ok: false, problem: { code: "unavailable" } };
      return { ok: true, ref: r.ref, token, quote, expiresAt: r.expiresAt! };
    } catch (e) {
      if (attempt === 1 || !String(e).includes("reservations_ref_key")) throw e;
    }
  }
  throw new Error("unreachable");
}

/** Rules the owner may override for a booking they arrange themselves; availability and closed dates are never overridden. */
export const OWNER_OVERRIDABLE: ReadonlySet<StayProblem["code"]> = new Set(["minNights", "checkInDay", "tooSoon", "tooFar", "maxNights"]);

export type OwnerBookingInput = StayInput & {
  locale: "en" | "el";
  guest: GuestDetails;
  /** how long the guest has to pay */
  holdHours: number;
  /** agreed total in cents (otherwise the calculated price) */
  customTotalCents?: number;
};

/**
 * A booking arranged by the owner (phone, email, early-booking request): the dates are held for the
 * guest for `holdHours`, with their details filled in, until they pay through the link (or the owner
 * records a bank transfer). Pure of side effects other than the store, so it is unit-tested.
 */
export async function createOwnerBooking(
  store: BookingStore,
  config: BookingConfig,
  input: OwnerBookingInput,
  today: ISODate,
): Promise<{ ok: true; reservation: Reservation } | { ok: false; problem: StayProblem }> {
  const stay = { checkIn: input.checkIn, checkOut: input.checkOut, guests: input.guests };
  const ranges = await store.blockedRanges(stay.checkIn, stay.checkOut);
  const problem = checkStay(config, nightsFromRanges(ranges), stay, today);
  if (problem && !OWNER_OVERRIDABLE.has(problem.code)) return { ok: false, problem };
  // overridden rules may hide a taken night behind them: check availability on its own
  if (problem) {
    const taken = nightsFromRanges(ranges);
    for (let d = stay.checkIn; d < stay.checkOut; d = addDays(d, 1)) if (taken.has(d)) return { ok: false, problem: { code: "unavailable", date: d } };
  }

  let quote = quoteStay(config, stay, today);
  if (input.customTotalCents !== undefined) quote = withCustomTotal(config, quote, input.customTotalCents, today);
  const holdMinutes = Math.round(Math.min(Math.max(input.holdHours, 1), 24 * 14) * 60);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await store.createHold({
        ref: newRef(),
        tokenHash: hashToken(newToken()), // the guest uses the HMAC link from the email
        ...stay,
        locale: input.locale,
        quote,
        holdMinutes,
      });
      if (!r) return { ok: false, problem: { code: "unavailable", date: stay.checkIn } };
      const withGuest = await store.saveGuest(r.id, input.guest, 0);
      return { ok: true, reservation: withGuest ?? r };
    } catch (e) {
      if (attempt === 1 || !String(e).includes("reservations_ref_key")) throw e;
    }
  }
  throw new Error("unreachable");
}
