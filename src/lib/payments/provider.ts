import "server-only";
import type { PaymentRecord, Reservation } from "@/lib/booking/store";

/**
 * Payment layer behind an interface so the provider can be swapped
 * (Stripe in Phase 4, Viva.com possible later).
 */
export interface PaymentProvider {
  id: string;
  /** charge (or, for the test provider, simulate) the amount due now */
  collect(reservation: Reservation, amountCents: number): Promise<PaymentRecord>;
}

/** Simulated payments for development and test deployments. Never used in production. */
const testProvider: PaymentProvider = {
  id: "test",
  async collect(_reservation, amountCents) {
    return { provider: "test", status: "test", paidCents: amountCents, reference: `TEST-${Date.now()}` };
  },
};

export class PaymentsUnavailableError extends Error {}

export function getPaymentProvider(): PaymentProvider {
  const isProduction = process.env.VERCEL_ENV === "production";
  const wanted = process.env.PAYMENTS_PROVIDER ?? (isProduction ? "" : "test");
  if (wanted === "test" && !isProduction) return testProvider;
  // Phase 4: if (wanted === "stripe") return stripeProvider;
  throw new PaymentsUnavailableError(`No payment provider configured (PAYMENTS_PROVIDER=${wanted || "unset"})`);
}
