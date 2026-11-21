"use client";

import { useActionState, useState } from "react";
import { cancelBooking, prepareBalancePayment, type CancelState, type PaymentIntentInfo } from "@/lib/booking/actions";
import { buttonClasses } from "@/components/ui/Button";
import { Checkbox } from "@/components/forms/fields";
import type { ClientConfig } from "@/lib/payments/provider";
import { PaymentStep, type PaymentLabels } from "./PaymentStep";

type Link = { refCode: string; token: string; locale: "en" | "el" };

export function BalancePayment({
  link,
  provider,
  returnPath,
  billing,
  labels,
}: {
  link: Link;
  provider: ClientConfig;
  returnPath: string;
  billing: { name?: string; email?: string; phone?: string };
  labels: { open: string; error: string; payment: PaymentLabels };
}) {
  const [payment, setPayment] = useState<PaymentIntentInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function open() {
    setBusy(true);
    setError(false);
    try {
      const res = await prepareBalancePayment({ ref: link.refCode, token: link.token, locale: link.locale });
      if (res.ok && "paid" in res) return window.location.assign(returnPath);
      if (res.ok) setPayment(res.payment);
      else setError(true);
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  if (payment) {
    return <PaymentStep provider={provider} payment={payment} returnPath={returnPath} {...link} manage billing={billing} labels={labels.payment} />;
  }
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="border-l-2 border-dusk bg-sand px-4 py-3 text-ink">
          {labels.error}
        </p>
      )}
      <button type="button" onClick={open} disabled={busy} className={buttonClasses("primary", "md", "disabled:opacity-60")}>
        {busy ? labels.payment.processing : labels.open}
      </button>
    </div>
  );
}

export function CancelForm({
  link,
  labels,
}: {
  link: Link;
  labels: { confirm: string; button: string; busy: string; errors: Record<NonNullable<CancelState["error"]>, string> };
}) {
  const [state, action, pending] = useActionState<CancelState, FormData>(cancelBooking, { status: "idle" });
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="ref" value={link.refCode} />
      <input type="hidden" name="token" value={link.token} />
      <input type="hidden" name="locale" value={link.locale} />
      {state.error && state.error !== "confirm" && (
        <p role="alert" className="border-l-2 border-dusk bg-white px-4 py-3 text-ink">
          {labels.errors[state.error]}
        </p>
      )}
      <Checkbox name="confirm" label={labels.confirm} required error={state.error === "confirm" ? labels.errors.confirm : undefined} />
      <button type="submit" disabled={pending} className={buttonClasses("outline", "md", "disabled:opacity-60")}>
        {pending ? labels.busy : labels.button}
      </button>
    </form>
  );
}
