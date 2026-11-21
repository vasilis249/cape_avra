import "server-only";
import type { PaymentMeta, PaymentProvider, ProviderPayment } from "./provider";

/**
 * Simulated payments for development and preview deployments (never in production).
 * State lives in memory for the running process; the booking store keeps the durable record.
 * A guest email containing "+decline" makes off-session charges fail, to try the failure paths.
 */
type Sim = ProviderPayment & { capture: "auto" | "manual" };
const g = globalThis as unknown as { __capeTestPayments?: Map<string, Sim> };
const sims = (g.__capeTestPayments ??= new Map());
const declines = new Set<string>();

const rnd = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
function make(amountCents: number, meta: PaymentMeta, status: Sim["status"], extra: Partial<Sim> = {}): Sim {
  const ref = `test_pi_${rnd()}`;
  const p: Sim = {
    ref,
    status,
    amountCents,
    clientSecret: `${ref}_secret_${rnd()}`,
    customerId: null,
    paymentMethodId: null,
    refundedCents: 0,
    failure: null,
    metadata: { reservation_id: meta.reservationId, ref: meta.ref, kind: meta.kind },
    capture: "auto",
    ...extra,
  };
  sims.set(ref, p);
  return p;
}
const get = (ref: string) => {
  const p = sims.get(ref);
  if (!p) throw new Error(`test payment ${ref} not found (the dev server restarted?)`);
  return p;
};
const byKey = new Map<string, string>();
function idempotent(key: string, create: () => Sim): Sim {
  const known = byKey.get(key);
  if (known && sims.has(known)) return sims.get(known)!;
  const p = create();
  byKey.set(key, p.ref);
  return p;
}

export const testProvider: PaymentProvider & {
  /** what the browser's "pay" button does in test mode */
  simulateCheckout(ref: string, outcome: "success" | "decline"): ProviderPayment;
  markDeclining(customerId: string): void;
} = {
  id: "test",
  client: () => ({ provider: "test" }),
  async createCustomer({ email }) {
    const id = `test_cus_${rnd()}`;
    if (email.includes("+decline")) declines.add(id);
    return id;
  },
  async createPayment({ amountCents, customerId, meta, idempotencyKey }) {
    return idempotent(idempotencyKey, () => make(amountCents, meta, "pending", { customerId }));
  },
  async updateAmount(ref, amountCents) {
    const p = get(ref);
    p.amountCents = amountCents;
    return p;
  },
  async chargeSaved({ amountCents, customerId, paymentMethodId, meta, idempotencyKey }) {
    return idempotent(idempotencyKey, () =>
      declines.has(customerId)
        ? make(amountCents, meta, "failed", { customerId, paymentMethodId, failure: "card_declined" })
        : make(amountCents, meta, "succeeded", { customerId, paymentMethodId }),
    );
  },
  async authorize({ amountCents, customerId, paymentMethodId, meta, idempotencyKey }) {
    return idempotent(idempotencyKey, () =>
      declines.has(customerId)
        ? make(amountCents, meta, "failed", { customerId, paymentMethodId, failure: "card_declined", capture: "manual" })
        : make(amountCents, meta, "authorized", { customerId, paymentMethodId, capture: "manual" }),
    );
  },
  async capture(ref, amountCents) {
    const p = get(ref);
    if (p.status !== "authorized") throw new Error(`cannot capture a ${p.status} payment`);
    Object.assign(p, { status: "succeeded", amountCents });
    return p;
  },
  async cancel(ref) {
    const p = get(ref);
    if (p.status !== "succeeded") p.status = "canceled";
    return p;
  },
  async refund(ref, amountCents) {
    const p = get(ref);
    if (p.status !== "succeeded") throw new Error("only succeeded payments can be refunded");
    p.refundedCents = Math.min(p.amountCents, p.refundedCents + amountCents);
    return { refundedCents: p.refundedCents };
  },
  async retrieve(ref) {
    return get(ref);
  },
  async parseWebhook() {
    throw new Error("the test provider has no webhooks");
  },
  simulateCheckout(ref, outcome) {
    const p = get(ref);
    if (p.status === "succeeded") return p;
    if (outcome === "decline") Object.assign(p, { status: "failed", failure: "card_declined" });
    else Object.assign(p, { status: "succeeded", failure: null, paymentMethodId: p.paymentMethodId ?? `test_pm_${rnd()}` });
    return p;
  },
  markDeclining(customerId) {
    declines.add(customerId);
  },
};
