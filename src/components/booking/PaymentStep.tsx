"use client";

import { useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Appearance, Stripe } from "@stripe/stripe-js";
// "pure": Stripe.js is fetched only when a Stripe payment form is shown, not on import
import { loadStripe } from "@stripe/stripe-js/pure";
import { completeTestPayment, type PaymentIntentInfo } from "@/lib/booking/actions";
import { buttonClasses } from "@/components/ui/Button";
import type { ClientConfig } from "@/lib/payments/provider";

export type PaymentLabels = {
  title: string;
  details: string;
  submit: string;
  processing: string;
  securePayment: string;
  note: string | null;
  testNotice: string | null;
  testDecline: string;
  failed: string;
  loading: string;
  loadError: string;
};

// Stripe.js is only loaded on pages that take a payment (it sets its own fraud-prevention cookies)
const stripePromises = new Map<string, Promise<Stripe | null>>();
const getStripe = (key: string) => {
  if (!stripePromises.has(key)) stripePromises.set(key, loadStripe(key));
  return stripePromises.get(key)!;
};

// design tokens (src/app/globals.css); the form renders in Stripe's iframe, so values are literal
const appearance: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#1f4d55",
    colorBackground: "#ffffff",
    colorText: "#1d2220",
    colorTextSecondary: "#4a524f",
    colorDanger: "#9a4a2a",
    fontFamily: "Commissioner, system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSizeBase: "16px",
    borderRadius: "0px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": { border: "1px solid #bfae93", boxShadow: "none" },
    ".Input:focus": { border: "1px solid #1f4d55", boxShadow: "0 0 0 1px #1f4d55" },
    ".Tab": { border: "1px solid #bfae93", boxShadow: "none" },
    ".Tab--selected": { border: "1px solid #1f4d55", boxShadow: "0 0 0 1px #1f4d55" },
    ".Label": { color: "#4a524f" },
  },
};

type Common = {
  provider: ClientConfig;
  payment: PaymentIntentInfo;
  /** where to go once paid (path on this site) */
  returnPath: string;
  refCode: string;
  token: string;
  locale: "en" | "el";
  manage?: boolean;
  billing?: { name?: string; email?: string; phone?: string };
  labels: PaymentLabels;
};

/** The payment form: Stripe Payment Element (cards, Apple Pay, Google Pay) or, in test mode, a simulated card. */
export function PaymentStep(props: Common) {
  const { provider, labels } = props;
  return (
    <section aria-labelledby="payment-title" className="space-y-5">
      <h2 id="payment-title" className="font-display text-h3 text-ionian">
        {labels.title}
      </h2>
      {provider.provider === "stripe" ? (
        <Elements
          stripe={getStripe(provider.publishableKey)}
          options={{ clientSecret: props.payment.clientSecret, locale: props.locale, appearance }}
        >
          <StripeForm {...props} />
        </Elements>
      ) : (
        <TestForm {...props} />
      )}
      {labels.note && <p className="text-[0.8125rem] leading-relaxed text-ink-soft">{labels.note}</p>}
    </section>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" tabIndex={-1} ref={(el) => el?.focus()} className="border-l-2 border-dusk bg-sand px-4 py-3 text-ink outline-none">
      {message}
    </p>
  );
}

function StripeForm({ returnPath, billing, labels }: Common) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    const returnUrl = new URL(returnPath, window.location.origin).href;
    const { error } = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl }, redirect: "if_required" });
    if (error) {
      // card and validation errors come localised from Stripe; anything else gets our message
      setError(error.type === "card_error" || error.type === "validation_error" ? (error.message ?? labels.failed) : labels.failed);
      setBusy(false);
      return;
    }
    window.location.assign(returnUrl); // the confirmation page checks the payment with the server
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      {error && <ErrorBox message={error} />}
      {!ready && <p className="text-[0.9375rem] text-ink-soft">{labels.loading}</p>}
      <fieldset>
        <legend className="sr-only">{labels.details}</legend>
        <PaymentElement
          options={{ layout: "tabs", defaultValues: { billingDetails: { name: billing?.name, email: billing?.email, phone: billing?.phone } } }}
          onReady={() => setReady(true)}
          onLoadError={() => setError(labels.loadError)}
        />
      </fieldset>
      <button type="submit" disabled={!stripe || !ready || busy} className={buttonClasses("primary", "md", "w-full disabled:opacity-60 sm:w-auto")}>
        {busy ? labels.processing : labels.submit}
      </button>
      <p className="text-[0.8125rem] text-ink-soft">{labels.securePayment}</p>
    </form>
  );
}

function TestForm({ payment, returnPath, refCode, token, locale, manage, labels }: Common) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pay(outcome: "success" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const res = await completeTestPayment({ ref: refCode, token, locale, paymentRef: payment.paymentRef, outcome, manage });
      if (res.ok) return window.location.assign(returnPath);
      setError(labels.failed);
    } catch {
      setError(labels.failed);
    }
    setBusy(false);
  }
  return (
    <div className="space-y-5" aria-busy={busy}>
      {error && <ErrorBox message={error} />}
      <div className="border border-dashed border-limestone bg-white p-5 text-[0.9375rem] text-ink-soft">
        <p className="font-medium text-ink">4242 4242 4242 4242 · 12/34 · 123</p>
        {labels.testNotice && <p className="mt-2 text-[0.8125rem] text-[#9a4a2a]">{labels.testNotice}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <button type="button" disabled={busy} onClick={() => pay("success")} className={buttonClasses("primary", "md", "disabled:opacity-60")}>
          {busy ? labels.processing : labels.submit}
        </button>
        <button type="button" disabled={busy} onClick={() => pay("decline")} className="text-[0.875rem] text-ionian underline underline-offset-4 disabled:opacity-60">
          {labels.testDecline}
        </button>
      </div>
    </div>
  );
}
