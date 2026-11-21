import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import type { Locale } from "@/i18n/routing";
import { bookingSeed } from "@content/booking";
import { capacity, stayTimes } from "@content/property";
import { siteConfig } from "@content/site.config";

export type MarkdownPage = { title: string; description: string; updated: string; draft: boolean; html: string };

/**
 * Long-form pages (legal) live in content/pages/<locale>/<slug>.md with a small
 * front-matter block. {{placeholders}} are filled from the site config so facts
 * (email, ΑΜΑ, capacity…) are written once.
 */
export async function loadMarkdownPage(locale: Locale, slug: string): Promise<MarkdownPage> {
  "use cache"; // file content only changes with a deploy
  const file = path.join(process.cwd(), "content/pages", locale, `${slug}.md`);
  const raw = await readFile(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing front matter`);
  const fm = Object.fromEntries(
    match[1].split("\n").map((line) => {
      const i = line.indexOf(":");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
  );

  const vars: Record<string, string> = {
    email: siteConfig.contact.email,
    domain: siteConfig.domain,
    ama: siteConfig.legal.ama ?? (locale === "el" ? "(εκκρεμεί)" : "(pending)"),
    operator: siteConfig.legal.operator ?? (locale === "el" ? "(θα συμπληρωθεί)" : "(to be completed)"),
    taxId: siteConfig.legal.taxId ?? "—",
    address: locale === "el" ? "Μύτικας, Πρέβεζα 48100, Ελλάδα" : "Mytikas, Preveza 48100, Greece",
    guests: String(capacity.guests),
    checkIn: stayTimes.checkIn ?? "—",
    checkOut: stayTimes.checkOut ?? "—",
    ...paymentVars(locale),
  };
  const body = match[2].replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);

  return {
    title: fm.title,
    description: fm.description ?? "",
    updated: fm.updated ?? "",
    draft: fm.draft === "true",
    html: await marked.parse(body, { gfm: true }),
  };
}

/** Payment and cancellation facts for the terms, from the booking config (one source of truth). */
function paymentVars(locale: Locale): Record<string, string> {
  const { payment, cancellation } = bookingSeed;
  const euro = (n: number) => new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const tiers = [...cancellation].sort((a, b) => b.daysBefore - a.daysBefore);
  const list = tiers
    .map((t, i) => {
      const prev = tiers[i - 1]?.daysBefore;
      if (locale === "el") {
        return t.daysBefore > 0
          ? `- ${t.daysBefore} ημέρες ή περισσότερο πριν την άφιξη: επιστροφή ${t.refundPercent}% όσων έχετε πληρώσει`
          : `- λιγότερο από ${prev ?? 0} ημέρες πριν την άφιξη: επιστροφή ${t.refundPercent}%`;
      }
      return t.daysBefore > 0
        ? `- ${t.daysBefore} days or more before arrival: ${t.refundPercent}% of what you have paid is refunded`
        : `- less than ${prev ?? 0} days before arrival: ${t.refundPercent}% refund`;
    })
    .join("\n");
  return {
    depositPercent: String(payment.depositPercent),
    balanceDays: String(payment.balanceDaysBeforeArrival),
    securityDeposit: euro(payment.securityDeposit),
    releaseDays: String(payment.securityDepositReleaseDays),
    cancellationList: list,
  };
}
