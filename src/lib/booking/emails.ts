import "server-only";
import { getPathname } from "@/i18n/navigation";
import { emailLayout, sendEmail } from "@/lib/email";
import { paidCents, type Notifier } from "@/lib/payments/service";
import { siteUrl } from "@/lib/seo";
import { arrivalInfo, stayTimes } from "@content/property";
import { siteConfig } from "@content/site.config";
import el from "@content/messages/el.json";
import en from "@content/messages/en.json";
import type { BookingConfig } from "./config-schema";
import { addDays, diffDays } from "./dates";
import { formatMoney } from "./pricing";
import type { Payment, Reservation } from "./store";
import { manageToken } from "./tokens";

const M = { en: en.emails, el: el.emails };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));
const longDate = (d: string, locale: "en" | "el") =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const ownerInbox = () => process.env.OWNER_NOTIFICATION_EMAIL ?? siteConfig.contact.email;
const isTest = (payments: Payment[]) => payments.some((p) => p.provider === "test");

/** private link to the guest's booking (pay the balance, cancel) */
export function manageUrl(r: Reservation): string | null {
  const t = manageToken(r.ref);
  return t ? `${siteUrl}${getPathname({ href: { pathname: "/book/manage", query: { ref: r.ref, t } }, locale: r.locale })}` : null;
}

function stayRows(r: Reservation, config: BookingConfig, payments: Payment[]) {
  const m = M[r.locale];
  const money = (c: number) => formatMoney(c, r.locale);
  const paid = paidCents(payments);
  const balance = r.status === "cancelled" ? 0 : r.totalCents - paid;
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
    const due = r.balanceDueDate ?? addDays(r.checkIn, -config.payment.balanceDaysBeforeArrival);
    rows.push([m.rows.balance, fill(m.rows.balanceDue, { amount: money(balance), date: longDate(due, r.locale) })]);
  }
  if (config.payment.securityDeposit > 0 && r.status !== "cancelled") {
    rows.push([m.rows.securityDeposit, fill(m.rows.securityDepositNote, { amount: money(config.payment.securityDeposit * 100), days: config.payment.securityDepositReleaseDays })]);
  }
  return rows;
}

function guestRows(r: Reservation): [string, string][] {
  const g = r.guest!;
  return [
    ["Όνομα", g.name],
    ["Email", g.email],
    ["Τηλέφωνο", g.phone ?? "—"],
    ["Χώρα", g.country ?? "—"],
    ["Ώρα άφιξης", g.arrivalTime ?? "—"],
    ["Μήνυμα", g.message ?? "—"],
  ];
}

export function createEmailNotifier(config: BookingConfig): Notifier {
  return {
    async confirmed(r, payments) {
      if (!r.guest) return;
      const m = M[r.locale].confirmation;
      const link = manageUrl(r);
      const guestMail = emailLayout(m.title, stayRows(r, config, payments), fill(m.intro, { name: r.guest.name, ref: r.ref }), {
        cta: link ? { label: M[r.locale].manage, url: link } : undefined,
        outro: fill(m.outro, { days: config.emails.preArrivalDaysBefore }),
        note: isTest(payments) ? m.testNote : undefined,
      });
      await sendEmail({ to: r.guest.email, subject: fill(m.subject, { ref: r.ref }), replyTo: siteConfig.contact.email, ...guestMail });

      // owner notification, always in Greek
      const owner = emailLayout(`Νέα κράτηση ${r.ref}`, [
        ...stayRows({ ...r, locale: "el" }, config, payments),
        ...guestRows(r),
        ["Πληρωμή", payments.map((p) => `${p.kind} ${formatMoney(p.amountCents, "el")} · ${p.provider} ${p.providerRef}`).join("\n") || "—"],
      ], undefined, { note: isTest(payments) ? "Δοκιμαστική πληρωμή: δεν χρεώθηκαν χρήματα." : undefined });
      await sendEmail({ to: ownerInbox(), subject: `Νέα κράτηση ${r.ref}: ${r.checkIn} → ${r.checkOut}, ${r.guests} άτομα`, replyTo: r.guest.email, ...owner });
    },

    async balancePaid(r, payments) {
      if (!r.guest) return;
      const m = M[r.locale].balancePaid;
      const mail = emailLayout(m.title, stayRows(r, config, payments).slice(0, 7), fill(m.intro, { name: r.guest.name }), {
        outro: fill(m.outro, { days: config.emails.preArrivalDaysBefore }),
      });
      await sendEmail({ to: r.guest.email, subject: fill(m.subject, { ref: r.ref }), replyTo: siteConfig.contact.email, ...mail });
    },

    async balanceFailed(r, reason) {
      if (!r.guest) return;
      const m = M[r.locale].balanceFailed;
      const link = manageUrl(r);
      const mail = emailLayout(m.title, stayRows(r, config, []).slice(0, 3), fill(m.intro, { name: r.guest.name, amount: formatMoney(r.quote.payment.balanceCents, r.locale) }), {
        cta: link ? { label: m.cta, url: link } : undefined,
        outro: m.outro,
      });
      await sendEmail({ to: r.guest.email, subject: fill(m.subject, { ref: r.ref }), replyTo: siteConfig.contact.email, ...mail });
      const owner = emailLayout(`Η αυτόματη χρέωση υπολοίπου απέτυχε · ${r.ref}`, [
        ["Κράτηση", `${r.ref} · ${r.checkIn} → ${r.checkOut}`],
        ["Υπόλοιπο", formatMoney(r.quote.payment.balanceCents, "el")],
        ["Αιτία", reason],
        ...guestRows(r),
      ], "Ο επισκέπτης έλαβε email με σύνδεσμο για να πληρώσει online. Αν δεν πληρώσει, επικοινωνήστε μαζί του.");
      await sendEmail({ to: ownerInbox(), subject: `Αποτυχία χρέωσης υπολοίπου ${r.ref}`, replyTo: r.guest.email, ...owner });
    },

    async cancelled(r, refundCents, payments) {
      if (!r.guest) return;
      const m = M[r.locale].cancellation;
      const money = formatMoney(refundCents, r.locale);
      const intro = r.cancellation?.by === "owner" ? m.introOwner : m.intro;
      const mail = emailLayout(m.title, stayRows(r, config, payments).slice(0, 5), fill(intro, { name: r.guest.name, ref: r.ref }), {
        outro: refundCents > 0 ? fill(m.refund, { amount: money }) : m.noRefund,
        note: isTest(payments) ? M[r.locale].confirmation.testNote : undefined,
      });
      await sendEmail({ to: r.guest.email, subject: fill(m.subject, { ref: r.ref }), replyTo: siteConfig.contact.email, ...mail });
      const owner = emailLayout(`Ακύρωση κράτησης ${r.ref}`, [
        ["Κράτηση", `${r.ref} · ${r.checkIn} → ${r.checkOut}`],
        ["Από", r.cancellation?.by === "guest" ? "Επισκέπτη (online)" : r.cancellation?.by === "owner" ? "Εσάς (διαχείριση)" : (r.cancellation?.by ?? "—")],
        ["Επιστροφή", `${formatMoney(refundCents, "el")} (${r.cancellation?.refundPercent ?? 0}% των πληρωμών)`],
        ...guestRows(r),
      ], "Οι ημερομηνίες είναι ξανά διαθέσιμες στο ημερολόγιο.");
      await sendEmail({ to: ownerInbox(), subject: `Ακύρωση ${r.ref}: ${r.checkIn} → ${r.checkOut}`, replyTo: r.guest.email, ...owner });
    },

    async conflictRefunded(r, refundCents) {
      if (!r.guest) return;
      const m = M[r.locale].conflict;
      const mail = emailLayout(m.title, stayRows(r, config, []).slice(0, 3), fill(m.intro, { name: r.guest.name, amount: formatMoney(refundCents, r.locale) }), {
        outro: m.outro,
      });
      await sendEmail({ to: r.guest.email, subject: fill(m.subject, { ref: r.ref }), replyTo: siteConfig.contact.email, ...mail });
      const owner = emailLayout(`Πληρωμή μετά τη λήξη της κράτησης · ${r.ref}`, [
        ["Κράτηση", `${r.ref} · ${r.checkIn} → ${r.checkOut}`],
        ["Επιστροφή", formatMoney(refundCents, "el")],
        ...guestRows(r),
      ], "Ο επισκέπτης πλήρωσε αφού είχε λήξει η προσωρινή κράτηση και οι ημερομηνίες είχαν ήδη κλειστεί. Έγινε αυτόματα πλήρης επιστροφή. Ίσως αξίζει να του προτείνετε άλλες ημερομηνίες.");
      await sendEmail({ to: ownerInbox(), subject: `Αυτόματη επιστροφή ${r.ref}`, replyTo: r.guest.email, ...owner });
    },

    async securityHoldFailed(r, reason) {
      const owner = emailLayout(`Η εγγύηση δεν δεσμεύτηκε · ${r.ref}`, [
        ["Κράτηση", `${r.ref} · ${r.checkIn} → ${r.checkOut}`],
        ["Ποσό", formatMoney(config.payment.securityDeposit * 100, "el")],
        ["Αιτία", reason],
        ...(r.guest ? guestRows(r) : []),
      ], "Η κάρτα του επισκέπτη δεν δέχτηκε τη δέσμευση της εγγύησης (συχνά η τράπεζα ζητά επιβεβαίωση από τον κάτοχο). Ζητήστε την εγγύηση κατά την άφιξη.");
      await sendEmail({ to: ownerInbox(), subject: `Εγγύηση ${r.ref}: αποτυχία δέσμευσης`, replyTo: r.guest?.email, ...owner });
    },
  };
}

export async function sendPreArrivalEmail(r: Reservation, config: BookingConfig) {
  if (!r.guest) return;
  const m = M[r.locale].preArrival;
  const rows = stayRows(r, config, []).slice(0, 5);
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
