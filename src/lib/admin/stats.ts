import type { BookingConfig } from "@/lib/booking/config-schema";
import { addDays, diffDays, type ISODate } from "@/lib/booking/dates";
import { seasonFor } from "@/lib/booking/pricing";
import type { CalendarBlock, Payment, Reservation } from "@/lib/booking/store";

/** Dashboard figures. Pure, so it is unit-tested; money in cents. */

export type Occupancy = { openNights: number; booked: number; direct: number; percent: number; directPercent: number };

const STAY = new Set(["deposit", "full", "balance"]);

/** Net received in a calendar year: stay payments and kept security deposits, minus refunds. */
export function revenueIn(year: number, payments: Payment[]): number {
  return payments
    .filter((p) => p.createdAt.startsWith(String(year)))
    .reduce((s, p) => {
      if (STAY.has(p.kind) && p.status === "succeeded") return s + p.amountCents - p.refundedCents;
      if (p.kind === "security_deposit" && p.status === "captured") return s + p.amountCents - p.refundedCents;
      return s;
    }, 0);
}

export function grossPaidOf(r: Reservation, payments: Payment[]): number {
  return payments.filter((p) => p.reservationId === r.id && STAY.has(p.kind) && p.status === "succeeded").reduce((s, p) => s + p.amountCents, 0);
}
export function netPaidOf(r: Reservation, payments: Payment[]): number {
  return payments
    .filter((p) => p.reservationId === r.id && STAY.has(p.kind) && p.status === "succeeded")
    .reduce((s, p) => s + p.amountCents - p.refundedCents, 0);
}

/**
 * Occupancy of [from, to): booked nights (direct + other channels) over the nights the house is open
 * (in a season when closed outside seasons). Nights you blocked yourself are not counted as open.
 */
export function occupancy(config: BookingConfig, from: ISODate, to: ISODate, reservations: Reservation[], blocks: CalendarBlock[]): Occupancy {
  const direct = new Set<ISODate>();
  const other = new Set<ISODate>();
  const own = new Set<ISODate>();
  const mark = (set: Set<ISODate>, start: ISODate, end: ISODate) => {
    for (let d = start < from ? from : start; d < end && d < to; d = addDays(d, 1)) set.add(d);
  };
  for (const r of reservations) if (r.status === "confirmed") mark(direct, r.checkIn, r.checkOut);
  for (const b of blocks) mark(b.source === "manual" ? own : other, b.start, b.end);

  let open = 0;
  let booked = 0;
  let directN = 0;
  for (let d = from; d < to; d = addDays(d, 1)) {
    if (config.closedOutsideSeasons && !seasonFor(config, d)) continue;
    if (own.has(d) && !direct.has(d)) continue;
    open++;
    if (direct.has(d)) {
      booked++;
      directN++;
    } else if (other.has(d)) booked++;
  }
  const pct = (n: number) => (open ? Math.round((n / open) * 100) : 0);
  return { openNights: open, booked, direct: directN, percent: pct(booked), directPercent: pct(directN) };
}

/** The year whose season is current or next: this year, unless no open night is left in it. */
export function seasonYear(config: BookingConfig, today: ISODate): number {
  const y = Number(today.slice(0, 4));
  for (let d = today; d < `${y + 1}-01-01`; d = addDays(d, 1)) if (!config.closedOutsideSeasons || seasonFor(config, d)) return y;
  return y + 1;
}

export type DashboardData = {
  revenueYear: number;
  revenueCents: number;
  bookedValueCents: number;
  upcomingCount: number;
  outstandingCents: number;
  occ30: Occupancy;
  occ90: Occupancy;
  occSeason: Occupancy;
  seasonYear: number;
  inHouse: Reservation[];
  arrivals: Reservation[];
  balanceFailed: Reservation[];
  securityFailed: Reservation[];
  securityHeld: { r: Reservation; p: Payment }[];
};

export function dashboard(config: BookingConfig, today: ISODate, reservations: Reservation[], payments: Payment[], blocks: CalendarBlock[]): DashboardData {
  const confirmed = reservations.filter((r) => r.status === "confirmed");
  const upcoming = confirmed.filter((r) => r.checkOut > today);
  const byRes = (r: Reservation) => payments.filter((p) => p.reservationId === r.id);
  const sy = seasonYear(config, today);
  return {
    revenueYear: Number(today.slice(0, 4)),
    revenueCents: revenueIn(Number(today.slice(0, 4)), payments),
    bookedValueCents: upcoming.reduce((s, r) => s + r.totalCents, 0),
    upcomingCount: upcoming.length,
    outstandingCents: upcoming.reduce((s, r) => s + Math.max(0, r.totalCents - grossPaidOf(r, payments)), 0),
    occ30: occupancy(config, today, addDays(today, 30), reservations, blocks),
    occ90: occupancy(config, today, addDays(today, 90), reservations, blocks),
    occSeason: occupancy(config, `${sy}-01-01`, `${sy + 1}-01-01`, reservations, blocks),
    seasonYear: sy,
    inHouse: upcoming.filter((r) => r.checkIn <= today).sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1)),
    arrivals: upcoming
      .filter((r) => r.checkIn > today && diffDays(today, r.checkIn) <= 60)
      .sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1)),
    balanceFailed: upcoming.filter((r) => {
      const ps = byRes(r);
      return ps.some((p) => p.kind === "balance" && p.status === "failed") && !ps.some((p) => p.kind === "balance" && p.status === "succeeded");
    }),
    securityFailed: upcoming.filter((r) => {
      const ps = byRes(r).filter((p) => p.kind === "security_deposit");
      return ps.some((p) => p.status === "failed") && !ps.some((p) => p.status === "authorized" || p.status === "captured");
    }),
    securityHeld: payments
      .filter((p) => p.kind === "security_deposit" && p.status === "authorized")
      .flatMap((p) => {
        const r = reservations.find((x) => x.id === p.reservationId);
        return r ? [{ r, p }] : [];
      }),
  };
}
