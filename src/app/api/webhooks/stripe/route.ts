import { getBookingStore } from "@/lib/booking/store";
import { paymentDeps } from "@/lib/payments/deps";
import { PaymentsUnavailableError } from "@/lib/payments/provider";
import { syncPayment } from "@/lib/payments/service";

export const maxDuration = 30;

/**
 * Stripe webhooks: the source of truth for payments. Signature-verified on the raw body,
 * deduplicated by event id, and every handler is idempotent (Stripe retries on any non-2xx).
 * Events: payment_intent.succeeded / payment_failed / canceled / amount_capturable_updated / processing,
 * charge.refunded.
 */
export async function POST(req: Request) {
  let deps;
  try {
    deps = await paymentDeps();
  } catch (e) {
    if (e instanceof PaymentsUnavailableError) return new Response("Payments not configured", { status: 503 });
    throw e;
  }
  if (deps.provider.id !== "stripe") return new Response("Not found", { status: 404 });

  const raw = await req.text();
  let event;
  try {
    event = await deps.provider.parseWebhook(raw, req.headers);
  } catch (e) {
    console.warn("[stripe] rejected webhook:", e instanceof Error ? e.message : e);
    return new Response("Invalid signature", { status: 400 });
  }

  const store = getBookingStore();
  if (!(await store.recordEvent(event.id, "stripe", event.type))) return Response.json({ received: true, duplicate: true });

  try {
    if (event.type === "payment.updated") {
      // the event's snapshot can be stale (events arrive out of order): act on the current state
      await syncPayment(deps, await deps.provider.retrieve(event.payment.ref));
    } else if (event.type === "refund.updated") {
      const row = await store.getPayment(event.paymentRef);
      if (row && event.refundedCents > row.refundedCents) await store.updatePayment(event.paymentRef, { refundedCents: event.refundedCents });
    }
    await store.markEventProcessed(event.id);
  } catch (e) {
    console.error(`[stripe] handling ${event.id} (${event.type}) failed`, e);
    return new Response("Handler error", { status: 500 }); // Stripe retries
  }
  return Response.json({ received: true });
}
