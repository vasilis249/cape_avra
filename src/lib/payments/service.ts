import "server-only";
import type { BookingConfig } from "@/lib/booking/config-schema";
import { addDays, diffDays, type ISODate } from "@/lib/booking/dates";
import { refundFor } from "@/lib/booking/pricing";
import type { BookingStore, GuestDetails, Payment, PaymentKind, Reservation } from "@/lib/booking/store";
import type { PaymentProvider, ProviderPayment } from "./provider";

/**
 * Payment rules of the booking engine. Every entry point is idempotent: webhooks may arrive twice,
 * out of order, or race with the confirmation page; the store's atomic transitions decide who acts.
 */

export type Notifier = {
  confirmed(r: Reservation, payments: Payment[]): Promise<void>;
  balancePaid(r: Reservation, payments: Payment[]): Promise<void>;
  /** automatic balance charge failed: guest gets a link to pay, owner is told */
  balanceFailed(r: Reservation, reason: string, amountCents?: number): Promise<void>;
  cancelled(r: Reservation, refundCents: number, payments: Payment[]): Promise<void>;
  /** paid after the hold expired and someone else took the dates: refunded in full */
  conflictRefunded(r: Reservation, refundCents: number): Promise<void>;
  /** owner only */
  securityHoldFailed(r: Reservation, reason: string): Promise<void>;
  /** owner booking: the guest's link to pay and confirm */
  paymentRequest(r: Reservation, url: string): Promise<void>;
};

export type Deps = { store: BookingStore; provider: PaymentProvider; config: BookingConfig; notify: Notifier };

/** a hold is extended while the guest is paying (3-D Secure can take a few minutes) */
export const PAYING_HOLD_MINUTES = 20;

const STAY_KINDS: PaymentKind[] = ["deposit", "full", "balance"];
export const paidCents = (payments: Payment[]) =>
  payments.filter((p) => STAY_KINDS.includes(p.kind) && p.status === "succeeded").reduce((s, p) => s + p.amountCents - p.refundedCents, 0);
const grossPaid = (payments: Payment[]) => payments.filter((p) => STAY_KINDS.includes(p.kind) && p.status === "succeeded").reduce((s, p) => s + p.amountCents, 0);
export const outstandingCents = (r: Reservation, payments: Payment[]) => Math.max(0, r.totalCents - grossPaid(payments));

const describe = (r: Reservation, what: string) => `Cape Avra ${r.ref} · ${r.checkIn} → ${r.checkOut} · ${what}`;

/* --------------------------------------------------------------- checkout */

export type CheckoutPayment =
  | { ok: true; paymentRef: string; clientSecret: string; amountCents: number }
  | { ok: true; paid: true }
  | { ok: false; code: "expired" | "notPayable" };

/** Step 2 of checkout: store the guest's details, extend the hold and prepare the on-session payment. */
export async function beginCheckout(deps: Deps, reservation: Reservation, guest: GuestDetails): Promise<CheckoutPayment> {
  const { store, provider, config } = deps;
  if (reservation.status === "confirmed") return { ok: true, paid: true };
  const r = await store.saveGuest(reservation.id, guest, PAYING_HOLD_MINUTES);
  if (!r) return { ok: false, code: "expired" };

  const amountCents = r.quote.payment.depositCents;
  const kind: PaymentKind = r.quote.payment.mode === "full" ? "full" : "deposit";
  if (amountCents <= 0) return { ok: false, code: "notPayable" };

  let customerId = r.providerCustomerId;
  if (!customerId) {
    customerId = await provider.createCustomer({ name: guest.name, email: guest.email, phone: guest.phone, ref: r.ref });
    await store.setPaymentProfile(r.id, { customerId });
  }

  // re-entering checkout reuses the open payment (so a guest never pays twice for one stay)
  const open = (await store.listPayments(r.id)).filter((p) => (p.kind === "deposit" || p.kind === "full") && (p.status === "pending" || p.status === "failed"));
  for (const p of open.reverse()) {
    let current = await provider.retrieve(p.providerRef);
    if (current.status === "succeeded") {
      await syncPayment(deps, current);
      return { ok: true, paid: true };
    }
    if (current.status === "canceled" || !current.clientSecret) continue;
    if (current.amountCents !== amountCents) current = await provider.updateAmount(p.providerRef, amountCents);
    return { ok: true, paymentRef: current.ref, clientSecret: current.clientSecret!, amountCents };
  }

  const saveCard = r.quote.payment.balanceCents > 0 || config.payment.securityDeposit > 0;
  const created = await provider.createPayment({
    amountCents,
    currency: r.currency,
    customerId,
    saveCard,
    meta: { reservationId: r.id, ref: r.ref, kind },
    idempotencyKey: `checkout-${r.id}-${open.length}`,
    description: describe(r, kind === "full" ? "payment in full" : "deposit"),
  });
  await store.createPayment({ reservationId: r.id, kind, provider: provider.id, providerRef: created.ref, amountCents, currency: r.currency, status: "pending" });
  return { ok: true, paymentRef: created.ref, clientSecret: created.clientSecret!, amountCents };
}

/** Manage page: pay the outstanding balance now (or after an automatic charge failed). */
export async function beginBalancePayment(deps: Deps, r: Reservation): Promise<CheckoutPayment> {
  const { store, provider } = deps;
  if (r.status !== "confirmed") return { ok: false, code: "notPayable" };
  const payments = await store.listPayments(r.id);
  const amountCents = outstandingCents(r, payments);
  if (amountCents <= 0) return { ok: true, paid: true };

  const pending = payments.find((p) => p.kind === "balance" && p.status === "pending");
  if (pending) {
    let current = await provider.retrieve(pending.providerRef);
    if (current.status === "succeeded") {
      await syncPayment(deps, current);
      return { ok: true, paid: true };
    }
    if (current.status !== "canceled" && current.clientSecret) {
      if (current.amountCents !== amountCents) current = await provider.updateAmount(current.ref, amountCents);
      return { ok: true, paymentRef: current.ref, clientSecret: current.clientSecret!, amountCents };
    }
    await store.updatePayment(pending.providerRef, { status: "canceled" });
  }
  const attempt = payments.filter((p) => p.kind === "balance").length;
  const created = await provider.createPayment({
    amountCents,
    currency: r.currency,
    customerId: r.providerCustomerId,
    saveCard: true,
    meta: { reservationId: r.id, ref: r.ref, kind: "balance" },
    idempotencyKey: `balance-manual-${r.id}-${attempt}`,
    description: describe(r, "balance"),
  });
  await store.createPayment({ reservationId: r.id, kind: "balance", provider: provider.id, providerRef: created.ref, amountCents, currency: r.currency, status: "pending" });
  return { ok: true, paymentRef: created.ref, clientSecret: created.clientSecret!, amountCents };
}

/* -------------------------------------------------- provider state → booking */

/**
 * Apply the provider's view of one payment (from a webhook, the confirmation page or a job).
 * Safe to call any number of times, concurrently.
 */
export async function syncPayment(deps: Deps, p: ProviderPayment): Promise<void> {
  const { store } = deps;
  let row = await store.getPayment(p.ref);
  if (!row) {
    // created at the provider but not recorded (crash in between): adopt it from its metadata
    const reservationId = p.metadata.reservation_id;
    const kind = p.metadata.kind as PaymentKind;
    if (!reservationId || !["deposit", "full", "balance", "security_deposit"].includes(kind)) return;
    const r = await store.getById(reservationId);
    if (!r) return;
    try {
      row = await store.createPayment({ reservationId, kind, provider: deps.provider.id, providerRef: p.ref, amountCents: p.amountCents, currency: r.currency, status: "pending" });
    } catch {
      row = await store.getPayment(p.ref);
      if (!row) throw new Error(`could not record payment ${p.ref}`);
    }
  }

  if (p.refundedCents > row.refundedCents) await store.updatePayment(p.ref, { refundedCents: p.refundedCents });

  switch (p.status) {
    case "succeeded": {
      if (row.kind === "security_deposit") {
        await store.transitionPayment(p.ref, ["pending", "authorized"], { status: "captured" });
        return;
      }
      const first = await store.transitionPayment(p.ref, ["pending", "failed", "canceled"], { status: "succeeded", failure: null });
      if (p.customerId || p.paymentMethodId) await store.setPaymentProfile(row.reservationId, { customerId: p.customerId, paymentMethodId: p.paymentMethodId });
      if (row.kind === "balance") {
        if (first) {
          const r = (await store.getById(row.reservationId))!;
          await deps.notify.balancePaid(r, await store.listPayments(r.id)).catch((e) => console.error(`[payments] balance email ${r.ref}`, e));
        }
        return;
      }
      // deposit / full: confirm (also runs when a previous attempt confirmed but crashed before emailing)
      await confirmAfterPayment(deps, row.reservationId, p.ref);
      return;
    }
    case "authorized":
      await store.transitionPayment(p.ref, ["pending"], { status: "authorized" });
      return;
    case "failed": {
      const changed = await store.transitionPayment(p.ref, ["pending"], { status: "failed", failure: p.failure });
      if (changed && row.kind === "balance") {
        const r = (await store.getById(row.reservationId))!;
        await deps.notify.balanceFailed(r, p.failure ?? "failed").catch((e) => console.error(`[payments] balance-failed email ${r.ref}`, e));
      }
      if (changed && row.kind === "security_deposit") {
        const r = (await store.getById(row.reservationId))!;
        await deps.notify.securityHoldFailed(r, p.failure ?? "failed").catch((e) => console.error(`[payments] security email ${r.ref}`, e));
      }
      return;
    }
    case "canceled":
      await store.transitionPayment(p.ref, ["pending", "authorized", "failed"], { status: "canceled" });
      return;
    default:
      return; // pending / action required: nothing to do yet
  }
}

async function confirmAfterPayment(deps: Deps, reservationId: string, paymentRef: string) {
  const { store, notify } = deps;
  const confirmed = await store.confirmPaid(reservationId);
  if (!confirmed) {
    // the hold expired and the dates were taken (or blocked) meanwhile: give the money back
    const payment = (await store.getPayment(paymentRef))!;
    const due = payment.amountCents - payment.refundedCents;
    if (due > 0) {
      const { refundedCents } = await refundVia(deps, payment, due, `conflict-${paymentRef}`);
      await store.updatePayment(paymentRef, { refundedCents });
    }
    const r = await store.cancel(reservationId, { by: "system", at: new Date().toISOString(), refundPercent: 100, refundCents: due, reason: "dates-taken" });
    if (r && (await store.claimEmail(r.id, "cancellation"))) {
      await notify.conflictRefunded(r, due).catch(async (e) => {
        console.error(`[payments] conflict email ${r.ref}`, e);
        await store.releaseEmail(r.id, "cancellation");
      });
    }
    return;
  }
  if (await store.claimEmail(confirmed.id, "confirmation")) {
    try {
      await notify.confirmed(confirmed, await store.listPayments(confirmed.id));
    } catch (e) {
      console.error(`[payments] confirmation emails ${confirmed.ref}`, e);
      await store.releaseEmail(confirmed.id, "confirmation");
    }
  }
}

/** Confirmation page: ask the provider about payments still pending (webhook late or not configured). */
export async function reconcileReservation(deps: Deps, r: Reservation): Promise<Reservation> {
  const pending = (await deps.store.listPayments(r.id)).filter((p) => p.status === "pending" || (p.status === "failed" && r.status !== "confirmed"));
  for (const p of pending) await syncPayment(deps, await deps.provider.retrieve(p.providerRef));
  return (await deps.store.getById(r.id)) ?? r;
}

/* ----------------------------------------------------------- cancellation */

export type CancellationPreview = { allowed: boolean; daysBefore: number; percent: number; paidCents: number; refundCents: number };

export function cancellationPreview(config: BookingConfig, r: Reservation, payments: Payment[], today: ISODate): CancellationPreview {
  const daysBefore = diffDays(today, r.checkIn);
  const paid = paidCents(payments);
  const { percent, cents } = refundFor(config, paid, daysBefore);
  return { allowed: r.status === "confirmed" && daysBefore > 0, daysBefore, percent, paidCents: paid, refundCents: cents };
}

/** Guest (or, later, the owner) cancels: refund per the tiers, release holds, stop the balance charge. */
export async function cancelReservation(
  deps: Deps,
  r: Reservation,
  today: ISODate,
  opts: { by?: "guest" | "owner"; reason?: string; /** owner only: refund this instead of the policy amount */ refundCents?: number } = {},
) {
  const { store, provider, config, notify } = deps;
  const by = opts.by ?? "guest";
  const payments = await store.listPayments(r.id);
  const preview = cancellationPreview(config, r, payments, today);
  if (by === "guest" ? !preview.allowed : r.status !== "confirmed") return { ok: false as const, code: "notAllowed" as const };
  const refundCents = by === "owner" && opts.refundCents !== undefined ? Math.max(0, Math.min(Math.round(opts.refundCents), preview.paidCents)) : preview.refundCents;
  const refundPercent = preview.paidCents > 0 ? Math.round((refundCents / preview.paidCents) * 100) : 0;

  const cancelled = await store.cancel(r.id, { by, at: new Date().toISOString(), refundPercent, refundCents, reason: opts.reason });
  if (!cancelled) return { ok: false as const, code: "notAllowed" as const };

  // refund newest payments first (normally the balance, then the deposit)
  let left = refundCents;
  for (const p of [...payments].reverse()) {
    if (left <= 0) break;
    if (!STAY_KINDS.includes(p.kind) || p.status !== "succeeded") continue;
    const amount = Math.min(left, p.amountCents - p.refundedCents);
    if (amount <= 0) continue;
    const { refundedCents } = await refundVia(deps, p, amount, `cancel-${r.id}-${p.providerRef}`);
    await store.updatePayment(p.providerRef, { refundedCents });
    left -= amount;
  }
  // nothing else may be charged or held
  for (const p of payments) {
    if (p.status === "pending" || p.status === "authorized") {
      const after = await provider.cancel(p.providerRef);
      await syncPayment(deps, after);
    }
  }
  const finalPayments = await store.listPayments(r.id);
  if (await store.claimEmail(r.id, "cancellation")) {
    await notify.cancelled(cancelled, refundCents, finalPayments).catch(async (e) => {
      console.error(`[payments] cancellation emails ${r.ref}`, e);
      await store.releaseEmail(r.id, "cancellation");
    });
  }
  return { ok: true as const, reservation: cancelled, refundCents };
}

/* ------------------------------------------------------------ owner tools */

/** Payments taken outside the site (bank transfer, cash) are refunded by the owner the same way: we only record it. */
export const MANUAL_PROVIDER = "manual";
async function refundVia(deps: Deps, p: Payment, amountCents: number, idempotencyKey: string): Promise<{ refundedCents: number }> {
  if (p.provider === MANUAL_PROVIDER) return { refundedCents: Math.min(p.amountCents, p.refundedCents + amountCents) };
  return deps.provider.refund(p.providerRef, amountCents, idempotencyKey);
}

/**
 * Record a payment received outside the site. The first one confirms a booking that is awaiting payment
 * (if its dates are still free); later ones count towards the balance.
 */
export async function recordManualPayment(deps: Deps, r: Reservation, input: { amountCents: number; method: "transfer" | "cash" | "other" }) {
  const { store, notify } = deps;
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false as const, code: "amount" as const };
  if (r.status !== "hold" && r.status !== "expired" && r.status !== "confirmed") return { ok: false as const, code: "notPayable" as const };
  const payments = await store.listPayments(r.id);
  if (amount > outstandingCents(r, payments)) return { ok: false as const, code: "amount" as const };

  const first = r.status !== "confirmed";
  if (first) {
    const confirmed = await store.confirmPaid(r.id);
    if (!confirmed) return { ok: false as const, code: "unavailable" as const };
  }
  const kind: PaymentKind = first ? (amount >= r.totalCents ? "full" : "deposit") : "balance";
  await store.createPayment({
    reservationId: r.id,
    kind,
    provider: MANUAL_PROVIDER,
    providerRef: `manual-${input.method}-${crypto.randomUUID()}`,
    amountCents: amount,
    currency: r.currency,
    status: "succeeded",
  });
  // the guest paid another way: no automatic card charge for the balance unless they pay online later
  const after = (await store.getById(r.id))!;
  const all = await store.listPayments(r.id);
  if (first) {
    if (await store.claimEmail(after.id, "confirmation")) {
      await notify.confirmed(after, all).catch(async (e) => {
        console.error(`[payments] confirmation emails ${r.ref}`, e);
        await store.releaseEmail(after.id, "confirmation");
      });
    }
  } else {
    await notify.balancePaid(after, all).catch((e) => console.error(`[payments] balance email ${r.ref}`, e));
  }
  return { ok: true as const, reservation: after };
}

/** Partial refund without cancelling (goodwill, a broken appliance…). */
export async function refundPayment(deps: Deps, r: Reservation, paymentRef: string, cents: number) {
  const p = await deps.store.getPayment(paymentRef);
  if (!p || p.reservationId !== r.id || !STAY_KINDS.includes(p.kind) || p.status !== "succeeded") return { ok: false as const, code: "notRefundable" as const };
  const amount = Math.round(cents);
  if (amount <= 0 || amount > p.amountCents - p.refundedCents) return { ok: false as const, code: "tooMuch" as const };
  // key includes the state, so a double submit is deduplicated but a later second refund is not
  const { refundedCents } = await refundVia(deps, p, amount, `manual-${paymentRef}-${p.refundedCents}-${amount}`);
  await deps.store.updatePayment(paymentRef, { refundedCents });
  return { ok: true as const, refundedCents };
}

/** Keep part (or all) of the security deposit; the rest of the authorisation is released by the card network. */
export async function keepSecurityDeposit(deps: Deps, r: Reservation, paymentRef: string, cents: number) {
  const p = await deps.store.getPayment(paymentRef);
  if (!p || p.reservationId !== r.id || p.kind !== "security_deposit" || p.status !== "authorized") return { ok: false as const, code: "notAuthorized" as const };
  const amount = Math.round(cents);
  if (amount <= 0 || amount > p.amountCents) return { ok: false as const, code: "tooMuch" as const };
  const captured = await deps.provider.capture(paymentRef, amount);
  await deps.store.updatePayment(paymentRef, { amountCents: amount });
  await syncPayment(deps, captured);
  return { ok: true as const };
}

export async function releaseSecurityDeposit(deps: Deps, r: Reservation, paymentRef: string) {
  const p = await deps.store.getPayment(paymentRef);
  if (!p || p.reservationId !== r.id || p.kind !== "security_deposit" || p.status !== "authorized") return { ok: false as const, code: "notAuthorized" as const };
  await syncPayment(deps, await deps.provider.cancel(paymentRef));
  return { ok: true as const };
}

/* ------------------------------------------------------------------- jobs */

/** Automatic, off-session balance charges (daily). */
export async function chargeBalances(deps: Deps, today: ISODate) {
  const { store, provider } = deps;
  const out = { charged: 0, failed: 0 };
  for (const r of await store.balancesDue(today)) {
    const payments = await store.listPayments(r.id);
    const amountCents = outstandingCents(r, payments);
    if (amountCents <= 0) continue;
    if (!r.providerCustomerId || !r.paymentMethodId) {
      await store.createPayment({ reservationId: r.id, kind: "balance", provider: provider.id, providerRef: `nocard-${r.id}`, amountCents, currency: r.currency, status: "failed", failure: "no_saved_card" }).catch(() => {});
      await deps.notify.balanceFailed(r, "no_saved_card", amountCents).catch((e) => console.error(`[payments] balance-failed email ${r.ref}`, e));
      out.failed++;
      continue;
    }
    try {
      const p = await provider.chargeSaved({
        amountCents,
        currency: r.currency,
        customerId: r.providerCustomerId,
        paymentMethodId: r.paymentMethodId,
        meta: { reservationId: r.id, ref: r.ref, kind: "balance" },
        idempotencyKey: `balance-auto-${r.id}`,
        description: describe(r, "balance"),
      });
      if (!(await store.getPayment(p.ref))) {
        await store.createPayment({ reservationId: r.id, kind: "balance", provider: provider.id, providerRef: p.ref, amountCents, currency: r.currency, status: "pending" });
      }
      await syncPayment(deps, p);
      if (p.status === "succeeded") out.charged++;
      if (p.status === "failed") out.failed++;
    } catch (e) {
      out.failed++;
      console.error(`[payments] balance charge ${r.ref} errored`, e); // retried on the next run (idempotency key)
    }
  }
  return out;
}

/** Security deposit: authorise during the stay, release after the check. Cards keep an authorisation ~7 days, so it is re-placed when it lapses. */
export async function manageSecurityHolds(deps: Deps, today: ISODate) {
  const { store, provider, config } = deps;
  const out = { placed: 0, released: 0, failed: 0 };
  const releaseDays = config.payment.securityDepositReleaseDays;
  for (const p of await store.securityHoldsToRelease(today, releaseDays)) {
    try {
      await syncPayment(deps, await provider.cancel(p.providerRef));
      out.released++;
    } catch (e) {
      console.error(`[payments] release ${p.providerRef}`, e);
    }
  }
  const amountCents = Math.round(config.payment.securityDeposit * 100);
  if (amountCents <= 0) return out;
  for (const r of await store.securityHoldsToPlace(today, releaseDays)) {
    const attempt = (await store.listPayments(r.id)).filter((p) => p.kind === "security_deposit").length;
    try {
      const p = await provider.authorize({
        amountCents,
        currency: r.currency,
        customerId: r.providerCustomerId!,
        paymentMethodId: r.paymentMethodId!,
        meta: { reservationId: r.id, ref: r.ref, kind: "security_deposit" },
        idempotencyKey: `security-${r.id}-${attempt}`,
        description: describe(r, "security deposit (authorisation only)"),
      });
      if (!(await store.getPayment(p.ref))) {
        await store.createPayment({ reservationId: r.id, kind: "security_deposit", provider: provider.id, providerRef: p.ref, amountCents, currency: r.currency, status: "pending" });
      }
      await syncPayment(deps, p);
      if (p.status === "authorized") out.placed++;
      else out.failed++;
    } catch (e) {
      out.failed++;
      console.error(`[payments] security hold ${r.ref} errored`, e);
    }
  }
  return out;
}

/** Owner keeps (part of) the security deposit after damage. Used by the admin panel (Phase 5). */
export async function captureSecurityDeposit(deps: Deps, paymentRef: string, amountCents: number) {
  const p = await deps.provider.capture(paymentRef, amountCents);
  await syncPayment(deps, p);
  return p;
}

/** Checkout payments of holds that expired without payment: cancel them so they cannot be paid later. */
export async function cancelAbandoned(deps: Deps) {
  let n = 0;
  for (const p of await deps.store.abandonedPayments()) {
    try {
      // a late success (guest finished 3-D Secure just now) is handled by syncPayment: confirm if free, else refund
      await syncPayment(deps, await deps.provider.cancel(p.providerRef));
      n++;
    } catch (e) {
      console.error(`[payments] cancel abandoned ${p.providerRef}`, e);
    }
  }
  return n;
}

export const balanceDueDate = (r: Reservation, config: BookingConfig) => r.balanceDueDate ?? addDays(r.checkIn, -config.payment.balanceDaysBeforeArrival);
