import { describe, expect, it } from "vitest";
import { bookingSeed } from "@content/booking";
import { canCheckInOn, checkStay, lastPossibleCheckOut, nightsFromRanges } from "./availability";
import { bookingConfigSchema, type BookingConfig } from "./config-schema";
import { addDays, addMonths, diffDays, inRecurringRange, nightsOf, todayIn, weekday } from "./dates";
import { buildICal, parseICal } from "./ical";
import { quoteStay, refundFor } from "./pricing";

/** Fixed test config: independent of the real (owner-editable) prices. */
const config: BookingConfig = bookingConfigSchema.parse({
  currency: "EUR",
  timeZone: "Europe/Athens",
  weekendNights: [5, 6],
  seasons: [
    { id: "early", name: { en: "Early", el: "Αρχές" }, from: "06-15", to: "07-09", nightly: 380, weekend: 420, minNights: 5 },
    { id: "high", name: { en: "High", el: "Υψηλή" }, from: "07-10", to: "08-31", nightly: 520, minNights: 7, checkInDays: [6] },
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
  lineItems: [{ id: "climate", label: { en: "Climate fee", el: "Τέλος" }, type: "perNight", amount: 8, months: [4, 5, 6, 7, 8, 9, 10] }],
  minAdvanceDays: 2,
  maxAdvanceMonths: 18,
  maxNights: 28,
  holdMinutes: 15,
  payment: { mode: "deposit", depositPercent: 30, balanceDaysBeforeArrival: 30, securityDeposit: 500 },
  cancellation: [
    { daysBefore: 60, refundPercent: 100 },
    { daysBefore: 30, refundPercent: 50 },
    { daysBefore: 0, refundPercent: 0 },
  ],
  emails: { preArrivalDaysBefore: 7, reviewDaysAfter: 1 },
});
const NONE = new Set<string>();
const TODAY = "2027-01-15";

describe("dates", () => {
  it("counts nights and weekdays in calendar terms", () => {
    expect(nightsOf("2027-06-15", "2027-06-18")).toEqual(["2027-06-15", "2027-06-16", "2027-06-17"]);
    expect(diffDays("2027-03-27", "2027-03-29")).toBe(2); // across the EU DST switch
    expect(weekday("2027-07-10")).toBe(6);
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
  });
  it("clamps month arithmetic to the end of the month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });
  it("handles recurring ranges that wrap the year", () => {
    expect(inRecurringRange("2027-12-28", "12-20", "01-05")).toBe(true);
    expect(inRecurringRange("2028-01-03", "12-20", "01-05")).toBe(true);
    expect(inRecurringRange("2027-06-01", "12-20", "01-05")).toBe(false);
  });
  it("uses the property's time zone for today", () => {
    expect(todayIn("Europe/Athens", new Date("2027-06-14T22:30:00Z"))).toBe("2027-06-15");
  });
});

describe("pricing", () => {
  it("prices weekday and weekend nights, extra guests, cleaning, taxes and the deposit", () => {
    const q = quoteStay(config, { checkIn: "2027-06-15", checkOut: "2027-06-20", guests: 8 });
    expect(q.nights).toHaveLength(5);
    expect(q.accommodationCents).toBe((380 * 3 + 420 * 2) * 100); // Fri + Sat at the weekend rate
    expect(q.extraGuestCents).toBe(2 * 30 * 5 * 100);
    expect(q.cleaningCents).toBe(15000);
    expect(q.discount).toBeNull();
    expect(q.subtotalCents).toBe(243000);
    expect(q.lineItems).toEqual([{ id: "climate", label: { en: "Climate fee", el: "Τέλος" }, cents: 4000, includedInTotal: true }]);
    expect(q.totalCents).toBe(247000);
    expect(q.payment).toEqual({ mode: "deposit", depositCents: 74100, balanceCents: 172900 });
  });

  it("applies the largest long-stay discount to accommodation only", () => {
    const q = quoteStay(config, { checkIn: "2027-07-10", checkOut: "2027-07-24", guests: 6 });
    expect(q.accommodationCents).toBe(14 * 52000);
    expect(q.discount).toEqual({ percent: 10, cents: 72800 });
    expect(q.subtotalCents).toBe(728000 - 72800 + 15000);
    expect(q.totalCents).toBe(670200 + 14 * 800);
  });

  it("prices each night by its own season when a stay spans two", () => {
    const q = quoteStay(config, { checkIn: "2027-07-07", checkOut: "2027-07-12", guests: 2 });
    expect(q.nights.map((n) => n.seasonId)).toEqual(["early", "early", "early", "high", "high"]);
    expect(q.accommodationCents).toBe((380 + 380 + 420 + 520 + 520) * 100);
  });

  it("refunds by notice period", () => {
    expect(refundFor(config, 100000, 70)).toEqual({ percent: 100, cents: 100000 });
    expect(refundFor(config, 100000, 45)).toEqual({ percent: 50, cents: 50000 });
    expect(refundFor(config, 100000, 10)).toEqual({ percent: 0, cents: 0 });
  });

  it("prices every night of the real seed config", () => {
    for (const s of bookingSeed.seasons) {
      const year = 2027;
      const checkIn = `${year}-${s.from}`;
      expect(() => quoteStay(bookingSeed, { checkIn, checkOut: addDays(checkIn, s.minNights), guests: 2 })).not.toThrow();
    }
  });
});

describe("availability", () => {
  const stay = (checkIn: string, checkOut: string, guests = 4) => ({ checkIn, checkOut, guests });

  it("accepts a valid stay", () => {
    expect(checkStay(config, NONE, stay("2027-06-15", "2027-06-20"), TODAY)).toBeNull();
  });
  it("enforces the season's minimum stay", () => {
    expect(checkStay(config, NONE, stay("2027-06-15", "2027-06-18"), TODAY)).toEqual({ code: "minNights", minNights: 5 });
  });
  it("enforces arrival days (Saturday in high season)", () => {
    expect(checkStay(config, NONE, stay("2027-07-16", "2027-07-24"), TODAY)).toEqual({ code: "checkInDay", days: [6] });
    expect(canCheckInOn(config, "2027-07-17")).toBe(true);
    expect(canCheckInOn(config, "2027-07-16")).toBe(false);
  });
  it("rejects taken nights but allows check-in on another guest's check-out day", () => {
    const taken = nightsFromRanges([{ start: "2027-06-15", end: "2027-06-20" }]);
    expect(checkStay(config, taken, stay("2027-06-17", "2027-06-23"), TODAY)).toEqual({ code: "unavailable", date: "2027-06-17" });
    expect(checkStay(config, taken, stay("2027-06-20", "2027-06-25"), TODAY)).toBeNull();
  });
  it("rejects closed dates, short notice, far future, guests and impossible ranges", () => {
    expect(checkStay(config, NONE, stay("2027-10-01", "2027-10-08"), TODAY)?.code).toBe("closed");
    expect(checkStay(config, NONE, stay("2027-06-15", "2027-06-20"), "2027-06-14")).toEqual({ code: "tooSoon", minAdvanceDays: 2 });
    expect(checkStay(config, NONE, stay("2027-08-01", "2027-08-08"), "2026-01-01")).toEqual({ code: "tooFar", maxAdvanceMonths: 18 });
    expect(checkStay(config, NONE, stay("2027-06-15", "2027-06-20", 9), TODAY)).toEqual({ code: "guests", max: 8 });
    expect(checkStay(config, NONE, stay("2027-06-20", "2027-06-20"), TODAY)).toEqual({ code: "invalid" });
    expect(checkStay(config, NONE, stay("2027-02-30", "2027-03-05"), TODAY)).toEqual({ code: "invalid" });
  });
  it("finds the last possible departure before a blocked night", () => {
    const taken = nightsFromRanges([{ start: "2027-06-25", end: "2027-06-28" }]);
    expect(lastPossibleCheckOut(config, taken, "2027-06-20")).toBe("2027-06-25");
  });
});

describe("iCal", () => {
  it("parses an Airbnb-style feed with folded lines and all-day events", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTEND;VALUE=DATE:20270717",
      "DTSTART;VALUE=DATE:20270710",
      "UID:1418fb94e984-abc@airbnb.com",
      "SUMMARY:Reserved",
      "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC",
      " 123\\nPhone Number (Last 4 Digits): 1234",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20270801",
      "UID:blocked-1",
      "SUMMARY:Airbnb (Not available)",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseICal(ics)).toEqual([
      { uid: "1418fb94e984-abc@airbnb.com", start: "2027-07-10", end: "2027-07-17", summary: "Reserved" },
      { uid: "blocked-1", start: "2027-08-01", end: "2027-08-02", summary: "Airbnb (Not available)" },
    ]);
  });
  it("reduces timed events (Booking.com style) to their dates", () => {
    const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:b1\nDTSTART;TZID=Europe/Athens:20270812T150000\nDTEND;TZID=Europe/Athens:20270819T110000\nSUMMARY:CLOSED - Not available\nEND:VEVENT\nEND:VCALENDAR";
    expect(parseICal(ics)).toEqual([{ uid: "b1", start: "2027-08-12", end: "2027-08-19", summary: "CLOSED - Not available" }]);
  });
  it("exports a feed that parses back to the same events", () => {
    const events = [{ uid: "ca-1@capeavra.com", start: "2027-07-10", end: "2027-07-17", summary: "Cape Avra, booked" }];
    const ics = buildICal(events, { name: "Cape Avra", now: new Date("2027-01-01T00:00:00Z") });
    expect(ics).toContain("DTSTART;VALUE=DATE:20270710");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(parseICal(ics)).toEqual(events);
  });
});
