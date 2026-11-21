"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { submitContact, submitWaitlist } from "@/lib/leads/actions";
import { initialFormState } from "@/lib/leads/form-state";
import { buttonClasses } from "@/components/ui/Button";
import { Checkbox, Honeypot, SelectField, TextArea, TextField } from "./fields";

export type LeadFormLabels = {
  name: string;
  email: string;
  phone: string;
  optional: string;
  phoneHint: string;
  checkIn: string;
  checkOut: string;
  flexible: string;
  guests: string;
  message: string;
  marketing: string;
  submit: string;
  sending: string;
  successTitle: string;
  /** contains {email} */
  success: string;
  errors: Record<string, string>;
};

type Props = {
  kind: "waitlist" | "contact";
  locale: "en" | "el";
  labels: LeadFormLabels;
  /** rendered on the server (contains a localized link) */
  privacyLabel: ReactNode;
  maxGuests: number;
  contactEmail: string;
};

export function LeadForm({ kind, locale, labels, privacyLabel, maxGuests, contactEmail }: Props) {
  const [state, action, pending] = useActionState(kind === "waitlist" ? submitWaitlist : submitContact, initialFormState);
  // when the visitor arrived: recorded once and attached at submit time, so a quick
  // correction after a validation error is never mistaken for a bot
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const submit = (fd: FormData) => {
    fd.set("startedAt", String(startedAt.current || ""));
    action(fd);
  };
  const [checkIn, setCheckIn] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // today's date as the earliest arrival, set on the DOM after mount (the page is prerendered)
  useEffect(() => {
    const f = formRef.current;
    if (!f) return;
    const today = new Date().toISOString().slice(0, 10);
    f.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((i) => {
      if (!i.min) i.min = today;
    });
  }, [state]);
  useEffect(() => {
    if (state.status === "success") successRef.current?.focus();
    if (state.status === "error") {
      if (state.formError) errorRef.current?.focus();
      else document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [state]);

  const v = state.values ?? {};
  const err = (k: string) => {
    const code = state.fieldErrors?.[k];
    return code ? (labels.errors[code] ?? labels.errors.required).replace("{max}", String(maxGuests)) : undefined;
  };

  if (state.status === "success") {
    return (
      <div ref={successRef} tabIndex={-1} role="status" className="bg-sand p-8 outline-none sm:p-10">
        <p className="font-display text-h3 text-ionian">{labels.successTitle}</p>
        <p className="mt-4 text-ink-soft">{labels.success.replace("{email}", state.email ?? "")}</p>
      </div>
    );
  }

  // key: remount with the returned values after an error (React resets forms after an action)
  return (
    <form ref={formRef} key={JSON.stringify(v)} action={submit} noValidate className="relative grid gap-6 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      <Honeypot />

      {state.formError && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="border-l-2 border-dusk bg-sand px-4 py-3 text-[0.9375rem] text-ink outline-none sm:col-span-2">
          {labels.errors[state.formError].replace("{email}", contactEmail)}
        </p>
      )}

      <TextField name="name" label={labels.name} autoComplete="name" required defaultValue={v.name} error={err("name")} className="sm:col-span-2" />
      <TextField name="email" type="email" label={labels.email} autoComplete="email" required defaultValue={v.email} error={err("email")} />
      <TextField
        name="phone"
        type="tel"
        label={labels.phone}
        optional={labels.optional}
        hint={labels.phoneHint}
        autoComplete="tel"
        defaultValue={v.phone}
        error={err("phone")}
      />

      {kind === "waitlist" && (
        <>
          <TextField
            name="checkIn"
            type="date"
            label={labels.checkIn}
            defaultValue={v.checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            error={err("checkIn")}
          />
          <TextField
            name="checkOut"
            type="date"
            label={labels.checkOut}
            min={checkIn || undefined}
            defaultValue={v.checkOut}
            error={err("checkOut")}
          />
          <SelectField name="guests" label={labels.guests} defaultValue={v.guests ?? "2"} error={err("guests")}>
            {Array.from({ length: maxGuests }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </SelectField>
          <div className="flex items-end pb-3">
            <Checkbox name="flexible" label={labels.flexible} defaultChecked={v.flexible === "on"} />
          </div>
        </>
      )}

      <TextArea
        name="message"
        label={labels.message}
        optional={kind === "waitlist" ? labels.optional : undefined}
        required={kind === "contact"}
        defaultValue={v.message}
        error={err("message")}
        className="sm:col-span-2"
      />

      <div className="space-y-4 sm:col-span-2">
        {kind === "waitlist" && <Checkbox name="marketing" label={labels.marketing} defaultChecked={v.marketing === "on"} />}
        <Checkbox name="privacy" label={privacyLabel} required defaultChecked={v.privacy === "on"} error={err("privacy")} />
      </div>

      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full disabled:opacity-60 sm:w-auto")}>
          {pending ? labels.sending : labels.submit}
        </button>
      </div>
    </form>
  );
}
