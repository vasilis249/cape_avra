import "server-only";
import { loadBookingConfig } from "@/lib/booking/config";
import { createEmailNotifier } from "@/lib/booking/emails";
import { getBookingStore } from "@/lib/booking/store";
import { getPaymentProvider, PaymentsUnavailableError, type PaymentProvider } from "./provider";
import type { Deps } from "./service";

/** The real wiring: database store, configured provider, booking config, emails. */
export async function paymentDeps(): Promise<Deps> {
  const [provider, config] = await Promise.all([getPaymentProvider(), loadBookingConfig()]);
  return { store: getBookingStore(), provider, config, notify: createEmailNotifier(config) };
}

/** No online payments configured: offline payments still work; anything that needs the provider explains why it can't. */
const noProvider = new Proxy({ id: "test" } as PaymentProvider, {
  get: (target, key) =>
    key === "id" ? "none" : key === "then" ? undefined : () => Promise.reject(new PaymentsUnavailableError("No payment provider configured")),
});

/** For owner tools that must work without online payments (bookings arranged by phone, bank transfers). */
export async function ownerDeps(): Promise<Deps> {
  try {
    return await paymentDeps();
  } catch (e) {
    if (!(e instanceof PaymentsUnavailableError)) throw e;
    const config = await loadBookingConfig();
    return { store: getBookingStore(), provider: noProvider, config, notify: createEmailNotifier(config) };
  }
}
