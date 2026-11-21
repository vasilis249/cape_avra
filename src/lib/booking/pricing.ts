import type { BookingConfig, Season } from "./config-schema";
import { addDays, diffDays, inRecurringRange, month, nightsOf, weekday, type ISODate } from "./dates";

/** Integer cents throughout; convert once at the edges. */
export const toCents = (euros: number) => Math.round(euros * 100);

export function seasonFor(config: BookingConfig, night: ISODate): Season | null {
  return config.seasons.find((s) => inRecurringRange(night, s.from, s.to)) ?? null;
}

export type QuoteNight = { date: ISODate; seasonId: string; cents: number; weekend: boolean };
export type QuoteLine = { id: string; label: { en: string; el: string }; cents: number; includedInTotal: boolean };

export type Quote = {
  currency: "EUR";
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
  nights: QuoteNight[];
  accommodationCents: number;
  extraGuestCents: number;
  cleaningCents: number;
  discount: { percent: number; cents: number } | null;
  subtotalCents: number;
  lineItems: QuoteLine[];
  /** what the guest pays through the site */
  totalCents: number;
  /** charged on arrival (line items with includedInTotal: false) */
  payOnArrivalCents: number;
  /** owner-agreed price: difference between the calculated and the agreed total (negative = discount) */
  adjustmentCents?: number;
  /** what is charged now and later. Late bookings (inside the balance window) pay in full. */
  payment: { depositCents: number; balanceCents: number; mode: "full" | "deposit"; balanceDueDate: ISODate | null };
};

/**
 * Price a stay. Assumes the stay has been validated (see availability.ts);
 * nights outside every season throw, because they cannot be priced.
 */
export function quoteStay(
  config: BookingConfig,
  input: { checkIn: ISODate; checkOut: ISODate; guests: number },
  /** property-local today; when the balance would already be due, the plan becomes "full" */
  today?: ISODate,
): Quote {
  const nightDates = nightsOf(input.checkIn, input.checkOut);
  if (nightDates.length === 0) throw new Error("A stay needs at least one night");

  const nights: QuoteNight[] = nightDates.map((date) => {
    const season = seasonFor(config, date);
    if (!season) throw new Error(`No season for ${date}`);
    const isWeekend = config.weekendNights.includes(weekday(date));
    const rate = isWeekend && season.weekend !== undefined ? season.weekend : season.nightly;
    return { date, seasonId: season.id, cents: toCents(rate), weekend: isWeekend };
  });

  const accommodationCents = nights.reduce((sum, n) => sum + n.cents, 0);
  const extraGuests = Math.max(0, input.guests - config.baseGuests);
  const extraGuestCents = extraGuests * toCents(config.extraGuestPerNight) * nights.length;
  const cleaningCents = toCents(config.cleaningFee);

  // largest applicable long-stay discount, on accommodation + extra guests (not on cleaning or taxes)
  const tier = [...config.longStayDiscounts].sort((a, b) => b.minNights - a.minNights).find((t) => nights.length >= t.minNights);
  const discountBase = accommodationCents + extraGuestCents;
  const discount = tier ? { percent: tier.percent, cents: Math.round((discountBase * tier.percent) / 100) } : null;

  const subtotalCents = discountBase - (discount?.cents ?? 0) + cleaningCents;

  const lineItems: QuoteLine[] = config.lineItems
    .map((item) => {
      const applicable = item.months ? nights.filter((n) => item.months!.includes(month(n.date))) : nights;
      let cents = 0;
      if (item.type === "perNight") cents = applicable.length * toCents(item.amount);
      else if (item.type === "perStay") cents = applicable.length > 0 ? toCents(item.amount) : 0;
      else cents = Math.round((discountBase - (discount?.cents ?? 0)) * (item.amount / 100));
      return { id: item.id, label: item.label, cents, includedInTotal: item.includedInTotal };
    })
    .filter((l) => l.cents > 0);

  const totalCents = subtotalCents + lineItems.filter((l) => l.includedInTotal).reduce((s, l) => s + l.cents, 0);
  const payOnArrivalCents = lineItems.filter((l) => !l.includedInTotal).reduce((s, l) => s + l.cents, 0);


  return {
    currency: config.currency,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
    nights,
    accommodationCents,
    extraGuestCents,
    cleaningCents,
    discount,
    subtotalCents,
    lineItems,
    totalCents,
    payOnArrivalCents,
    payment: paymentPlan(config, input.checkIn, totalCents, today),
  };
}

/** Deposit now + balance later, or everything now when the balance would already be due. */
export function paymentPlan(config: BookingConfig, checkIn: ISODate, totalCents: number, today?: ISODate): Quote["payment"] {
  const balanceDueDate = addDays(checkIn, -config.payment.balanceDaysBeforeArrival);
  const late = today !== undefined && diffDays(today, balanceDueDate) <= 0;
  const mode = config.payment.mode === "full" || late ? "full" : "deposit";
  const depositCents = mode === "full" ? totalCents : Math.round((totalCents * config.payment.depositPercent) / 100);
  return { mode, depositCents, balanceCents: totalCents - depositCents, balanceDueDate: mode === "full" ? null : balanceDueDate };
}

/** A price agreed with the guest (owner bookings): keeps the breakdown, records the difference. */
export function withCustomTotal(config: BookingConfig, quote: Quote, totalCents: number, today?: ISODate): Quote {
  const total = Math.max(0, Math.round(totalCents));
  const calculated = quote.totalCents - (quote.adjustmentCents ?? 0);
  return {
    ...quote,
    adjustmentCents: total - calculated || undefined,
    totalCents: total,
    payment: paymentPlan(config, quote.checkIn, total, today),
  };
}

/** Refund for a cancellation `daysBefore` arrival, per the configured tiers. */
export function refundFor(config: BookingConfig, paidCents: number, daysBefore: number): { percent: number; cents: number } {
  const tier = [...config.cancellation].sort((a, b) => b.daysBefore - a.daysBefore).find((t) => daysBefore >= t.daysBefore);
  const percent = tier?.refundPercent ?? 0;
  return { percent, cents: Math.round((paidCents * percent) / 100) };
}

export function formatMoney(cents: number, locale: "en" | "el", currency = "EUR"): string {
  return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
