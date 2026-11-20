import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import type { Locale } from "@/i18n/routing";
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
