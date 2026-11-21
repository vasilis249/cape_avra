"use client";

import { useActionState, useId, useMemo, useState, type ReactNode } from "react";
import A from "@content/messages/admin.el.json";
import { savePricing, type ActionState } from "@/lib/admin/actions";
import type { BookingConfig } from "@/lib/booking/config-schema";
import { addDays, isISODate } from "@/lib/booking/dates";
import { formatMoney, quoteStay } from "@/lib/booking/pricing";
import { parseMonths, toRanges } from "@/lib/admin/months";
import { cn } from "@/lib/cn";
import { button, buttonOutline, fill, input, label } from "./ui-client";

const P = A.pricing;
type Cfg = BookingConfig;

/** Structured editor for content/booking.ts's shape. The server validates with the same zod schema. */
export function PricingEditor({ initial, today }: { initial: Cfg; today: string }) {
  const [c, setC] = useState<Cfg>(initial);
  const [state, action, pending] = useActionState<ActionState, FormData>(savePricing, {});
  const bad = new Set((state.data as string[] | undefined) ?? []);
  const set = (fn: (d: Cfg) => void) =>
    setC((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="config" value={JSON.stringify(c)} />

      <Section title={P.seasons}>
        {/* relative: visually hidden (absolute) inputs inside must not widen the page */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-[0.875rem]">
            <thead>
              <tr className="text-[0.75rem] text-ink-soft">
                {[P.seasonName, P.from, P.to, P.nightly, P.weekend, P.minNights, P.checkInDays, ""].map((h, i) => (
                  <th key={i} scope="col" className="px-1 pb-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.seasons.map((s, i) => (
                <tr key={s.id} className="align-top">
                  <td className="space-y-1 px-1 py-1">
                    <Field aria={`${P.seasonName} EN ${i + 1}`} value={s.name.en} onChange={(v) => set((d) => void (d.seasons[i].name.en = v))} invalid={bad.has(`seasons.${i}.name.en`)} />
                    <Field aria={`${P.seasonName} ΕΛ ${i + 1}`} value={s.name.el} onChange={(v) => set((d) => void (d.seasons[i].name.el = v))} />
                  </td>
                  <td className="px-1 py-1"><Field aria={`${P.from} ${i + 1}`} value={s.from} onChange={(v) => set((d) => void (d.seasons[i].from = v))} invalid={bad.has(`seasons.${i}.from`)} className="w-24" /></td>
                  <td className="px-1 py-1"><Field aria={`${P.to} ${i + 1}`} value={s.to} onChange={(v) => set((d) => void (d.seasons[i].to = v))} invalid={bad.has(`seasons.${i}.to`)} className="w-24" /></td>
                  <td className="px-1 py-1"><Field aria={`${P.nightly} ${i + 1}`} type="number" value={s.nightly} onChange={(v) => set((d) => void (d.seasons[i].nightly = num(v)))} className="w-24" /></td>
                  <td className="px-1 py-1">
                    <Field aria={`${P.weekend} ${i + 1}`} type="number" value={s.weekend ?? ""} onChange={(v) => set((d) => void (d.seasons[i].weekend = v === "" ? undefined : num(v)))} className="w-24" />
                  </td>
                  <td className="px-1 py-1"><Field aria={`${P.minNights} ${i + 1}`} type="number" value={s.minNights} onChange={(v) => set((d) => void (d.seasons[i].minNights = Math.max(1, Math.round(num(v)))))} className="w-20" /></td>
                  <td className="px-1 py-1">
                    <Weekdays
                      name={`${P.checkInDays} ${i + 1}`}
                      value={s.checkInDays}
                      anyLabel={P.anyDay}
                      onChange={(days) => set((d) => void (d.seasons[i].checkInDays = days))}
                    />
                  </td>
                  <td className="px-1 py-1">
                    {c.seasons.length > 1 && (
                      <button type="button" className="text-[0.8125rem] text-[#9a4a2a] underline" onClick={() => set((d) => void d.seasons.splice(i, 1))}>
                        {A.common.remove}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-6">
          <button
            type="button"
            className={buttonOutline}
            onClick={() => set((d) => void d.seasons.push({ id: `season-${Date.now().toString(36)}`, name: { en: "", el: "" }, from: "01-01", to: "01-31", nightly: 0, minNights: 3 }))}
          >
            {P.addSeason}
          </button>
          <div className="flex items-center gap-2 text-[0.875rem]">
            <span className="text-ink-soft">{P.weekendNights}:</span>
            <Weekdays name={P.weekendNights} value={c.weekendNights} anyLabel="—" onChange={(days) => set((d) => void (d.weekendNights = days ?? []))} />
          </div>
          <Check label={P.closedOutsideSeasons} checked={c.closedOutsideSeasons} onChange={(v) => set((d) => void (d.closedOutsideSeasons = v))} />
        </div>
      </Section>

      <Section title={P.guestsFees}>
        <Grid>
          <Num label={P.baseGuests} value={c.baseGuests} onChange={(v) => set((d) => void (d.baseGuests = v))} />
          <Num label={P.maxGuests} value={c.maxGuests} onChange={(v) => set((d) => void (d.maxGuests = v))} />
          <Num label={P.extraGuest} value={c.extraGuestPerNight} onChange={(v) => set((d) => void (d.extraGuestPerNight = v))} />
          <Num label={P.cleaning} value={c.cleaningFee} onChange={(v) => set((d) => void (d.cleaningFee = v))} />
        </Grid>
        <h3 className="mt-6 mb-2 font-sans text-[0.8125rem] text-ink-soft">{P.discounts}</h3>
        <div className="space-y-2">
          {c.longStayDiscounts.map((x, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <Num label={P.discountMin} value={x.minNights} onChange={(v) => set((d) => void (d.longStayDiscounts[i].minNights = v))} />
              <Num label={P.discountPercent} value={x.percent} onChange={(v) => set((d) => void (d.longStayDiscounts[i].percent = v))} />
              <button type="button" className="pb-2 text-[0.8125rem] text-[#9a4a2a] underline" onClick={() => set((d) => void d.longStayDiscounts.splice(i, 1))}>{A.common.remove}</button>
            </div>
          ))}
          <button type="button" className={buttonOutline} onClick={() => set((d) => void d.longStayDiscounts.push({ minNights: 7, percent: 5 }))}>{P.addDiscount}</button>
        </div>
        <h3 className="mt-6 mb-2 font-sans text-[0.8125rem] text-ink-soft">{P.lineItems}</h3>
        <div className="space-y-3">
          {c.lineItems.map((x, i) => (
            <div key={x.id} className="grid items-end gap-3 border-b border-limestone/40 pb-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto_auto]">
              <div className="space-y-1">
                <span className={label}>{P.lineLabel}</span>
                <Field aria={`${P.lineLabel} EN ${i + 1}`} value={x.label.en} onChange={(v) => set((d) => void (d.lineItems[i].label.en = v))} />
                <Field aria={`${P.lineLabel} ΕΛ ${i + 1}`} value={x.label.el} onChange={(v) => set((d) => void (d.lineItems[i].label.el = v))} />
              </div>
              <div>
                <label className={label} htmlFor={`li-type-${i}`}>{P.lineType}</label>
                <select id={`li-type-${i}`} className={input} value={x.type} onChange={(e) => set((d) => void (d.lineItems[i].type = e.target.value as typeof x.type))}>
                  {(["perNight", "perStay", "percent"] as const).map((t) => <option key={t} value={t}>{P.lineTypes[t]}</option>)}
                </select>
              </div>
              <Num label={P.lineAmount} value={x.amount} onChange={(v) => set((d) => void (d.lineItems[i].amount = v))} />
              <MonthsField value={x.months} onChange={(m) => set((d) => void (d.lineItems[i].months = m))} />
              <Check label={P.lineIncluded} checked={x.includedInTotal} onChange={(v) => set((d) => void (d.lineItems[i].includedInTotal = v))} />
              <button type="button" className="pb-2 text-[0.8125rem] text-[#9a4a2a] underline" onClick={() => set((d) => void d.lineItems.splice(i, 1))}>{A.common.remove}</button>
            </div>
          ))}
          <button
            type="button"
            className={buttonOutline}
            onClick={() => set((d) => void d.lineItems.push({ id: `fee-${Date.now().toString(36)}`, label: { en: "", el: "" }, type: "perNight", amount: 0, includedInTotal: true }))}
          >
            {P.addLineItem}
          </button>
        </div>
      </Section>

      <Section title={P.rules}>
        <Grid>
          <Num label={P.minAdvanceDays} value={c.minAdvanceDays} onChange={(v) => set((d) => void (d.minAdvanceDays = v))} />
          <Num label={P.maxAdvanceMonths} value={c.maxAdvanceMonths} onChange={(v) => set((d) => void (d.maxAdvanceMonths = v))} />
          <Num label={P.maxNights} value={c.maxNights} onChange={(v) => set((d) => void (d.maxNights = v))} />
          <Num label={P.holdMinutes} value={c.holdMinutes} onChange={(v) => set((d) => void (d.holdMinutes = v))} invalid={bad.has("holdMinutes")} />
        </Grid>
      </Section>

      <Section title={P.payment}>
        <Grid>
          <div>
            <label className={label} htmlFor="pay-mode">{P.paymentMode}</label>
            <select id="pay-mode" className={input} value={c.payment.mode} onChange={(e) => set((d) => void (d.payment.mode = e.target.value as "full" | "deposit"))}>
              <option value="deposit">{P.paymentModes.deposit}</option>
              <option value="full">{P.paymentModes.full}</option>
            </select>
          </div>
          <Num label={P.depositPercent} value={c.payment.depositPercent} onChange={(v) => set((d) => void (d.payment.depositPercent = v))} invalid={bad.has("payment.depositPercent")} />
          <Num label={P.balanceDays} value={c.payment.balanceDaysBeforeArrival} onChange={(v) => set((d) => void (d.payment.balanceDaysBeforeArrival = v))} />
          <Num label={P.securityDeposit} value={c.payment.securityDeposit} onChange={(v) => set((d) => void (d.payment.securityDeposit = v))} />
          <Num label={P.securityRelease} value={c.payment.securityDepositReleaseDays} onChange={(v) => set((d) => void (d.payment.securityDepositReleaseDays = v))} invalid={bad.has("payment.securityDepositReleaseDays")} />
        </Grid>
        <h3 className="mt-6 mb-2 font-sans text-[0.8125rem] text-ink-soft">{P.cancellation}</h3>
        <div className="space-y-2">
          {c.cancellation.map((t, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <Num label={P.tierDays} value={t.daysBefore} onChange={(v) => set((d) => void (d.cancellation[i].daysBefore = v))} />
              <Num label={P.tierPercent} value={t.refundPercent} onChange={(v) => set((d) => void (d.cancellation[i].refundPercent = v))} invalid={bad.has(`cancellation.${i}.refundPercent`)} />
              {c.cancellation.length > 1 && (
                <button type="button" className="pb-2 text-[0.8125rem] text-[#9a4a2a] underline" onClick={() => set((d) => void d.cancellation.splice(i, 1))}>{A.common.remove}</button>
              )}
            </div>
          ))}
          <button type="button" className={buttonOutline} onClick={() => set((d) => void d.cancellation.push({ daysBefore: 14, refundPercent: 25 }))}>{P.addTier}</button>
        </div>
      </Section>

      <Section title={P.emails}>
        <Grid>
          <Num label={P.preArrivalDays} value={c.emails.preArrivalDaysBefore} onChange={(v) => set((d) => void (d.emails.preArrivalDaysBefore = v))} />
          <Num label={P.reviewDays} value={c.emails.reviewDaysAfter} onChange={(v) => set((d) => void (d.emails.reviewDaysAfter = v))} />
        </Grid>
      </Section>

      <Preview config={c} today={today} />

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-4 border-t border-limestone/60 bg-salt/95 px-4 py-3 backdrop-blur">
        <button type="submit" disabled={pending} className={button}>{pending ? A.common.saving : A.common.save}</button>
        {state.error && (
          <p role="alert" className="text-[0.875rem] text-[#9a4a2a]">
            {state.error} {bad.size > 0 && <span className="text-ink-soft">({[...bad].join(", ")})</span>}
          </p>
        )}
        {state.ok && <p role="status" className="text-[0.875rem] text-olive">{state.message}</p>}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border border-limestone/60 bg-white p-5 sm:p-6">
      <legend className="px-2 text-[0.75rem] font-sans tracking-[0.14em] text-ink-soft uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}
const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;

function Field({ aria, value, onChange, type = "text", invalid, className }: { aria: string; value: string | number; onChange: (v: string) => void; type?: string; invalid?: boolean; className?: string }) {
  return (
    <input
      aria-label={aria}
      aria-invalid={invalid || undefined}
      type={type}
      step={type === "number" ? "any" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(input, "px-2 py-1.5", invalid && "border-[#9a4a2a]", className)}
    />
  );
}

function Num({ label: text, value, onChange, invalid }: { label: string; value: number; onChange: (v: number) => void; invalid?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <input
        id={id}
        type="number"
        step="any"
        aria-invalid={invalid || undefined}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className={cn(input, "w-36", invalid && "border-[#9a4a2a]")}
      />
    </div>
  );
}

function Check({ label: text, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 pb-2 text-[0.875rem]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-ionian" /> {text}
    </label>
  );
}

function Weekdays({ name, value, anyLabel, onChange }: { name: string; value: number[] | undefined; anyLabel: string; onChange: (v: number[] | undefined) => void }) {
  const wd = A.pricing.weekdays;
  return (
    <fieldset className="flex flex-wrap items-center gap-1">
      <legend className="sr-only">{name}</legend>
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const on = value?.includes(d) ?? false;
        return (
          <label key={d} className={cn("relative cursor-pointer border px-1.5 py-0.5 text-[0.75rem]", on ? "border-ionian bg-ionian text-salt" : "border-limestone bg-white")}>
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              onChange={() => {
                const next = on ? (value ?? []).filter((x) => x !== d) : [...(value ?? []), d].sort();
                onChange(next.length ? next : undefined);
              }}
            />
            {wd[d]}
          </label>
        );
      })}
      {!value?.length && <span className="ml-1 text-[0.75rem] text-ink-soft">{anyLabel}</span>}
    </fieldset>
  );
}

function MonthsField({ value, onChange }: { value: number[] | undefined; onChange: (v: number[] | undefined) => void }) {
  const [text, setText] = useState(() => toRanges(value));
  return (
    <div>
      <label className={label}>
        {A.pricing.lineMonths}
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseMonths(e.target.value));
          }}
          className={cn(input, "mt-1")}
        />
      </label>
    </div>
  );
}

function Preview({ config, today }: { config: Cfg; today: string }) {
  const [date, setDate] = useState(() => addDays(today, 60));
  const [nights, setNights] = useState(7);
  const [guests, setGuests] = useState(4);
  const result = useMemo(() => {
    if (!isISODate(date) || nights < 1) return null;
    try {
      return quoteStay(config, { checkIn: date, checkOut: addDays(date, nights), guests });
    } catch {
      return null;
    }
  }, [config, date, nights, guests]);
  return (
    <Section title={P.preview}>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-[0.8125rem] text-ink-soft">
          {A.calendar.from}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(input, "mt-1")} />
        </label>
        <label className="text-[0.8125rem] text-ink-soft">
          {A.bookings.cols.nights}
          <input type="number" min={1} value={nights} onChange={(e) => setNights(Number(e.target.value) || 1)} className={cn(input, "mt-1 w-24")} />
        </label>
        <label className="text-[0.8125rem] text-ink-soft">
          {A.bookings.cols.guests}
          <input type="number" min={1} value={guests} onChange={(e) => setGuests(Number(e.target.value) || 1)} className={cn(input, "mt-1 w-24")} />
        </label>
        <p className="pb-2 text-[0.9375rem] text-ink" aria-live="polite">
          {result ? fill(P.previewLine, { nights, date, guests, total: formatMoney(result.totalCents, "el") }) : "—"}
        </p>
      </div>
    </Section>
  );
}
