/**
 * Real Stripe TEST-mode run of the payment service (network). Skipped unless STRIPE_E2E=1.
 *   STRIPE_E2E=1 STRIPE_SECRET_KEY=sk_test_… npx vitest run src/lib/payments/stripe.e2e.test.ts
 * (behind an HTTPS proxy add NODE_USE_ENV_PROXY=1)
 * Refuses to run with a live key. Uses Stripe's test payment methods (pm_card_visa …), a temporary
 * local store, and checks the webhook route's verification with real event payloads.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Stripe from "stripe";
import { beforeAll, describe, expect, it } from "vitest";
import { bookingSeed } from "@content/booking";
import { quoteStay } from "@/lib/booking/pricing";
import { FileStore, type BookingStore } from "@/lib/booking/store";
import { createStripeProvider } from "./stripe";
import {
  beginCheckout,
  cancelReservation,
  chargeBalances,
  manageSecurityHolds,
  paidCents,
  syncPayment,
  type Deps,
  type Notifier,
} from "./service";

const key = process.env.STRIPE_SECRET_KEY ?? "";
const run = process.env.STRIPE_E2E === "1";
const suite = run ? describe : describe.skip;
const webhookSecret = "whsec_local_e2e";

suite("Stripe test mode (network)", { timeout: 60_000 }, () => {
  // created in beforeAll: a skipped suite still collects this callback
  let stripe: Stripe;
  let provider: ReturnType<typeof createStripeProvider>;
  const config = bookingSeed;
  let store: BookingStore;
  let deps: Deps;
  const sent: string[] = [];
  const notify: Notifier = {
    confirmed: async (r) => void sent.push(`confirmed:${r.ref}`),
    balancePaid: async (r) => void sent.push(`balancePaid:${r.ref}`),
    balanceFailed: async (r, reason) => void sent.push(`balanceFailed:${r.ref}:${reason}`),
    cancelled: async (r, c) => void sent.push(`cancelled:${r.ref}:${c}`),
    conflictRefunded: async (r, c) => void sent.push(`conflict:${r.ref}:${c}`),
    securityHoldFailed: async (r, reason) => void sent.push(`securityFailed:${r.ref}:${reason}`),
    paymentRequest: async (r) => void sent.push(`paymentRequest:${r.ref}`),
  };
  let n = 0;
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);

  async function book(checkIn: string, checkOut: string) {
    const ref = `CA-${stamp}-${String(++n).padStart(2, "0")}`;
    const quote = quoteStay(config, { checkIn, checkOut, guests: 4 }, "2026-11-21");
    const r = (await store.createHold({ ref, tokenHash: "h", checkIn, checkOut, guests: 4, locale: "en", quote, holdMinutes: 15 }))!;
    const res = await beginCheckout(deps, r, { name: "E2E Test Guest", email: `e2e+${ref.toLowerCase()}@example.com` });
    if (!res.ok || !("paymentRef" in res)) throw new Error("no payment");
    // what the Payment Element does in the browser, with Stripe's test Visa
    await stripe.paymentIntents.confirm(res.paymentRef, { payment_method: "pm_card_visa", return_url: "https://example.com/return" });
    await syncPayment(deps, await provider.retrieve(res.paymentRef));
    return { r: (await store.getById(r.id))!, paymentRef: res.paymentRef };
  }

  beforeAll(async () => {
    expect(key.startsWith("sk_test_") || key.startsWith("rk_test_"), "a TEST key is required").toBe(true);
    stripe = new Stripe(key, { maxNetworkRetries: 2, httpClient: Stripe.createFetchHttpClient() });
    provider = createStripeProvider(key, "pk_test_unused", webhookSecret);
    const balance = await stripe.balance.retrieve();
    expect(balance.livemode, "refusing to run against a live Stripe account").toBe(false);
    store = new FileStore(path.join(await mkdtemp(path.join(tmpdir(), "cape-stripe-")), "booking.json"));
    deps = { store, provider, config, notify };
  });

  it("deposit: PaymentIntent with saved card, confirmation, one email", async () => {
    const { r, paymentRef } = await book("2027-06-12", "2027-06-19");
    expect(r.status).toBe("confirmed");
    expect(r.providerCustomerId).toMatch(/^cus_/);
    expect(r.paymentMethodId).toMatch(/^pm_/);
    const pi = await stripe.paymentIntents.retrieve(paymentRef);
    expect(pi).toMatchObject({ status: "succeeded", amount: r.quote.payment.depositCents, currency: "eur", setup_future_usage: "off_session" });
    expect(pi.metadata).toMatchObject({ ref: r.ref, kind: "deposit" });
    await syncPayment(deps, await provider.retrieve(paymentRef)); // a second webhook changes nothing
    expect(sent.filter((s) => s === `confirmed:${r.ref}`)).toHaveLength(1);
  });

  it("balance: charged off-session on the due date, exactly once", async () => {
    const { r } = await book("2027-07-10", "2027-07-17");
    const due = r.balanceDueDate!;
    expect(await chargeBalances(deps, due)).toMatchObject({ charged: 1, failed: 0 });
    expect(await chargeBalances(deps, due)).toMatchObject({ charged: 0, failed: 0 });
    const payments = await store.listPayments(r.id);
    expect(paidCents(payments)).toBe(r.totalCents);
    const bal = payments.find((p) => p.kind === "balance")!;
    expect((await stripe.paymentIntents.retrieve(bal.providerRef)).status).toBe("succeeded");
    expect(sent).toContain(`balancePaid:${r.ref}`);
  });

  it("balance: a declined saved card is recorded and the guest is told", async () => {
    const { r } = await book("2027-08-07", "2027-08-14");
    // swap the saved card for Stripe's "attaches fine, charges fail" test card
    const failing = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: r.providerCustomerId! });
    await store.setPaymentProfile(r.id, { paymentMethodId: failing.id });
    expect(await chargeBalances(deps, r.balanceDueDate!)).toMatchObject({ charged: 0, failed: 1 });
    expect(sent.some((s) => s.startsWith(`balanceFailed:${r.ref}:`))).toBe(true);
    expect((await store.listPayments(r.id)).find((p) => p.kind === "balance")?.status).toBe("failed");
  });

  it("security deposit: authorised (manual capture) on arrival, released after the check", async () => {
    const { r } = await book("2027-09-04", "2027-09-08");
    expect(await manageSecurityHolds(deps, "2027-09-04")).toMatchObject({ placed: 1, failed: 0 });
    const sec = (await store.listPayments(r.id)).find((p) => p.kind === "security_deposit")!;
    const pi = await stripe.paymentIntents.retrieve(sec.providerRef);
    expect(pi).toMatchObject({ status: "requires_capture", capture_method: "manual", amount: config.payment.securityDeposit * 100 });
    expect(await manageSecurityHolds(deps, "2027-09-10")).toMatchObject({ released: 1 });
    expect((await stripe.paymentIntents.retrieve(sec.providerRef)).status).toBe("canceled");
  });

  it("cancellation: refunds the tier percentage through Stripe", async () => {
    const { r, paymentRef } = await book("2027-10-02", "2027-10-09");
    const res = await cancelReservation(deps, r, "2027-08-18"); // 45 days before → 50%
    expect(res).toMatchObject({ ok: true, refundCents: Math.round(r.quote.payment.depositCents / 2) });
    const refunds = await stripe.refunds.list({ payment_intent: paymentRef });
    expect(refunds.data.reduce((s, x) => s + x.amount, 0)).toBe(Math.round(r.quote.payment.depositCents / 2));
    expect((await store.getById(r.id))!.status).toBe("cancelled");
  });

  it("webhook: verifies real event payloads signed with the endpoint secret", async () => {
    const events = await stripe.events.list({ type: "payment_intent.succeeded", limit: 1 });
    expect(events.data.length).toBe(1);
    const body = JSON.stringify(events.data[0]);
    const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret: webhookSecret });
    const ev = await provider.parseWebhook(body, new Headers({ "stripe-signature": header }));
    expect(ev).toMatchObject({ id: events.data[0].id, type: "payment.updated" });
    await expect(provider.parseWebhook(body, new Headers({ "stripe-signature": header.replace(/v1=\w/, "v1=0") }))).rejects.toThrow();
  });
});
