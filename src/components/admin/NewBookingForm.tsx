"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import A from "@content/messages/admin.el.json";
import { adminCreateBooking, type ActionState } from "@/lib/admin/actions";
import type { BookingConfig } from "@/lib/booking/config-schema";
import { isISODate } from "@/lib/booking/dates";
import { formatMoney, quoteStay, withCustomTotal } from "@/lib/booking/pricing";
import { cn } from "@/lib/cn";
import { button, fill, input, label } from "./ui-client";

const N = A.newBooking;
export type NewBookingDefaults = Partial<Record<"checkIn" | "checkOut" | "guests" | "locale" | "name" | "email" | "phone" | "message", string>>;

/** Owner booking form; the price preview uses the same pure pricing as the server. */
export function NewBookingForm({ config, today, defaults }: { config: BookingConfig; today: string; defaults: NewBookingDefaults }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(adminCreateBooking, {});
  const [checkIn, setCheckIn] = useState(defaults.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(defaults.checkOut ?? "");
  const [guests, setGuests] = useState(Number(defaults.guests) || 2);
  const [custom, setCustom] = useState("");

  const preview = useMemo(() => {
    if (!isISODate(checkIn) || !isISODate(checkOut) || checkOut <= checkIn) return null;
    try {
      let q = quoteStay(config, { checkIn, checkOut, guests }, today);
      const c = Math.round(Number(custom.replace(",", ".")) * 100);
      if (custom && Number.isFinite(c) && c > 0) q = withCustomTotal(config, q, c, today);
      return q;
    } catch {
      return null; // a night outside every season
    }
  }, [config, checkIn, checkOut, guests, custom, today]);

  const field = (name: string, text: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`nb-${name}`} className={label}>{text}</label>
      <input id={`nb-${name}`} name={name} className={input} defaultValue={defaults[name as keyof NewBookingDefaults]} {...props} />
    </div>
  );

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data)); // dispatched by hand: fields survive an error
      }}
    >
      <fieldset className="min-w-0 border border-limestone/60 bg-white p-5 sm:p-6">
        <legend className="px-2 font-sans text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">{N.stay}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="nb-checkIn" className={label}>{A.calendar.from}</label>
            <input id="nb-checkIn" name="checkIn" type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="nb-checkOut" className={label}>{A.calendar.to}</label>
            <input id="nb-checkOut" name="checkOut" type="date" required min={checkIn || undefined} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="nb-guests" className={label}>{A.bookings.cols.guests}</label>
            <input id="nb-guests" name="guests" type="number" min={1} max={config.maxGuests} required value={guests} onChange={(e) => setGuests(Number(e.target.value) || 1)} className={input} />
          </div>
        </div>
        <p className="mt-3 text-[0.8125rem] text-ink-soft">{N.rulesOverridden}</p>
      </fieldset>

      <fieldset className="min-w-0 border border-limestone/60 bg-white p-5 sm:p-6">
        <legend className="px-2 font-sans text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">{N.guest}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", A.booking.name, { required: true, autoComplete: "off" })}
          {field("email", A.booking.email, { required: true, type: "email", autoComplete: "off" })}
          {field("phone", A.booking.phone, { type: "tel" })}
          {field("country", A.booking.country)}
          <div>
            <label htmlFor="nb-locale" className={label}>{N.language}</label>
            <select id="nb-locale" name="locale" defaultValue={defaults.locale === "en" ? "en" : "el"} className={input}>
              <option value="el">{N.languages.el}</option>
              <option value="en">{N.languages.en}</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="nb-message" className={label}>{A.booking.message}</label>
            <textarea id="nb-message" name="message" rows={2} maxLength={2000} defaultValue={defaults.message} className={input} />
          </div>
        </div>
      </fieldset>

      <fieldset className="min-w-0 border border-limestone/60 bg-white p-5 sm:p-6">
        <legend className="px-2 font-sans text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">{N.price}</legend>
        <p className="mb-4 text-ink" aria-live="polite">
          {preview
            ? fill(N.calculated, { total: formatMoney(preview.totalCents, "el"), deposit: formatMoney(preview.payment.depositCents, "el") })
            : N.calculatedNone}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nb-custom" className={label}>{N.customTotal}</label>
            <input id="nb-custom" name="customTotal" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} aria-describedby="nb-custom-hint" className={input} />
            <p id="nb-custom-hint" className="mt-1 text-[0.75rem] text-ink-soft">{N.customHint}</p>
          </div>
          <div>
            <label htmlFor="nb-hold" className={label}>{N.holdHours}</label>
            <select id="nb-hold" name="holdHours" defaultValue="48" className={input}>
              {Object.entries(N.holdOptions).map(([h, text]) => (
                <option key={h} value={h}>{text}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-[0.9375rem]">
          <input type="checkbox" name="sendLink" defaultChecked className="accent-ionian" /> {N.sendLink}
        </label>
        <div className="mt-4">
          <label htmlFor="nb-notes" className={label}>{N.notes}</label>
          <input id="nb-notes" name="notes" maxLength={2000} className={input} />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={cn(button)}>{pending ? A.common.saving : N.submit}</button>
        {state.error && <p role="alert" className="text-[0.875rem] text-[#9a4a2a]">{state.error}</p>}
      </div>
    </form>
  );
}
