"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPathname } from "@/i18n/navigation";
import { rateLimited } from "@/lib/rate-limit";
import { getPaymentProvider, PaymentsUnavailableError } from "@/lib/payments/provider";
import { loadBookingConfig } from "./config";
import { sendConfirmationEmails } from "./emails";
import { holdStay, type HoldResult } from "./service";
import { getBookingStore, type GuestDetails } from "./store";
import { tokenMatches } from "./tokens";

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Step 1: hold the dates for a few minutes and return the guest's private checkout link parts. */
export async function startBooking(input: { checkIn: string; checkOut: string; guests: number; locale: "en" | "el" }): Promise<
  HoldResult | { ok: false; problem: { code: "rate" } }
> {
  // holds block the calendar for others, so limit how many one visitor can create
  if (rateLimited(`hold:${await clientIp()}`, 6, 15 * 60 * 1000)) return { ok: false, problem: { code: "rate" } };
  const locale = input.locale === "el" ? "el" : "en";
  return holdStay({ checkIn: String(input.checkIn), checkOut: String(input.checkOut), guests: Number(input.guests) }, locale);
}

const detailsSchema = z.object({
  ref: z.string().regex(/^CA-[A-Z0-9]{4}-[A-Z0-9]{2}$/),
  token: z.string().min(20).max(64),
  locale: z.enum(["en", "el"]),
  name: z.string().trim().min(2, "required").max(120, "tooLong"),
  email: z.string().trim().max(200, "tooLong").email("email"),
  phone: z.string().trim().min(5, "required").max(40, "tooLong"),
  country: z.string().trim().max(80, "tooLong").optional(),
  arrivalTime: z.string().trim().max(20, "tooLong").optional(),
  message: z.string().trim().max(2000, "tooLong").optional(),
  marketing: z.literal("on").optional(),
  terms: z.literal("on", { message: "terms" }),
});

export type ConfirmState = {
  status: "idle" | "error";
  fieldErrors?: Record<string, string>;
  formError?: "expired" | "notFound" | "paymentsUnavailable" | "paymentFailed" | "generic";
  values?: Record<string, string>;
};

/** Step 2: guest details + payment → confirmed booking → confirmation page. */
export async function confirmBooking(_: ConfirmState, form: FormData): Promise<ConfirmState> {
  const raw = Object.fromEntries(form);
  const values = Object.fromEntries(Object.entries(raw).filter(([k, v]) => typeof v === "string" && !k.startsWith("$") && k !== "token")) as Record<string, string>;
  const parsed = detailsSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    if (fieldErrors.ref || fieldErrors.token) return { status: "error", formError: "notFound" };
    return { status: "error", fieldErrors, values };
  }
  const v = parsed.data;
  const store = getBookingStore();
  const reservation = await store.getByRef(v.ref);
  if (!reservation || !tokenMatches(v.token, reservation.tokenHash)) return { status: "error", formError: "notFound" };

  const confirmationUrl = getPathname({ href: { pathname: "/book/confirmation", query: { ref: v.ref, t: v.token } }, locale: v.locale });
  if (reservation.status === "confirmed") redirect(confirmationUrl);
  if (reservation.status !== "hold" || !reservation.expiresAt || reservation.expiresAt <= new Date().toISOString()) {
    return { status: "error", formError: "expired" };
  }

  let provider;
  try {
    provider = getPaymentProvider();
  } catch (e) {
    if (e instanceof PaymentsUnavailableError) return { status: "error", formError: "paymentsUnavailable", values };
    throw e;
  }

  const config = await loadBookingConfig();
  const amount = reservation.quote.payment.depositCents;
  let payment;
  try {
    payment = await provider.collect(reservation, amount);
  } catch (e) {
    console.error(`[booking] payment failed for ${v.ref}`, e);
    await store.releaseHold(reservation.id);
    return { status: "error", formError: "paymentFailed" };
  }

  const guest: GuestDetails = {
    name: v.name,
    email: v.email,
    phone: v.phone,
    country: v.country || undefined,
    arrivalTime: v.arrivalTime || undefined,
    message: v.message || undefined,
    marketing: v.marketing === "on",
  };
  const confirmed = await store.confirm(reservation.id, guest, payment);
  if (!confirmed) {
    // the hold expired while paying: in Phase 4 the Stripe webhook refunds/reconciles this case
    console.error(`[booking] ${v.ref}: hold expired during payment`, payment);
    return { status: "error", formError: "expired" };
  }

  after(async () => {
    try {
      await sendConfirmationEmails(confirmed, config);
      await store.markEmailSent(confirmed.id, "confirmation");
    } catch (e) {
      console.error(`[booking] confirmation emails for ${v.ref} failed`, e);
    }
  });
  redirect(confirmationUrl);
}
