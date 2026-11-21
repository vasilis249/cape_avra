import "server-only";
import Stripe from "stripe";
import type { PaymentMeta, PaymentProvider, ProviderPayment, WebhookEvent } from "./provider";

const metadata = (m: PaymentMeta) => ({ reservation_id: m.reservationId, ref: m.ref, kind: m.kind });

function statusOf(pi: Stripe.PaymentIntent): ProviderPayment["status"] {
  switch (pi.status) {
    case "succeeded":
      return "succeeded";
    case "requires_capture":
      return "authorized";
    case "canceled":
      return "canceled";
    case "requires_action":
      return "action_required";
    case "requires_payment_method":
      // a failed attempt puts the intent back here, with last_payment_error set
      return pi.last_payment_error ? "failed" : "pending";
    default:
      return "pending"; // requires_confirmation, processing
  }
}

const idOf = (v: string | { id: string } | null | undefined) => (v == null ? null : typeof v === "string" ? v : v.id);

export function normalise(pi: Stripe.PaymentIntent): ProviderPayment {
  const charge = typeof pi.latest_charge === "object" && pi.latest_charge ? pi.latest_charge : null;
  return {
    ref: pi.id,
    status: statusOf(pi),
    amountCents: pi.amount,
    clientSecret: pi.client_secret,
    customerId: idOf(pi.customer),
    paymentMethodId: idOf(pi.payment_method),
    refundedCents: charge?.amount_refunded ?? 0,
    failure: pi.last_payment_error ? (pi.last_payment_error.decline_code ?? pi.last_payment_error.code ?? pi.last_payment_error.message ?? "failed") : null,
    metadata: Object.fromEntries(Object.entries(pi.metadata ?? {}).map(([k, v]) => [k, String(v)])),
  };
}

const PI_EVENTS = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "payment_intent.amount_capturable_updated",
  "payment_intent.processing",
]);

export function createStripeProvider(secretKey: string, publishableKey: string, webhookSecret = process.env.STRIPE_WEBHOOK_SECRET): PaymentProvider {
  const stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "Cape Avra booking" } });

  /** off-session confirmations that fail throw; return the failed intent instead */
  async function offSession(params: Stripe.PaymentIntentCreateParams, idempotencyKey: string): Promise<ProviderPayment> {
    try {
      return normalise(await stripe.paymentIntents.create(params, { idempotencyKey }));
    } catch (e) {
      if (e instanceof Stripe.errors.StripeCardError && e.payment_intent) {
        const p = normalise(e.payment_intent as Stripe.PaymentIntent);
        // authentication_required: the bank wants the guest present; they pay from the manage page
        return { ...p, status: "failed", failure: e.decline_code ?? e.code ?? "card_error" };
      }
      throw e;
    }
  }

  return {
    id: "stripe",
    client: () => ({ provider: "stripe", publishableKey }),

    async createCustomer({ name, email, phone, ref }) {
      const c = await stripe.customers.create({ name, email, phone, metadata: { ref } }, { idempotencyKey: `customer-${ref}-${email}` });
      return c.id;
    },

    async createPayment({ amountCents, currency, customerId, saveCard, meta, idempotencyKey, description }) {
      const pi = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: currency.toLowerCase(),
          customer: customerId ?? undefined,
          // card, Apple Pay, Google Pay… as enabled in the Stripe dashboard
          automatic_payment_methods: { enabled: true },
          // keep the card for the automatic balance charge and the security deposit
          setup_future_usage: saveCard ? "off_session" : undefined,
          description,
          metadata: metadata(meta),
        },
        { idempotencyKey },
      );
      return normalise(pi);
    },

    async updateAmount(ref, amountCents) {
      return normalise(await stripe.paymentIntents.update(ref, { amount: amountCents }));
    },

    chargeSaved({ amountCents, currency, customerId, paymentMethodId, meta, idempotencyKey, description }) {
      return offSession(
        {
          amount: amountCents,
          currency: currency.toLowerCase(),
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          description,
          metadata: metadata(meta),
        },
        idempotencyKey,
      );
    },

    authorize({ amountCents, currency, customerId, paymentMethodId, meta, idempotencyKey, description }) {
      return offSession(
        {
          amount: amountCents,
          currency: currency.toLowerCase(),
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          capture_method: "manual",
          description,
          metadata: metadata(meta),
        },
        idempotencyKey,
      );
    },

    async capture(ref, amountCents) {
      return normalise(await stripe.paymentIntents.capture(ref, { amount_to_capture: amountCents }));
    },

    async cancel(ref) {
      try {
        return normalise(await stripe.paymentIntents.cancel(ref));
      } catch (e) {
        // already canceled / succeeded: report the current state
        if (e instanceof Stripe.errors.StripeInvalidRequestError) return normalise(await stripe.paymentIntents.retrieve(ref));
        throw e;
      }
    },

    async refund(ref, amountCents, idempotencyKey) {
      await stripe.refunds.create({ payment_intent: ref, amount: amountCents, reason: "requested_by_customer", metadata: { source: "cape-avra" } }, { idempotencyKey });
      const pi = await stripe.paymentIntents.retrieve(ref, { expand: ["latest_charge"] });
      return { refundedCents: normalise(pi).refundedCents };
    },

    async retrieve(ref) {
      return normalise(await stripe.paymentIntents.retrieve(ref, { expand: ["latest_charge"] }));
    },

    async parseWebhook(rawBody, headers): Promise<WebhookEvent> {
      if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
      const signature = headers.get("stripe-signature");
      if (!signature) throw new Error("missing stripe-signature");
      const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
      if (PI_EVENTS.has(event.type)) {
        const pi = event.data.object as Stripe.PaymentIntent;
        const payment = normalise(pi);
        // a failed event can arrive after the intent was retried successfully: the status above is the intent's own
        return { id: event.id, type: "payment.updated", payment };
      }
      if (event.type === "charge.refunded" || event.type === "charge.refund.updated") {
        const obj = event.data.object as Stripe.Charge | Stripe.Refund;
        const paymentRef = idOf(obj.payment_intent);
        if (!paymentRef) return { id: event.id, type: "ignored" };
        const refundedCents =
          "amount_refunded" in obj ? obj.amount_refunded : normalise(await stripe.paymentIntents.retrieve(paymentRef, { expand: ["latest_charge"] })).refundedCents;
        return { id: event.id, type: "refund.updated", paymentRef, refundedCents };
      }
      return { id: event.id, type: "ignored" };
    },
  };
}

