import { z } from "zod";

/**
 * Booking configuration schema. The same shape is used for the file seed
 * (content/booking.ts) and, from Phase 5, the admin-editable copy in the database.
 * All money is in whole currency units here (EUR); calculations use cents.
 */
const mmdd = z.string().regex(/^\d{2}-\d{2}$/, "MM-DD");
const label = z.object({ en: z.string(), el: z.string() });
const weekday = z.number().int().min(0).max(6); // 0 = Sunday … 6 = Saturday

export const seasonSchema = z.object({
  id: z.string(),
  name: label,
  /** inclusive, recurring every year (MM-DD); may wrap the new year */
  from: mmdd,
  to: mmdd,
  nightly: z.number().nonnegative(),
  /** nights in `weekendNights` cost this instead (optional) */
  weekend: z.number().nonnegative().optional(),
  minNights: z.number().int().min(1),
  /** allowed check-in weekdays; omit = any day */
  checkInDays: z.array(weekday).optional(),
});

export const lineItemSchema = z.object({
  id: z.string(),
  label,
  /** perNight: amount × nights · perStay: amount once · percent: % of the accommodation subtotal */
  type: z.enum(["perNight", "perStay", "percent"]),
  amount: z.number().nonnegative(),
  /** only for nights in these months (1–12); omit = all months */
  months: z.array(z.number().int().min(1).max(12)).optional(),
  /** included in the total shown and charged (true) or payable on arrival (false) */
  includedInTotal: z.boolean().default(true),
});

export const bookingConfigSchema = z.object({
  currency: z.literal("EUR"),
  timeZone: z.string(),
  /** nights that use the weekend rate (5 = Friday night, 6 = Saturday night) */
  weekendNights: z.array(weekday),
  seasons: z.array(seasonSchema).min(1),
  /** dates outside every season cannot be booked */
  closedOutsideSeasons: z.boolean(),
  baseGuests: z.number().int().min(1),
  maxGuests: z.number().int().min(1),
  extraGuestPerNight: z.number().nonnegative(),
  cleaningFee: z.number().nonnegative(),
  longStayDiscounts: z.array(z.object({ minNights: z.number().int().min(2), percent: z.number().min(0).max(100) })),
  lineItems: z.array(lineItemSchema),
  minAdvanceDays: z.number().int().min(0),
  maxAdvanceMonths: z.number().int().min(1),
  maxNights: z.number().int().min(1),
  holdMinutes: z.number().int().min(5).max(60),
  payment: z.object({
    mode: z.enum(["full", "deposit"]),
    depositPercent: z.number().min(1).max(100),
    /** balance charged automatically this many days before arrival */
    balanceDaysBeforeArrival: z.number().int().min(1),
    /** security deposit in euros, authorised (not charged) on the saved card during the stay; 0 = none */
    securityDeposit: z.number().nonnegative(),
    /** the authorisation is released this many days after check-out (time to check the house) */
    securityDepositReleaseDays: z.number().int().min(0).max(5).default(2),
  }),
  /** refund % depending on days before arrival; first matching tier (sorted by daysBefore desc) applies */
  cancellation: z.array(z.object({ daysBefore: z.number().int().min(0), refundPercent: z.number().min(0).max(100) })).min(1),
  emails: z.object({
    preArrivalDaysBefore: z.number().int().min(1),
    reviewDaysAfter: z.number().int().min(0),
  }),
});

export type BookingConfig = z.infer<typeof bookingConfigSchema>;
export type Season = z.infer<typeof seasonSchema>;
export type LineItem = z.infer<typeof lineItemSchema>;
