"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPathname } from "@/i18n/navigation";
import { rateLimited } from "@/lib/rate-limit";
import { paymentDeps } from "@/lib/payments/deps";
import { PaymentsUnavailableError } from "@/lib/payments/provider";
import { beginBalancePayment, beginCheckout, cancelReservation, syncPayment } from "@/lib/payments/service";
import { todayIn } from "./dates";
import { holdStay, type HoldResult } from "./service";
import { getBookingStore, type GuestDetails, type Reservation } from "./store";
import { canAccess, tokenMatches } from "./tokens";

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

const linkSchema = z.object({
  ref: z.string().regex(/^CA-[A-Z0-9]{4}-[A-Z0-9]{2}$/),
  token: z.string().min(20).max(64),
  locale: z.enum(["en", "el"]),
});

const detailsSchema = linkSchema.extend({
  name: z.string().trim().min(2, "required").max(120, "tooLong"),
  email: z.string().trim().max(200, "tooLong").email("email"),
  phone: z.string().trim().min(5, "required").max(40, "tooLong"),
  country: z.string().trim().max(80, "tooLong").optional(),
  arrivalTime: z.string().trim().max(20, "tooLong").optional(),
  message: z.string().trim().max(2000, "tooLong").optional(),
  marketing: z.literal("on").optional(),
  terms: z.literal("on", { message: "terms" }),
});

export type PaymentIntentInfo = { paymentRef: string; clientSecret: string; amountCents: number };

export type CheckoutState = {
  status: "idle" | "error" | "pay";
  fieldErrors?: Record<string, string>;
  formError?: "expired" | "notFound" | "paymentsUnavailable" | "paymentFailed" | "generic";
  values?: Record<string, string>;
  payment?: PaymentIntentInfo;
  expiresAt?: string;
};

const confirmationPath = (ref: string, token: string, locale: "en" | "el") =>
  getPathname({ href: { pathname: "/book/confirmation", query: { ref, t: token } }, locale });

async function findReservation(ref: string, token: string, opts: { manage?: boolean } = {}): Promise<Reservation | null> {
  const r = await getBookingStore().getByRef(ref);
  if (!r) return null;
  return (opts.manage ? canAccess(ref, token, r.tokenHash) : tokenMatches(token, r.tokenHash)) ? r : null;
}

/** Step 2: guest details → hold extended, payment prepared; the browser then shows the payment form. */
export async function preparePayment(_: CheckoutState, form: FormData): Promise<CheckoutState> {
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
  if (rateLimited(`pay:${await clientIp()}`, 12, 15 * 60 * 1000)) return { status: "error", formError: "generic", values };
  const reservation = await findReservation(v.ref, v.token);
  if (!reservation) return { status: "error", formError: "notFound" };
  if (reservation.status === "confirmed") redirect(confirmationPath(v.ref, v.token, v.locale));

  const guest: GuestDetails = {
    name: v.name,
    email: v.email,
    phone: v.phone,
    country: v.country || undefined,
    arrivalTime: v.arrivalTime || undefined,
    message: v.message || undefined,
    marketing: v.marketing === "on",
  };

  let result;
  try {
    result = await beginCheckout(await paymentDeps(), reservation, guest);
  } catch (e) {
    if (e instanceof PaymentsUnavailableError) return { status: "error", formError: "paymentsUnavailable", values };
    console.error(`[booking] preparing payment for ${v.ref} failed`, e);
    return { status: "error", formError: "generic", values };
  }
  if (!result.ok) return { status: "error", formError: result.code === "expired" ? "expired" : "generic", values };
  if ("paid" in result) redirect(confirmationPath(v.ref, v.token, v.locale));
  const fresh = await getBookingStore().getById(reservation.id);
  return { status: "pay", values, payment: result, expiresAt: fresh?.expiresAt ?? reservation.expiresAt ?? undefined };
}

/** Test mode only: what the card form would do. */
export async function completeTestPayment(input: { ref: string; token: string; locale: "en" | "el"; paymentRef: string; outcome: "success" | "decline"; manage?: boolean }) {
  const v = linkSchema.extend({ paymentRef: z.string().startsWith("test_pi_"), outcome: z.enum(["success", "decline"]), manage: z.boolean().optional() }).parse(input);
  const r = await findReservation(v.ref, v.token, { manage: v.manage });
  if (!r) return { ok: false as const, error: "notFound" as const };
  const deps = await paymentDeps();
  if (deps.provider.id !== "test") return { ok: false as const, error: "generic" as const };
  const row = await deps.store.getPayment(v.paymentRef);
  if (!row || row.reservationId !== r.id) return { ok: false as const, error: "notFound" as const };
  const { testProvider } = await import("@/lib/payments/test-provider");
  const p = testProvider.simulateCheckout(v.paymentRef, v.outcome);
  await syncPayment(deps, p);
  return p.status === "succeeded" ? { ok: true as const } : { ok: false as const, error: "paymentFailed" as const };
}

/** Manage page: prepare an on-session payment of the outstanding balance. */
export async function prepareBalancePayment(input: { ref: string; token: string; locale: "en" | "el" }): Promise<
  { ok: true; payment: PaymentIntentInfo } | { ok: true; paid: true } | { ok: false; error: "notFound" | "notPayable" | "generic" }
> {
  const v = linkSchema.parse(input);
  if (rateLimited(`pay:${await clientIp()}`, 12, 15 * 60 * 1000)) return { ok: false, error: "generic" };
  const r = await findReservation(v.ref, v.token, { manage: true });
  if (!r) return { ok: false, error: "notFound" };
  try {
    const res = await beginBalancePayment(await paymentDeps(), r);
    if (!res.ok) return { ok: false, error: "notPayable" };
    return "paid" in res ? { ok: true, paid: true } : { ok: true, payment: res };
  } catch (e) {
    console.error(`[booking] balance payment for ${v.ref} failed`, e);
    return { ok: false, error: "generic" };
  }
}

export type CancelState = { status: "idle" | "error"; error?: "confirm" | "notAllowed" | "generic" };

/** Manage page: guest cancels; refund per the cancellation tiers. */
export async function cancelBooking(_: CancelState, form: FormData): Promise<CancelState> {
  const parsed = linkSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", error: "generic" };
  if (form.get("confirm") !== "on") return { status: "error", error: "confirm" };
  const v = parsed.data;
  const r = await findReservation(v.ref, v.token, { manage: true });
  if (!r) return { status: "error", error: "generic" };
  try {
    const deps = await paymentDeps();
    const res = await cancelReservation(deps, r, todayIn(deps.config.timeZone), { by: "guest" });
    if (!res.ok) return { status: "error", error: "notAllowed" };
  } catch (e) {
    console.error(`[booking] cancellation of ${v.ref} failed`, e);
    return { status: "error", error: "generic" };
  }
  redirect(getPathname({ href: { pathname: "/book/manage", query: { ref: v.ref, t: v.token } }, locale: v.locale }));
}
