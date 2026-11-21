import "server-only";
import type { PaymentKind, PaymentStatus } from "@/lib/booking/store";

/**
 * Payment layer behind an interface, so the provider can be swapped (Stripe now, Viva.com possible later).
 * Amounts are integer cents. The provider never touches the database: the payment service does.
 */

/** A payment at the provider (a Stripe PaymentIntent), reduced to what the booking engine needs. */
export type ProviderPayment = {
  ref: string;
  status: PaymentStatus | "action_required";
  amountCents: number;
  /** what the browser needs to finish an on-session payment (Payment Element) */
  clientSecret: string | null;
  customerId: string | null;
  paymentMethodId: string | null;
  refundedCents: number;
  failure: string | null;
  metadata: Record<string, string>;
};

export type PaymentMeta = { reservationId: string; ref: string; kind: PaymentKind };

export type WebhookEvent =
  | { id: string; type: "payment.updated"; payment: ProviderPayment }
  | { id: string; type: "refund.updated"; paymentRef: string; refundedCents: number }
  | { id: string; type: "ignored" };

export type ClientConfig = { provider: "test" } | { provider: "stripe"; publishableKey: string };

export interface PaymentProvider {
  id: "test" | "stripe";
  client(): ClientConfig;
  /** a customer record to save the card on (for the balance and the security deposit) */
  createCustomer(input: { name: string; email: string; phone?: string; ref: string }): Promise<string | null>;
  /** on-session payment the guest completes in the browser; saves the card for later off-session charges */
  createPayment(input: { amountCents: number; currency: string; customerId: string | null; saveCard: boolean; meta: PaymentMeta; idempotencyKey: string; description: string }): Promise<ProviderPayment>;
  /** amount changed before the guest paid (e.g. re-entered checkout) */
  updateAmount(ref: string, amountCents: number): Promise<ProviderPayment>;
  /** off-session charge of the saved card (balance). Declines come back as status "failed", not as an exception. */
  chargeSaved(input: { amountCents: number; currency: string; customerId: string; paymentMethodId: string; meta: PaymentMeta; idempotencyKey: string; description: string }): Promise<ProviderPayment>;
  /** off-session authorisation without capture (security deposit) */
  authorize(input: { amountCents: number; currency: string; customerId: string; paymentMethodId: string; meta: PaymentMeta; idempotencyKey: string; description: string }): Promise<ProviderPayment>;
  capture(ref: string, amountCents: number): Promise<ProviderPayment>;
  /** cancel an unpaid payment or release an authorisation */
  cancel(ref: string): Promise<ProviderPayment>;
  refund(ref: string, amountCents: number, idempotencyKey: string): Promise<{ refundedCents: number }>;
  retrieve(ref: string): Promise<ProviderPayment>;
  /** verify the signature and normalise the event; throws on an invalid signature */
  parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent>;
}

export class PaymentsUnavailableError extends Error {}

const providers: Partial<Record<string, PaymentProvider>> = {};

/** Overridable in tests. */
export function setPaymentProvider(p: PaymentProvider | null) {
  providers.override = p ?? undefined;
}

export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (providers.override) return providers.override;
  const isProduction = process.env.VERCEL_ENV === "production";
  const wanted = process.env.PAYMENTS_PROVIDER ?? (isProduction ? "" : "test");
  if (wanted === "stripe") {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      throw new PaymentsUnavailableError("STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY missing");
    }
    // live keys only on the production deployment; previews and local runs must use test keys
    if (!isProduction && process.env.STRIPE_SECRET_KEY.startsWith("sk_live_")) {
      throw new PaymentsUnavailableError("Live Stripe key outside production");
    }
    const { createStripeProvider } = await import("./stripe");
    return (providers.stripe ??= createStripeProvider(process.env.STRIPE_SECRET_KEY, process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY));
  }
  if (wanted === "test" && !isProduction) {
    const { testProvider } = await import("./test-provider");
    return testProvider;
  }
  throw new PaymentsUnavailableError(`No payment provider configured (PAYMENTS_PROVIDER=${wanted || "unset"})`);
}
