import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmSubmit } from "@/components/admin/ActionForm";
import { button, buttonDanger, buttonOutline, Card, dateTime, fill, input, label, money, PageTitle, shortDate, StatusBadge, table } from "@/components/admin/ui";
import { adminCancel, addNote, adminExtendHold, adminManualPayment, adminRefund, adminReleaseHold, adminSecurity, adminSendPaymentLink, resendConfirmation } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { loadBookingConfig } from "@/lib/booking/config";
import { diffDays, todayIn } from "@/lib/booking/dates";
import { manageUrl, paymentUrl } from "@/lib/booking/emails";
import { getBookingStore } from "@/lib/booking/store";
import { cn } from "@/lib/cn";
import { balanceDueDate, cancellationPreview, outstandingCents, paidCents } from "@/lib/payments/service";
import A from "@content/messages/admin.el.json";

export const metadata: Metadata = { title: A.common.nav.bookings };
const B = A.booking;

export default async function BookingPage({ params }: PageProps<"/admin/bookings/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const store = getBookingStore();
  const r = await store.getById(id);
  if (!r) notFound();
  const config = await loadBookingConfig();
  const [payments, notes] = await Promise.all([store.listPayments(r.id), store.listNotes(r.id)]);
  const today = todayIn(config.timeZone);
  const preview = cancellationPreview(config, r, payments, today);
  const refunded = payments.filter((p) => p.kind !== "security_deposit").reduce((s, p) => s + p.refundedCents, 0);
  const refundable = payments.filter((p) => p.kind !== "security_deposit" && p.status === "succeeded" && p.amountCents > p.refundedCents);
  const security = payments.find((p) => p.kind === "security_deposit" && p.status === "authorized");
  const stripeTest = /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? "");
  const stripeUrl = (ref: string) => `https://dashboard.stripe.com/${stripeTest ? "test/" : ""}payments/${ref}`;
  const q = r.quote;
  const g = r.guest;
  const holdActive = r.status === "hold" && !!r.expiresAt && r.expiresAt > new Date().toISOString();
  const outstanding = outstandingCents(r, payments);
  const canRecord = (holdActive || r.status === "confirmed") && outstanding > 0;
  const suggested = r.status === "confirmed" ? outstanding : Math.min(outstanding, r.quote.payment.depositCents);
  const deadline = r.expiresAt ? dateTime(r.expiresAt) : "";

  return (
    <>
      <p className="mb-4 text-[0.875rem]">
        <Link href="/admin/bookings" className="text-ionian underline underline-offset-4">
          ← {A.common.nav.bookings}
        </Link>
      </p>
      <PageTitle actions={<StatusBadge status={r.status} />}>{r.ref}</PageTitle>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={B.stay}>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Item k={A.calendar.from} v={shortDate(r.checkIn)} />
              <Item k={A.calendar.to} v={shortDate(r.checkOut)} />
              <Item k={A.bookings.cols.nights} v={String(diffDays(r.checkIn, r.checkOut))} />
              <Item k={A.bookings.cols.guests} v={String(r.guests)} />
              <Item k={B.created} v={dateTime(r.createdAt)} />
              <Item k={B.language} v={r.locale === "el" ? "Ελληνικά" : "English"} />
            </dl>
            {r.status === "cancelled" && r.cancellation && (
              <p className="mt-4 bg-sand px-4 py-3 text-[0.9375rem]">
                {fill(B.cancelledInfo, { date: dateTime(r.cancellation.at), by: B.by[r.cancellation.by], amount: money(r.cancellation.refundCents) })}
              </p>
            )}
          </Card>

          {holdActive && (
            <Card title={B.awaitingTitle} className="border-ionian">
              <p className="mb-4 text-[0.9375rem]">{fill(B.awaitingLead, { date: deadline })}</p>
              {paymentUrl(r) && (
                <div className="mb-4">
                  <label htmlFor="pay-link" className={label}>{B.paymentLink}</label>
                  <input id="pay-link" readOnly value={paymentUrl(r)!} className={cn(input, "text-[0.8125rem]")} />
                </div>
              )}
              <div className="flex flex-wrap items-start gap-6">
                <ActionForm action={adminSendPaymentLink} submit={B.sendLink} submitClass={button}>
                  <input type="hidden" name="id" value={r.id} />
                </ActionForm>
                <ActionForm action={adminExtendHold} submit={B.extendSubmit} submitClass={buttonOutline} className="flex flex-wrap items-end gap-3 space-y-0">
                  <input type="hidden" name="id" value={r.id} />
                  <div>
                    <label htmlFor="extend-hours" className={label}>{B.extend}</label>
                    <select id="extend-hours" name="hours" defaultValue="48" className={input}>
                      {Object.entries(A.newBooking.holdOptions).map(([h, text]) => (
                        <option key={h} value={h}>{text}</option>
                      ))}
                    </select>
                  </div>
                </ActionForm>
                <form action={adminReleaseHold} className="self-end">
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmSubmit confirm={B.releaseConfirm} className={buttonDanger}>{B.release}</ConfirmSubmit>
                </form>
              </div>
            </Card>
          )}
          {r.status === "expired" && r.guest && <p className="bg-sand px-4 py-3 text-[0.9375rem]">{B.expiredLead}</p>}

          <Card title={B.guest}>
            {g ? (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Item k={B.name} v={g.name} />
                <Item k={B.email} v={<a href={`mailto:${g.email}`} className="text-ionian underline underline-offset-4">{g.email}</a>} />
                <Item k={B.phone} v={g.phone ? <a href={`tel:${g.phone.replace(/\s/g, "")}`} className="text-ionian underline underline-offset-4">{g.phone}</a> : A.common.none} />
                <Item k={B.country} v={g.country ?? A.common.none} />
                <Item k={B.arrivalTime} v={g.arrivalTime ?? A.common.none} />
                <Item k={B.marketing} v={g.marketing ? B.yes : B.no} />
                {g.message && <Item k={B.message} v={<span className="whitespace-pre-line">{g.message}</span>} wide />}
              </dl>
            ) : (
              <p className="text-ink-soft">{A.common.none}</p>
            )}
          </Card>

          <Card title={B.payments}>
            {payments.length === 0 ? (
              <p className="text-ink-soft">{B.noPayments}</p>
            ) : (
              <div className={table.wrap}>
                <table className={table.table}>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className={table.td}>{B.kinds[p.kind]}</td>
                        <td className={cn(table.td, "text-right tabular-nums")}>{money(p.amountCents)}</td>
                        <td className={table.td}>
                          {B.paymentStatus[p.status]}
                          {p.refundedCents > 0 && <span className="text-ink-soft"> · {B.refunded} {money(p.refundedCents)}</span>}
                          {p.failure && <span className="block text-[0.8125rem] text-[#9a4a2a]">{p.failure}</span>}
                        </td>
                        <td className={cn(table.td, "text-[0.8125rem] whitespace-nowrap text-ink-soft")}>{dateTime(p.createdAt)}</td>
                        <td className={cn(table.td, "text-[0.8125rem]")}>
                          {p.provider === "stripe" ? (
                            <a href={stripeUrl(p.providerRef)} target="_blank" rel="noreferrer" className="text-ionian underline underline-offset-4">
                              {B.openInStripe}
                            </a>
                          ) : (
                            <span className="text-ink-soft">
                              {B.providers[p.provider as keyof typeof B.providers] ?? p.provider}
                              {p.provider === "manual" && ` · ${B.methods[p.providerRef.split("-")[1] as keyof typeof B.methods] ?? ""}`}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {canRecord && (
            <Card title={B.manualTitle}>
              <p className="mb-4 text-[0.9375rem] text-ink-soft">{B.manualLead}</p>
              <ActionForm action={adminManualPayment} submit={B.manualSubmit} submitClass={buttonOutline} confirm={`${B.manualSubmit}?`}>
                <input type="hidden" name="id" value={r.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="mp-amount" className={label}>{B.manualAmount}</label>
                    <input id="mp-amount" name="amount" inputMode="decimal" required defaultValue={(suggested / 100).toFixed(2)} className={input} />
                  </div>
                  <div>
                    <label htmlFor="mp-method" className={label}>{B.manualMethod}</label>
                    <select id="mp-method" name="method" defaultValue="transfer" className={input}>
                      {Object.entries(B.methods).map(([k, text]) => (
                        <option key={k} value={k}>{text}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </ActionForm>
            </Card>
          )}

          {refundable.length > 0 && (
            <Card title={B.refundTitle}>
              <p className="mb-4 text-[0.9375rem] text-ink-soft">{B.refundLead}</p>
              <ActionForm action={adminRefund} submit={B.refundSubmit} submitClass={buttonOutline} confirm={B.refundSubmit + "?"}>
                <input type="hidden" name="id" value={r.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="rf-payment" className={label}>{B.refundPayment}</label>
                    <select id="rf-payment" name="payment" className={input}>
                      {refundable.map((p) => (
                        <option key={p.id} value={p.providerRef}>
                          {B.kinds[p.kind]} · {money(p.amountCents - p.refundedCents)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="rf-amount" className={label}>{B.refundAmount}</label>
                    <input id="rf-amount" name="amount" inputMode="decimal" required className={input} />
                  </div>
                </div>
              </ActionForm>
            </Card>
          )}

          {r.status === "confirmed" && (
            <Card title={B.securityTitle}>
              {security ? (
                <>
                  <p className="mb-4 text-[0.9375rem] text-ink-soft">{fill(B.securityLead, { amount: money(security.amountCents) })}</p>
                  <ActionForm action={adminSecurity} submit={B.captureSubmit} submitClass={buttonOutline} confirm={B.captureSubmit + "?"}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="payment" value={security.providerRef} />
                    <input type="hidden" name="op" value="capture" />
                    <div className="max-w-xs">
                      <label htmlFor="sec-amount" className={label}>{B.captureAmount}</label>
                      <input id="sec-amount" name="amount" inputMode="decimal" required className={input} />
                    </div>
                  </ActionForm>
                  <ActionForm action={adminSecurity} submit={B.releaseSubmit} submitClass={buttonOutline} className="mt-4">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="payment" value={security.providerRef} />
                    <input type="hidden" name="op" value="release" />
                  </ActionForm>
                </>
              ) : (
                <p className="text-[0.9375rem] text-ink-soft">{B.securityNone}</p>
              )}
            </Card>
          )}

          {r.status === "confirmed" && (
            <Card title={B.cancelTitle}>
              <p className="mb-4 text-[0.9375rem] text-ink-soft">{B.cancelLead}</p>
              <ActionForm action={adminCancel} submit={B.cancelSubmit} submitClass={buttonDanger}>
                <input type="hidden" name="id" value={r.id} />
                <fieldset className="space-y-2">
                  <legend className={label}>{B.refundMode}</legend>
                  {(
                    [
                      ["policy", fill(B.refundModes.policy, { amount: money(preview.refundCents), percent: preview.percent })],
                      ["full", fill(B.refundModes.full, { amount: money(preview.paidCents) })],
                      ["none", B.refundModes.none],
                      ["custom", B.refundModes.custom],
                    ] as const
                  ).map(([value, text], i) => (
                    <label key={value} className="flex items-center gap-2 text-[0.9375rem]">
                      <input type="radio" name="mode" value={value} defaultChecked={i === 0} className="accent-ionian" /> {text}
                    </label>
                  ))}
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="c-amount" className={label}>{B.customAmount}</label>
                    <input id="c-amount" name="amount" inputMode="decimal" className={input} />
                  </div>
                  <div>
                    <label htmlFor="c-reason" className={label}>{B.reason}</label>
                    <input id="c-reason" name="reason" maxLength={500} className={input} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[0.9375rem]">
                  <input type="checkbox" name="confirm" className="accent-ionian" /> {B.cancelConfirm}
                </label>
              </ActionForm>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title={B.money}>
            <dl className="space-y-2 text-[0.9375rem]">
              <Row k={B.total} v={money(r.totalCents)} strong />
              <Row k={B.paid} v={money(paidCents(payments))} />
              {refunded > 0 && <Row k={B.refunded} v={money(refunded)} />}
              {r.status === "confirmed" && <Row k={B.outstanding} v={money(outstandingCents(r, payments))} />}
              {r.status === "confirmed" && outstandingCents(r, payments) > 0 && <Row k={B.balanceDue} v={shortDate(balanceDueDate(r, config))} />}
            </dl>
            <details className="mt-4 text-[0.875rem]">
              <summary className="cursor-pointer text-ionian">{B.quote}</summary>
              <dl className="mt-3 space-y-1">
                <Row k={`${q.nights.length} × ${A.calendar.nights}`} v={money(q.accommodationCents)} />
                {q.extraGuestCents > 0 && <Row k={B.extraGuests} v={money(q.extraGuestCents)} />}
                {q.cleaningCents > 0 && <Row k={A.pricing.cleaning} v={money(q.cleaningCents)} />}
                {q.discount && <Row k={fill(B.discount, { percent: q.discount.percent })} v={`−${money(q.discount.cents)}`} />}
                {q.lineItems.map((l) => (
                  <Row key={l.id} k={l.label.el} v={money(l.cents)} />
                ))}
              </dl>
            </details>
          </Card>

          <Card title={B.notes}>
            {notes.length === 0 ? (
              <p className="text-[0.9375rem] text-ink-soft">{B.noNotes}</p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="text-[0.9375rem]">
                    <p className="whitespace-pre-line">{n.body}</p>
                    <p className="text-[0.75rem] text-ink-soft">{dateTime(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={addNote} submit={B.noteSubmit} submitClass={button} className="mt-4" resetOnSuccess>
              <input type="hidden" name="id" value={r.id} />
              <label htmlFor="note" className="sr-only">{B.notePlaceholder}</label>
              <textarea id="note" name="body" rows={3} maxLength={4000} required placeholder={B.notePlaceholder} className={input} />
            </ActionForm>
          </Card>

          {r.status === "confirmed" && (
            <Card title={B.emailsTitle}>
              <ActionForm action={resendConfirmation} submit={B.resendConfirmation} submitClass={buttonOutline}>
                <input type="hidden" name="id" value={r.id} />
              </ActionForm>
              {manageUrl(r) && (
                <div className="mt-4">
                  <label htmlFor="guest-link" className={label}>{B.guestLink}</label>
                  <input id="guest-link" readOnly value={manageUrl(r)!} className={cn(input, "text-[0.8125rem]")} />
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Item({ k, v, wide }: { k: string; v: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[0.8125rem] text-ink-soft">{k}</dt>
      <dd className="mt-0.5 text-ink">{v}</dd>
    </div>
  );
}
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "font-medium")}>
      <dt className="text-ink-soft">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
