import "server-only";
import { bookingSeed } from "@content/booking";
import { bookingConfigSchema, type BookingConfig } from "./config-schema";
import { getBookingStore } from "./store";

/**
 * Current booking configuration: the admin-edited copy in the database when
 * present and valid (Phase 5), otherwise the seed in content/booking.ts.
 */
export async function loadBookingConfig(): Promise<BookingConfig> {
  try {
    const raw = await getBookingStore().loadConfig();
    if (raw) {
      const parsed = bookingConfigSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
      console.error("[booking] stored config is invalid, using the seed", parsed.error.issues);
    }
  } catch (e) {
    console.error("[booking] could not load stored config, using the seed", e);
  }
  return bookingSeed;
}
