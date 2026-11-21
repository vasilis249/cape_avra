import "server-only";
import { emailLayout, sendEmail } from "@/lib/email";
import { arrivalInfo, stayTimes } from "@content/property";
import { siteConfig } from "@content/site.config";
import el from "@content/messages/el.json";
import en from "@content/messages/en.json";
import type { BookingConfig } from "./config-schema";
import { addDays, diffDays } from "./dates";
import { formatMoney } from "./pricing";
import type { Reservation } from "./store";

const M = { en: en.emails, el: el.emails };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));
const longDate = (d: string, locale: "en" | "el") =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function stayRows(r: Reservation, config: BookingConfig) {
  const m = M[r.locale];
  const money = (c: number) => formatMoney(c, r.locale);
  const paid = r.payment?.paidCents ?? 0;
  const balance = r.totalCents - paid;
  const rows: [string, string][] = [
    [m.rows.reference, r.ref],
    [m.rows.arrival, `${longDate(r.checkIn, r.locale)}${stayTimes.checkIn ? `, ${fill(m.rows.from, { time: stayTimes.checkIn })}` : ""}`],
    [m.rows.departure, `${longDate(r.checkOut, r.locale)}${stayTimes.checkOut ? `, ${fill(m.rows.by, { time: stayTimes.checkOut })}` : ""}`],
    [m.rows.nights, String(diffDays(r.checkIn, r.checkOut))],
    [m.rows.guests, String(r.guests)],
    [m.rows.total, money(r.totalCents)],
    [m.rows.paid, money(paid)],
  ];
  if (balance > 0) {
    const due = addDays(r.checkIn, -config.payment.balanceDaysBeforeArrival);
    rows.push([m.rows.balance, fill(m.rows.balanceDue, { amount: money(balance), date: longDate(due, r.locale) })]);
  }
  return rows;
}

export async function sendConfirmationEmails(r: Reservation, config: BookingConfig) {
  if (!r.guest) return;
  const m = M[r.locale].confirmation;
  const guestMail = emailLayout(m.title, stayRows(r, config), fill(m.intro, { name: r.guest.name, ref: r.ref }), {
    outro: fill(m.outro, { days: config.emails.preArrivalDaysBefore }),
    note: r.payment?.status === "test" ? m.testNote : undefined,
  });
  await sendEmail({ to: r.guest.email, subject: fill(m.subject, { ref: r.ref }), replyTo: siteConfig.contact.email, ...guestMail });

  // owner notification, always in Greek
  const g = r.guest;
  const owner = emailLayout(`Νέα κράτηση ${r.ref}`, [
    ...stayRows({ ...r, locale: "el" }, config),
    ["Όνομα", g.name],
    ["Email", g.email],
    ["Τηλέφωνο", g.phone ?? "—"],
    ["Χώρα", g.country ?? "—"],
    ["Ώρα άφιξης", g.arrivalTime ?? "—"],
    ["Μήνυμα", g.message ?? "—"],
    ["Πληρωμή", `${r.payment?.provider ?? "—"} · ${r.payment?.status ?? "—"}`],
  ]);
  await sendEmail({
    to: process.env.OWNER_NOTIFICATION_EMAIL ?? siteConfig.contact.email,
    subject: `Νέα κράτηση ${r.ref}: ${r.checkIn} → ${r.checkOut}, ${r.guests} άτομα`,
    replyTo: g.email,
    ...owner,
  });
}

export async function sendPreArrivalEmail(r: Reservation, config: BookingConfig) {
  if (!r.guest) return;
  const m = M[r.locale].preArrival;
  const rows = stayRows(r, config).slice(0, 5);
  if (arrivalInfo.address) rows.push([M[r.locale].rows.address, arrivalInfo.address]);
  if (arrivalInfo.notes) rows.push([M[r.locale].rows.notes, arrivalInfo.notes[r.locale]]);
  const mail = emailLayout(m.title, rows, fill(m.intro, { name: r.guest.name, date: longDate(r.checkIn, r.locale) }), {
    cta: arrivalInfo.mapsUrl ? { label: M[r.locale].rows.directions, url: arrivalInfo.mapsUrl } : undefined,
    outro: arrivalInfo.address ? m.outro : `${m.noAddress}\n\n${m.outro}`,
  });
  await sendEmail({
    to: r.guest.email,
    subject: fill(m.subject, { days: config.emails.preArrivalDaysBefore }),
    replyTo: siteConfig.contact.email,
    ...mail,
  });
}

export async function sendReviewEmail(r: Reservation) {
  if (!r.guest) return;
  const m = M[r.locale].review;
  const mail = emailLayout(m.title, [], fill(m.intro, { name: r.guest.name }), {
    outro: arrivalInfo.reviewUrl ? m.ask : m.askReply,
    cta: arrivalInfo.reviewUrl ? { label: m.link, url: arrivalInfo.reviewUrl } : undefined,
  });
  await sendEmail({ to: r.guest.email, subject: m.subject, replyTo: siteConfig.contact.email, ...mail });
}
