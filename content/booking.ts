/**
 * Booking rules and prices (seed). Every amount here is an EXAMPLE until the
 * owner sets real prices: TODO(owner). From Phase 5 these are edited in the
 * admin panel; this file stays as the default/fallback.
 *
 * Money in EUR (whole euros). Dates are recurring MM-DD ranges, inclusive.
 */
import { bookingConfigSchema, type BookingConfig } from "../src/lib/booking/config-schema";

const seed: BookingConfig = {
  currency: "EUR",
  timeZone: "Europe/Athens",
  weekendNights: [5, 6], // Friday and Saturday nights
  seasons: [
    { id: "spring", name: { en: "Spring", el: "Άνοιξη" }, from: "04-15", to: "06-14", nightly: 260, weekend: 300, minNights: 3 },
    { id: "early-summer", name: { en: "Early summer", el: "Αρχές καλοκαιριού" }, from: "06-15", to: "07-09", nightly: 380, weekend: 420, minNights: 5 },
    // high season: Saturday to Saturday, a week minimum
    { id: "high", name: { en: "High summer", el: "Καρδιά του καλοκαιριού" }, from: "07-10", to: "08-31", nightly: 520, minNights: 7, checkInDays: [6] },
    { id: "september", name: { en: "September", el: "Σεπτέμβριος" }, from: "09-01", to: "09-30", nightly: 360, weekend: 400, minNights: 4 },
    { id: "autumn", name: { en: "Autumn", el: "Φθινόπωρο" }, from: "10-01", to: "10-31", nightly: 240, weekend: 280, minNights: 3 },
  ],
  closedOutsideSeasons: true,
  baseGuests: 6,
  maxGuests: 8,
  extraGuestPerNight: 30,
  cleaningFee: 150,
  longStayDiscounts: [
    { minNights: 14, percent: 10 },
    { minNights: 10, percent: 5 },
  ],
  lineItems: [
    // Greek "climate resilience fee" per night: amounts change by law, keep them here. TODO(owner): verify current rates
    {
      id: "climate-fee-high",
      label: { en: "Climate resilience fee (Greek state)", el: "Τέλος ανθεκτικότητας στην κλιματική κρίση" },
      type: "perNight",
      amount: 8,
      months: [4, 5, 6, 7, 8, 9, 10],
      includedInTotal: true,
    },
    {
      id: "climate-fee-low",
      label: { en: "Climate resilience fee (Greek state)", el: "Τέλος ανθεκτικότητας στην κλιματική κρίση" },
      type: "perNight",
      amount: 2,
      months: [1, 2, 3, 11, 12],
      includedInTotal: true,
    },
  ],
  minAdvanceDays: 2,
  maxAdvanceMonths: 18,
  maxNights: 28,
  holdMinutes: 15,
  payment: { mode: "deposit", depositPercent: 30, balanceDaysBeforeArrival: 30, securityDeposit: 500, securityDepositReleaseDays: 2 },
  cancellation: [
    { daysBefore: 60, refundPercent: 100 },
    { daysBefore: 30, refundPercent: 50 },
    { daysBefore: 0, refundPercent: 0 },
  ],
  emails: { preArrivalDaysBefore: 7, reviewDaysAfter: 1 },
};

export const bookingSeed: BookingConfig = bookingConfigSchema.parse(seed);
