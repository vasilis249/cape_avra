import "server-only";
import { loadBookingConfig } from "@/lib/booking/config";
import { createEmailNotifier } from "@/lib/booking/emails";
import { getBookingStore } from "@/lib/booking/store";
import { getPaymentProvider } from "./provider";
import type { Deps } from "./service";

/** The real wiring: database store, configured provider, booking config, emails. */
export async function paymentDeps(): Promise<Deps> {
  const [provider, config] = await Promise.all([getPaymentProvider(), loadBookingConfig()]);
  return { store: getBookingStore(), provider, config, notify: createEmailNotifier(config) };
}
