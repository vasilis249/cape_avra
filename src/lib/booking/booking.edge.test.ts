/**
 * Phase 6: edge cases and invariants for pricing and availability.
 * The randomised part uses a seeded generator, so a failure is reproducible (seed in the message).
 */
import { describe, expect, it } from "vitest";
import { bookingSeed } from "@content/booking";
import { checkStay, lastPossibleCheckOut, minNightsFor, nightsFromRanges } from "./availability";
import { bookingConfigSchema, type BookingConfig } from "./config-schema";
import { addDays, addMonths, diffDays, isISODate, nightsOf, todayIn, weekday } from "./dates";
import { quoteStay, refundFor, seasonFor } from "./pricing";

const base = {
  currency: "EUR",
  timeZone: "Europe/Athens",
  weekendNights: [5, 6],
  closedOutsideSeasons: true,
  baseGuests: 6,
  maxGuests: 8,
  extraGuestPerNight: 30,
  cleaningFee: 150,
  longStayDiscounts: [],
  lineItems: [],
  minAdvanceDays: 2,
  maxAdvanceMonths: 18,
  maxNights: 28,
  holdMinutes: 15,
  payment: { mode: "deposit", depositPercent: 30, balanceDaysBeforeArrival: 30, securityDeposit: 0 },
  cancellation: [{ daysBefore: 0, refundPercent: 0 }],
  emails: { preArrivalDaysBefore: 7, reviewDaysAfter: 1 },
};
const cfg = (over: Record<string, unknown>): BookingConfig => bookingConfigSchema.parse({ ...base, ...over });
const NONE = new Set<string>();

describe("dates: edges", () => {
  it("counts nights across daylight-saving changes and leap days", () => {
    expect(nightsOf("2027-03-27", "2027-03-29")).toEqual(["2027-03-27", "2027-03-28"]); // EU clocks go forward 28 Mar
    expect(nightsOf("2027-10-30", "2027-11-01")).toHaveLength(2); // and back on 31 Oct
    expect(nightsOf("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29"]);
    expect(diffDays("2027-12-31", "2028-01-01")).toBe(1);
    expect(isISODate("2027-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
  });

  it("'today' is the property's date, not UTC's, around midnight", () => {
    expect(todayIn("Europe/Athens", new Date("2027-06-30T21:30:00Z"))).toBe("2027-07-01"); // 00:30 in Athens (UTC+3)
    expect(todayIn("Europe/Athens", new Date("2027-01-31T21:59:00Z"))).toBe("2027-01-31"); // 23:59 (UTC+2)
    expect(todayIn("Europe/Athens", new Date("2027-01-31T22:00:00Z"))).toBe("2027-02-01");
  });
});

describe("pricing: edges", () => {
  const winter = cfg({
    seasons: [{ id: "winter", name: { en: "W", el: "Χ" }, from: "11-01", to: "03-31", nightly: 200, weekend: 260, minNights: 3 }],
  });

  it("a season that wraps the new year prices every night, weekend rate only on weekend nights", () => {
    const q = quoteStay(winter, { checkIn: "2027-12-30", checkOut: "2028-01-03", guests: 2 });
    // Thu 30, Fri 31 (weekend), Sat 1 (weekend), Sun 2
    expect(q.nights.map((n) => [n.date, n.cents])).toEqual([
      ["2027-12-30", 20000],
      ["2027-12-31", 26000],
      ["2028-01-01", 26000],
      ["2028-01-02", 20000],
    ]);
    expect(quoteStay(winter, { checkIn: "2028-02-28", checkOut: "2028-03-01", guests: 2 }).nights.map((n) => n.date)).toEqual(["2028-02-28", "2028-02-29"]);
  });

  it("a gap between seasons cannot be priced (and is closed for booking)", () => {
    const gap = cfg({
      seasons: [
        { id: "a", name: { en: "A", el: "Α" }, from: "06-01", to: "06-10", nightly: 100, minNights: 1 },
        { id: "b", name: { en: "B", el: "Β" }, from: "06-12", to: "06-30", nightly: 100, minNights: 1 },
      ],
    });
    expect(() => quoteStay(gap, { checkIn: "2027-06-10", checkOut: "2027-06-13", guests: 2 })).toThrow(/2027-06-11/);
    expect(checkStay(gap, NONE, { checkIn: "2027-06-10", checkOut: "2027-06-13", guests: 2 }, "2027-01-01")).toEqual({ code: "closed", date: "2027-06-11" });
  });

  it("fees by month count only nights in those months; per-stay fees need one such night; pay-on-arrival stays out of the total", () => {
    const c = cfg({
      seasons: [{ id: "all", name: { en: "All", el: "Όλο" }, from: "01-01", to: "12-31", nightly: 100, minNights: 1 }],
      cleaningFee: 0,
      lineItems: [
        { id: "climate", label: { en: "c", el: "c" }, type: "perNight", amount: 8, months: [4, 5, 6, 7, 8, 9, 10] },
        { id: "winterClimate", label: { en: "w", el: "w" }, type: "perNight", amount: 2, months: [1, 2, 3, 11, 12] },
        { id: "summerKit", label: { en: "k", el: "k" }, type: "perStay", amount: 20, months: [7, 8] },
        { id: "vat", label: { en: "v", el: "v" }, type: "percent", amount: 13 },
        { id: "tourist", label: { en: "t", el: "t" }, type: "perNight", amount: 1.5, includedInTotal: false },
      ],
    });
    const q = quoteStay(c, { checkIn: "2027-10-30", checkOut: "2027-11-02", guests: 2 }); // Oct 30, Oct 31, Nov 1
    const line = (id: string) => q.lineItems.find((l) => l.id === id)?.cents;
    expect(line("climate")).toBe(1600);
    expect(line("winterClimate")).toBe(200);
    expect(line("summerKit")).toBeUndefined();
    expect(line("vat")).toBe(Math.round(30000 * 0.13));
    expect(line("tourist")).toBe(450);
    expect(q.payOnArrivalCents).toBe(450);
    expect(q.totalCents).toBe(30000 + 1600 + 200 + 3900);
  });

  it("extra guests are charged per night above the base, never below", () => {
    const c = cfg({ seasons: [{ id: "s", name: { en: "S", el: "Σ" }, from: "06-01", to: "08-31", nightly: 100, minNights: 1 }] });
    const at = (guests: number) => quoteStay(c, { checkIn: "2027-07-01", checkOut: "2027-07-04", guests }).extraGuestCents;
    expect([1, 6, 7, 8].map(at)).toEqual([0, 0, 9000, 18000]);
  });

  it("deposit and balance always add up exactly (odd cents) and full mode has no balance", () => {
    const c = cfg({
      seasons: [{ id: "s", name: { en: "S", el: "Σ" }, from: "06-01", to: "08-31", nightly: 333.33, minNights: 1 }],
      cleaningFee: 0.01,
    });
    const q = quoteStay(c, { checkIn: "2027-07-01", checkOut: "2027-07-02", guests: 2 });
    expect(q.payment.depositCents + q.payment.balanceCents).toBe(q.totalCents);
    expect(Number.isInteger(q.payment.depositCents)).toBe(true);
    const full = quoteStay(cfg({ ...c, payment: { ...base.payment, mode: "full" } }), { checkIn: "2027-07-01", checkOut: "2027-07-02", guests: 2 });
    expect(full.payment).toMatchObject({ mode: "full", balanceCents: 0, balanceDueDate: null, depositCents: full.totalCents });
  });

  it("the balance date is exactly balanceDaysBeforeArrival; on that day itself the booking pays in full", () => {
    const c = cfg({ seasons: [{ id: "s", name: { en: "S", el: "Σ" }, from: "06-01", to: "08-31", nightly: 100, minNights: 1 }] });
    const stay = { checkIn: "2027-07-31", checkOut: "2027-08-03", guests: 2 };
    expect(quoteStay(c, stay, "2027-06-30").payment).toMatchObject({ mode: "deposit", balanceDueDate: "2027-07-01" });
    expect(quoteStay(c, stay, "2027-07-01").payment.mode).toBe("full");
  });

  it("refund tiers: boundaries are inclusive, order in config does not matter, cents are rounded", () => {
    const c = cfg({
      cancellation: [
        { daysBefore: 0, refundPercent: 0 },
        { daysBefore: 60, refundPercent: 100 },
        { daysBefore: 30, refundPercent: 50 },
      ],
      seasons: [{ id: "s", name: { en: "S", el: "Σ" }, from: "01-01", to: "12-31", nightly: 1, minNights: 1 }],
    });
    expect([60, 59, 30, 29, 0].map((d) => refundFor(c, 1001, d))).toEqual([
      { percent: 100, cents: 1001 },
      { percent: 50, cents: 501 },
      { percent: 50, cents: 501 },
      { percent: 0, cents: 0 },
      { percent: 0, cents: 0 },
    ]);
  });
});

describe("availability: edges", () => {
  const c = cfg({
    seasons: [
      { id: "shoulder", name: { en: "S", el: "Σ" }, from: "05-01", to: "07-09", nightly: 300, minNights: 3 },
      { id: "high", name: { en: "H", el: "Υ" }, from: "07-10", to: "08-31", nightly: 500, minNights: 7, checkInDays: [6] },
    ],
  });
  const today = "2027-01-15";

  it("the arrival night's season sets the minimum stay and arrival day, even when the stay runs into another season", () => {
    expect(minNightsFor(c, "2027-07-09")).toBe(3);
    expect(checkStay(c, NONE, { checkIn: "2027-07-07", checkOut: "2027-07-12", guests: 2 }, today)).toBeNull(); // starts in shoulder
    expect(checkStay(c, NONE, { checkIn: "2027-07-12", checkOut: "2027-07-19", guests: 2 }, today)).toEqual({ code: "checkInDay", days: [6] });
    expect(weekday("2027-07-10")).toBe(6);
    expect(checkStay(c, NONE, { checkIn: "2027-07-10", checkOut: "2027-07-16", guests: 2 }, today)).toEqual({ code: "minNights", minNights: 7 });
  });

  it("advance window boundaries", () => {
    const stay = (checkIn: string, n: number) => ({ checkIn, checkOut: addDays(checkIn, n), guests: 2 });
    const open = cfg({ ...c, closedOutsideSeasons: false, seasons: [{ id: "a", name: { en: "A", el: "Α" }, from: "01-01", to: "12-31", nightly: 1, minNights: 1 }] });
    expect(checkStay(open, NONE, stay("2027-01-16", 1), today)).toEqual({ code: "tooSoon", minAdvanceDays: 2 });
    expect(checkStay(open, NONE, stay("2027-01-17", 1), today)).toBeNull();
    expect(checkStay(open, NONE, stay("2028-07-14", 1), today)).toBeNull(); // check-out exactly 18 months ahead
    expect(checkStay(open, NONE, stay("2028-07-15", 1), today)).toEqual({ code: "tooFar", maxAdvanceMonths: 18 });
    expect(checkStay(open, NONE, stay("2027-03-01", 28), today)).toBeNull();
    expect(checkStay(open, NONE, stay("2027-03-01", 29), today)).toEqual({ code: "maxNights", maxNights: 28 });
  });

  it("rejects malformed input", () => {
    for (const s of [
      { checkIn: "2027-06-01", checkOut: "2027-06-01", guests: 2 },
      { checkIn: "2027-06-05", checkOut: "2027-06-01", guests: 2 },
      { checkIn: "2027-02-30", checkOut: "2027-03-02", guests: 2 },
      { checkIn: "27-06-01", checkOut: "2027-06-04", guests: 2 },
    ]) expect(checkStay(c, NONE, s, today)).toEqual({ code: "invalid" });
    for (const guests of [0, 9, 2.5, Number.NaN]) {
      expect(checkStay(c, NONE, { checkIn: "2027-06-01", checkOut: "2027-06-04", guests }, today)).toEqual({ code: "guests", max: 8 });
    }
  });

  it("back-to-back stays share the turnover day; the last possible departure stops at the next taken night", () => {
    const taken = nightsFromRanges([{ start: "2027-06-10", end: "2027-06-15" }]);
    expect(checkStay(c, taken, { checkIn: "2027-06-07", checkOut: "2027-06-10", guests: 2 }, today)).toBeNull();
    expect(checkStay(c, taken, { checkIn: "2027-06-15", checkOut: "2027-06-18", guests: 2 }, today)).toBeNull();
    expect(checkStay(c, taken, { checkIn: "2027-06-08", checkOut: "2027-06-11", guests: 2 }, today)).toEqual({ code: "unavailable", date: "2027-06-10" });
    expect(lastPossibleCheckOut(c, taken, "2027-06-05")).toBe("2027-06-10");
    expect(lastPossibleCheckOut(c, NONE, "2027-08-25")).toBe("2027-09-01"); // the season ends
  });
});

/* ------------------------------------------------------------ invariants */

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

describe("invariants over random stays (real seed config)", () => {
  const config = bookingSeed;
  const today = "2026-11-21";
  const SEED = 20261121;

  it("every bookable stay prices consistently", () => {
    const r = rng(SEED);
    let checked = 0;
    for (let i = 0; i < 2000; i++) {
      const checkIn = addDays(today, 2 + Math.floor(r() * 520));
      const n = 1 + Math.floor(r() * 30);
      const guests = 1 + Math.floor(r() * 9);
      const stay = { checkIn, checkOut: addDays(checkIn, n), guests };
      if (checkStay(config, NONE, stay, today)) continue;
      checked++;
      const q = quoteStay(config, stay, today);
      const ctx = `seed ${SEED} #${i} ${JSON.stringify(stay)}`;
      expect(q.nights.length, ctx).toBe(n);
      expect(q.nights.every((x) => seasonFor(config, x.date)), ctx).toBe(true);
      expect(q.subtotalCents, ctx).toBe(q.accommodationCents + q.extraGuestCents - (q.discount?.cents ?? 0) + q.cleaningCents);
      expect(q.totalCents, ctx).toBe(q.subtotalCents + q.lineItems.filter((l) => l.includedInTotal).reduce((s, l) => s + l.cents, 0));
      expect(q.payment.depositCents + q.payment.balanceCents, ctx).toBe(q.totalCents);
      expect(q.payment.depositCents, ctx).toBeGreaterThan(0);
      expect(q.payment.balanceCents, ctx).toBeGreaterThanOrEqual(0);
      for (const v of [q.totalCents, q.payment.depositCents, ...q.nights.map((x) => x.cents), ...q.lineItems.map((l) => l.cents)]) {
        expect(Number.isInteger(v), ctx).toBe(true);
      }
      if (q.payment.mode === "deposit") expect(diffDays(today, q.payment.balanceDueDate!), ctx).toBeGreaterThan(0);
      // one more guest never costs less
      if (guests < config.maxGuests) expect(quoteStay(config, { ...stay, guests: guests + 1 }, today).totalCents, ctx).toBeGreaterThanOrEqual(q.totalCents);
    }
    expect(checked).toBeGreaterThan(100); // the generator does reach bookable stays
  });

  it("a stay accepted against busy dates never touches a taken night, and lastPossibleCheckOut agrees", () => {
    const r = rng(SEED + 1);
    for (let i = 0; i < 300; i++) {
      const ranges = Array.from({ length: 6 }, () => {
        const start = addDays(today, 30 + Math.floor(r() * 300));
        return { start, end: addDays(start, 1 + Math.floor(r() * 10)) };
      });
      const taken = nightsFromRanges(ranges);
      const checkIn = addDays(today, 30 + Math.floor(r() * 300));
      const checkOut = addDays(checkIn, 1 + Math.floor(r() * 14));
      const problem = checkStay(config, taken, { checkIn, checkOut, guests: 2 }, today);
      const ctx = `seed ${SEED + 1} #${i} ${checkIn}→${checkOut}`;
      if (!problem) {
        expect(nightsOf(checkIn, checkOut).some((n) => taken.has(n)), ctx).toBe(false);
        expect(checkOut <= lastPossibleCheckOut(config, taken, checkIn), ctx).toBe(true);
      }
      if (problem?.code === "unavailable") expect(taken.has(problem.date), ctx).toBe(true);
    }
  });
});

describe("iCal download cap", async () => {
  const { readCapped } = await import("@/lib/http/read-capped");
  it("reads normal feeds and refuses oversized ones", async () => {
    expect(await readCapped(new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR"), 1024)).toContain("VCALENDAR");
    await expect(readCapped(new Response("x".repeat(2048)), 1024)).rejects.toThrow("too large");
    await expect(readCapped(new Response("x", { headers: { "content-length": "99999999" } }), 1024)).rejects.toThrow("too large");
  });
});
