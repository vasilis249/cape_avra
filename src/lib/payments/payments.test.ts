/**
 * Payment flows end to end against the booking store (local file store; the Postgres store's
 * equivalents are covered in store.pg.test.ts) with the simulated provider. The Stripe adapter's
 * webhook signature check uses Stripe's own test-header helper (no network).
 */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { bookingSeed } from "@content/booking";
import { quoteStay } from "@/lib/booking/pricing";
import { FileStore, type BookingStore, type Reservation } from "@/lib/booking/store";
import { createStripeProvider } from "./stripe";
import { testProvider } from "./test-provider";
import {
  beginBalancePayment,
  beginCheckout,
  cancelAbandoned,
  cancellationPreview,
  cancelReservation,
  chargeBalances,
  manageSecurityHolds,
  paidCents,
  syncPayment,
  type Deps,
  type Notifier,
} from "./service";

const config = bookingSeed;
let file: string;
let store: BookingStore;
let sent: string[];
let deps: Deps;
let n = 0;

const notify: Notifier = {
  confirmed: async (r) => void sent.push(`confirmed:${r.ref}`),
  balancePaid: async (r) => void sent.push(`balancePaid:${r.ref}`),
  balanceFailed: async (r, reason) => void sent.push(`balanceFailed:${r.ref}:${reason}`),
  cancelled: async (r, cents) => void sent.push(`cancelled:${r.ref}:${cents}`),
  conflictRefunded: async (r, cents) => void sent.push(`conflict:${r.ref}:${cents}`),
  securityHoldFailed: async (r) => void sent.push(`securityFailed:${r.ref}`),
};

async function hold(checkIn: string, checkOut: string) {
  const ref = `CA-T${String(++n).padStart(3, "0")}-XX`;
  const quote = quoteStay(config, { checkIn, checkOut, guests: 4 }, "2026-11-21");
  return (await store.createHold({ ref, tokenHash: "h", checkIn, checkOut, guests: 4, locale: "en", quote, holdMinutes: 15 }))!;
}
const guest = (email = "guest@example.com") => ({ name: "Test Guest", email, phone: "+30 690 000 0000" });

/** checkout + simulated card → confirmed reservation */
async function book(checkIn: string, checkOut: string, email?: string) {
  const r = await hold(checkIn, checkOut);
  const res = await beginCheckout(deps, r, guest(email));
  if (!res.ok || !("paymentRef" in res)) throw new Error("no payment");
  await syncPayment(deps, testProvider.simulateCheckout(res.paymentRef, "success"));
  return (await store.getById(r.id))!;
}

async function editFile(fn: (db: { reservations: Reservation[] }) => void) {
  const db = JSON.parse(await readFile(file, "utf8"));
  fn(db);
  await writeFile(file, JSON.stringify(db));
}

beforeEach(async () => {
  file = path.join(await mkdtemp(path.join(tmpdir(), "cape-pay-")), "booking.json");
  store = new FileStore(file);
  sent = [];
  deps = { store, provider: testProvider, config, notify };
});

describe("checkout payment", () => {
  it("confirms once paid, saves the card, and emails exactly once", async () => {
    const r = await hold("2027-06-12", "2027-06-19");
    const res = await beginCheckout(deps, r, guest());
    expect(res.ok && "paymentRef" in res && res.amountCents).toBe(r.quote.payment.depositCents);
    if (!res.ok || !("paymentRef" in res)) throw new Error();

    const paid = testProvider.simulateCheckout(res.paymentRef, "success");
    await Promise.all([syncPayment(deps, paid), syncPayment(deps, paid), syncPayment(deps, paid)]); // webhook retries + confirmation page
    const after = (await store.getById(r.id))!;
    expect(after.status).toBe("confirmed");
    expect(after.paymentMethodId).toMatch(/^test_pm_/);
    expect(after.providerCustomerId).toMatch(/^test_cus_/);
    expect(sent).toEqual([`confirmed:${r.ref}`]);
    expect(paidCents(await store.listPayments(r.id))).toBe(r.quote.payment.depositCents);
  });

  it("re-entering checkout reuses the open payment instead of creating another", async () => {
    const r = await hold("2027-06-12", "2027-06-19");
    const a = await beginCheckout(deps, r, guest());
    const b = await beginCheckout(deps, (await store.getById(r.id))!, guest());
    expect(a.ok && "paymentRef" in a && a.paymentRef).toBe(b.ok && "paymentRef" in b && b.paymentRef);
    expect(await store.listPayments(r.id)).toHaveLength(1);
  });

  it("a declined card leaves the hold; a retry with the same payment confirms", async () => {
    const r = await hold("2027-06-12", "2027-06-19");
    const res = await beginCheckout(deps, r, guest());
    if (!res.ok || !("paymentRef" in res)) throw new Error();
    await syncPayment(deps, testProvider.simulateCheckout(res.paymentRef, "decline"));
    expect((await store.getById(r.id))!.status).toBe("hold");
    expect((await store.getPayment(res.paymentRef))!.status).toBe("failed");
    await syncPayment(deps, testProvider.simulateCheckout(res.paymentRef, "success"));
    expect((await store.getById(r.id))!.status).toBe("confirmed");
  });

  it("refuses to extend an expired hold", async () => {
    const r = await hold("2027-06-12", "2027-06-19");
    await editFile((db) => (db.reservations[0].expiresAt = new Date(Date.now() - 1000).toISOString()));
    expect(await beginCheckout(deps, r, guest())).toEqual({ ok: false, code: "expired" });
  });

  it("late payment for dates taken meanwhile is refunded in full and the guest is told", async () => {
    const r = await hold("2027-07-03", "2027-07-10");
    const res = await beginCheckout(deps, r, guest());
    if (!res.ok || !("paymentRef" in res)) throw new Error();
    await editFile((db) => (db.reservations.find((x) => x.id === r.id)!.expiresAt = new Date(Date.now() - 1000).toISOString()));
    const other = await book("2027-07-03", "2027-07-10", "other@example.com");
    expect(other.status).toBe("confirmed");

    await syncPayment(deps, testProvider.simulateCheckout(res.paymentRef, "success"));
    const after = (await store.getById(r.id))!;
    expect(after.status).toBe("cancelled");
    expect(after.cancellation?.reason).toBe("dates-taken");
    const pay = (await store.getPayment(res.paymentRef))!;
    expect(pay.refundedCents).toBe(pay.amountCents);
    expect(sent).toContain(`conflict:${r.ref}:${pay.amountCents}`);
    expect(sent.filter((s) => s.startsWith("confirmed:"))).toEqual([`confirmed:${other.ref}`]);
  });

  it("late payment for dates still free confirms the booking", async () => {
    const r = await hold("2027-07-03", "2027-07-10");
    const res = await beginCheckout(deps, r, guest());
    if (!res.ok || !("paymentRef" in res)) throw new Error();
    await editFile((db) => (db.reservations[0].expiresAt = new Date(Date.now() - 1000).toISOString()));
    await store.expireHolds();
    await syncPayment(deps, testProvider.simulateCheckout(res.paymentRef, "success"));
    expect((await store.getById(r.id))!.status).toBe("confirmed");
  });

  it("cancels unpaid payments of abandoned holds", async () => {
    const r = await hold("2027-06-12", "2027-06-19");
    const res = await beginCheckout(deps, r, guest());
    if (!res.ok || !("paymentRef" in res)) throw new Error();
    await editFile((db) => (db.reservations[0].expiresAt = new Date(Date.now() - 1000).toISOString()));
    await store.expireHolds();
    expect(await cancelAbandoned(deps)).toBe(1);
    expect((await store.getPayment(res.paymentRef))!.status).toBe("canceled");
    expect(await cancelAbandoned(deps)).toBe(0);
  });
});

describe("balance", () => {
  it("is charged automatically once, on its due date", async () => {
    const r = await book("2027-06-12", "2027-06-19");
    expect(r.balanceDueDate).toBe("2027-05-13");
    expect(await chargeBalances(deps, "2027-05-12")).toEqual({ charged: 0, failed: 0 });
    expect(await chargeBalances(deps, "2027-05-13")).toEqual({ charged: 1, failed: 0 });
    expect(await chargeBalances(deps, "2027-05-14")).toEqual({ charged: 0, failed: 0 });
    const payments = await store.listPayments(r.id);
    expect(paidCents(payments)).toBe(r.totalCents);
    expect(sent).toEqual([`confirmed:${r.ref}`, `balancePaid:${r.ref}`]);
  });

  it("a declined automatic charge tells the guest, who then pays from the manage page", async () => {
    const r = await book("2027-06-12", "2027-06-19", "guest+decline@example.com");
    expect(await chargeBalances(deps, "2027-05-13")).toEqual({ charged: 0, failed: 1 });
    expect(sent).toContain(`balanceFailed:${r.ref}:card_declined`);
    expect(await chargeBalances(deps, "2027-05-14")).toEqual({ charged: 0, failed: 0 }); // no daily retries

    const res = await beginBalancePayment(deps, (await store.getById(r.id))!);
    if (!res.ok || !("paymentRef" in res)) throw new Error();
    expect(res.amountCents).toBe(r.quote.payment.balanceCents);
    await syncPayment(deps, testProvider.simulateCheckout(res.paymentRef, "success"));
    expect(paidCents(await store.listPayments(r.id))).toBe(r.totalCents);
    expect(sent).toContain(`balancePaid:${r.ref}`);
    expect(await beginBalancePayment(deps, (await store.getById(r.id))!)).toEqual({ ok: true, paid: true });
  });
});

describe("cancellation", () => {
  it("refunds per tier, and nothing is charged afterwards", async () => {
    const r = await book("2027-06-12", "2027-06-19");
    const payments = await store.listPayments(r.id);
    // 45 days before arrival → 50% of what was paid
    const preview = cancellationPreview(config, r, payments, "2027-04-28");
    expect(preview).toMatchObject({ allowed: true, daysBefore: 45, percent: 50, refundCents: Math.round(r.quote.payment.depositCents / 2) });
    const res = await cancelReservation(deps, r, "2027-04-28");
    expect(res.ok).toBe(true);
    const after = (await store.getById(r.id))!;
    expect(after.status).toBe("cancelled");
    expect((await store.listPayments(r.id))[0].refundedCents).toBe(preview.refundCents);
    expect(sent).toContain(`cancelled:${r.ref}:${preview.refundCents}`);
    expect(await chargeBalances(deps, "2027-05-13")).toEqual({ charged: 0, failed: 0 });
    expect(await cancelReservation(deps, after, "2027-04-28")).toMatchObject({ ok: false });
  });

  it("splits a refund over balance and deposit", async () => {
    const r = await book("2027-06-12", "2027-06-19");
    await chargeBalances(deps, "2027-05-13");
    const res = await cancelReservation(deps, r, "2026-12-01"); // > 60 days → 100%
    expect(res).toMatchObject({ ok: true, refundCents: r.totalCents });
    const payments = await store.listPayments(r.id);
    expect(payments.every((p) => p.refundedCents === p.amountCents)).toBe(true);
    expect(paidCents(payments)).toBe(0);
  });

  it("is not possible online on or after the arrival day", async () => {
    const r = await book("2027-06-12", "2027-06-19");
    expect(cancellationPreview(config, r, [], "2027-06-12").allowed).toBe(false);
    expect(await cancelReservation(deps, r, "2027-06-12")).toMatchObject({ ok: false });
  });
});

describe("security deposit", () => {
  it("is authorised from the arrival day and released after the check", async () => {
    const r = await book("2027-06-12", "2027-06-15");
    expect(await manageSecurityHolds(deps, "2027-06-11")).toEqual({ placed: 0, released: 0, failed: 0 });
    expect(await manageSecurityHolds(deps, "2027-06-12")).toEqual({ placed: 1, released: 0, failed: 0 });
    expect(await manageSecurityHolds(deps, "2027-06-13")).toEqual({ placed: 0, released: 0, failed: 0 });
    const sec = (await store.listPayments(r.id)).find((p) => p.kind === "security_deposit")!;
    expect(sec).toMatchObject({ status: "authorized", amountCents: config.payment.securityDeposit * 100 });
    expect(await manageSecurityHolds(deps, "2027-06-17")).toEqual({ placed: 0, released: 1, failed: 0 });
    expect((await store.getPayment(sec.providerRef))!.status).toBe("canceled");
    expect(await manageSecurityHolds(deps, "2027-06-17")).toEqual({ placed: 0, released: 0, failed: 0 });
  });

  it("tells the owner when the card refuses the authorisation", async () => {
    const r = await book("2027-06-12", "2027-06-15", "guest+decline@example.com");
    expect(await manageSecurityHolds(deps, "2027-06-12")).toEqual({ placed: 0, released: 0, failed: 1 });
    expect(sent).toContain(`securityFailed:${r.ref}`);
    expect(await manageSecurityHolds(deps, "2027-06-13")).toEqual({ placed: 0, released: 0, failed: 0 });
  });
});

describe("Stripe webhooks", () => {
  const secret = "whsec_test_secret";
  const stripe = createStripeProvider("sk_test_dummy", "pk_test_dummy", secret);
  const payload = JSON.stringify({
    id: "evt_1",
    object: "event",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_1",
        object: "payment_intent",
        status: "succeeded",
        amount: 74100,
        client_secret: "pi_1_secret",
        customer: "cus_1",
        payment_method: "pm_1",
        metadata: { reservation_id: "r1", ref: "CA-AAAA-AA", kind: "deposit" },
      },
    },
  });
  const sign = async (body: string, key = secret) => {
    const Stripe = (await import("stripe")).default;
    return new Stripe("sk_test_dummy").webhooks.generateTestHeaderStringAsync({ payload: body, secret: key });
  };

  it("accepts a correctly signed event and normalises it", async () => {
    const ev = await stripe.parseWebhook(payload, new Headers({ "stripe-signature": await sign(payload) }));
    expect(ev).toMatchObject({ id: "evt_1", type: "payment.updated", payment: { ref: "pi_1", status: "succeeded", paymentMethodId: "pm_1", metadata: { kind: "deposit" } } });
  });

  it("rejects a wrong signature, a tampered body and a missing header", async () => {
    await expect(stripe.parseWebhook(payload, new Headers({ "stripe-signature": await sign(payload, "whsec_other") }))).rejects.toThrow();
    const header = await sign(payload);
    await expect(stripe.parseWebhook(payload.replace("74100", "1"), new Headers({ "stripe-signature": header }))).rejects.toThrow();
    await expect(stripe.parseWebhook(payload, new Headers())).rejects.toThrow();
  });
});
