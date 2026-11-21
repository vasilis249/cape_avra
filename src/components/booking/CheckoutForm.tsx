"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { confirmBooking, type ConfirmState } from "@/lib/booking/actions";
import { buttonClasses } from "@/components/ui/Button";
import { Checkbox, TextArea, TextField } from "@/components/forms/fields";

export type CheckoutLabels = {
  detailsTitle: string;
  name: string;
  email: string;
  phone: string;
  phoneHint: string;
  country: string;
  arrivalTime: string;
  message: string;
  optional: string;
  marketing: string;
  submit: string;
  processing: string;
  testNotice: string | null;
  heldFor: string; // {time}
  expired: string;
  backToDates: string;
  errors: Record<string, string>;
};

export function CheckoutForm({
  refCode,
  token,
  locale,
  expiresAt,
  labels,
  termsLabel,
}: {
  refCode: string;
  token: string;
  locale: "en" | "el";
  expiresAt: string;
  labels: CheckoutLabels;
  termsLabel: ReactNode;
}) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmBooking, { status: "idle" });
  const [left, setLeft] = useState<number | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // hold countdown (client clock; the server re-checks expiry on submit)
  useEffect(() => {
    const end = new Date(expiresAt).getTime();
    const tick = () => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (state.formError) errorRef.current?.focus();
    else if (state.fieldErrors) document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const expired = left === 0 || state.formError === "expired";
  if (expired) {
    return (
      <div role="alert" className="bg-sand p-8">
        <p className="text-ink">{labels.expired}</p>
        <Link href="/book" className={buttonClasses("primary", "md", "mt-6")}>
          {labels.backToDates}
        </Link>
      </div>
    );
  }

  const v = state.values ?? {};
  const err = (k: string) => (state.fieldErrors?.[k] ? (labels.errors[state.fieldErrors[k]] ?? labels.errors.required) : undefined);
  const mmss = left === null ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <form key={JSON.stringify(v)} action={action} noValidate className="grid gap-6 sm:grid-cols-2">
      <input type="hidden" name="ref" value={refCode} />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />

      <p className="text-[0.9375rem] text-ink-soft sm:col-span-2" aria-live="off">
        {labels.heldFor.replace("{time}", mmss)}
      </p>

      {state.formError && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="border-l-2 border-dusk bg-sand px-4 py-3 text-ink outline-none sm:col-span-2">
          {labels.errors[state.formError] ?? labels.errors.generic}
        </p>
      )}

      <h2 className="font-display text-h3 text-ionian sm:col-span-2">{labels.detailsTitle}</h2>
      <TextField name="name" label={labels.name} autoComplete="name" required defaultValue={v.name} error={err("name")} className="sm:col-span-2" />
      <TextField name="email" type="email" label={labels.email} autoComplete="email" required defaultValue={v.email} error={err("email")} />
      <TextField name="phone" type="tel" label={labels.phone} hint={labels.phoneHint} autoComplete="tel" required defaultValue={v.phone} error={err("phone")} />
      <TextField name="country" label={labels.country} optional={labels.optional} autoComplete="country-name" defaultValue={v.country} error={err("country")} />
      <TextField name="arrivalTime" type="time" label={labels.arrivalTime} optional={labels.optional} defaultValue={v.arrivalTime} error={err("arrivalTime")} />
      <TextArea name="message" label={labels.message} optional={labels.optional} defaultValue={v.message} error={err("message")} className="sm:col-span-2" rows={3} />

      <div className="space-y-4 sm:col-span-2">
        <Checkbox name="marketing" label={labels.marketing} defaultChecked={v.marketing === "on"} />
        <Checkbox name="terms" label={termsLabel} required defaultChecked={v.terms === "on"} error={err("terms")} />
      </div>

      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full disabled:opacity-60 sm:w-auto")}>
          {pending ? labels.processing : labels.submit}
        </button>
        {labels.testNotice && <p className="mt-3 text-[0.8125rem] text-[#9a4a2a]">{labels.testNotice}</p>}
      </div>
    </form>
  );
}
