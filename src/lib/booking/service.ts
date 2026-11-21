import "server-only";
import { checkStay, nightsFromRanges, type StayInput, type StayProblem } from "./availability";
import type { BookingConfig } from "./config-schema";
import { loadBookingConfig } from "./config";
import { addMonths, todayIn, type ISODate } from "./dates";
import { quoteStay, type Quote } from "./pricing";
import { calendarWindow, getBookingStore, StoreUnavailableError } from "./store";
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

  const quote = quoteStay(config, stay);
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
