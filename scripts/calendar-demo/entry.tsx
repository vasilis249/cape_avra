/**
 * Interactive calendar demo for the static preview (GitHub Pages).
 * Runs the real BookingWidget + real pricing/availability rules in the browser,
 * with sample booked dates and no server.
 */
import { createRoot } from "react-dom/client";
import { BookingWidget } from "@/components/booking/BookingWidget";
import type { BookingLabels } from "@/components/booking/labels";
import { todayIn, addMonths } from "@/lib/booking/dates";
import { nightsFromRanges } from "@/lib/booking/availability";
import { bookingSeed } from "@content/booking";
import el from "@content/messages/el.json";
import en from "@content/messages/en.json";

const DEMO_NOTE = {
  en: "This is a demo of the calendar with sample bookings. On the live site you would now continue to the secure checkout.",
  el: "Αυτή είναι επίδειξη του ημερολογίου με δείγμα κρατήσεων. Στον κανονικό ιστότοπο θα συνεχίζατε τώρα στην ασφαλή πληρωμή.",
};

function labelsFor(locale: "en" | "el"): BookingLabels {
  const m = locale === "el" ? el : en;
  const b = m.booking;
  return {
    summary: {
      nights: b.summary.nights,
      nightOne: b.nightOne,
      nightOther: b.nightOther,
      extraGuests: b.summary.extraGuests,
      cleaning: b.summary.cleaning,
      discount: b.summary.discount,
      total: b.summary.total,
      deposit: b.summary.deposit,
      full: b.summary.full,
      balance: b.summary.balance,
      onArrival: b.summary.onArrival,
    },
    calendarLabel: b.calendarLabel,
    selectArrival: b.selectArrival,
    selectDeparture: b.selectDeparture,
    prevMonth: b.prevMonth,
    nextMonth: b.nextMonth,
    clear: b.clear,
    guests: b.guests,
    arrival: b.arrival,
    departure: b.departure,
    nightOne: b.nightOne,
    nightOther: b.nightOther,
    legendAvailable: b.legendAvailable,
    legendBooked: b.legendBooked,
    legendNoArrival: b.legendNoArrival,
    dayAvailable: b.dayAvailable,
    dayBooked: b.dayBooked,
    dayNoArrival: b.dayNoArrival,
    dayUnavailable: b.dayUnavailable,
    daySelected: b.daySelected,
    loading: b.loading,
    loadError: b.loadError,
    minNightsHint: b.minNightsHint,
    checkInDaysHint: b.checkInDaysHint,
    problems: { ...b.problems, demo: DEMO_NOTE[locale] },
    summaryTitle: b.summary.title,
    note: b.summary.note,
    continue: b.summary.continue,
    holding: b.summary.holding,
    rate: m.form.errors.rate,
  };
}

// sample availability: a direct booking, an Airbnb booking and a Booking.com booking
const today = todayIn(bookingSeed.timeZone);
const sample = [...nightsFromRanges([
  { start: "2027-06-26", end: "2027-07-03" },
  { start: "2027-07-17", end: "2027-07-24" },
  { start: "2027-08-07", end: "2027-08-21" },
])].sort();
const data = { today, until: addMonths(today, bookingSeed.maxAdvanceMonths), unavailable: sample, config: bookingSeed };

// the widget fetches /api/booking/calendar: answer it from the sample above
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
  String(input).includes("/api/booking/calendar")
    ? Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }))
    : realFetch(input, init);

const root = document.getElementById("demo")!;
const locale = (document.documentElement.lang === "el" ? "el" : "en") as "en" | "el";
createRoot(root).render(<BookingWidget locale={locale} labels={labelsFor(locale)} />);
