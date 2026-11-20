import type { Metadata } from "next";
import { locale as rootLocale } from "next/root-params";
import { isLocale, type AppPathname, type Locale } from "@/i18n/routing";
import { alternatesFor, openGraphFor } from "@/lib/seo";

export async function currentLocale(): Promise<Locale> {
  const l = await rootLocale();
  return isLocale(l) ? l : "en";
}

/** Title, description, canonical/hreflang and Open Graph for an inner page. */
export function pageMetadata(opts: {
  locale: Locale;
  href: AppPathname;
  title: string;
  description: string;
}): Metadata {
  return {
    title: opts.title,
    description: opts.description,
    alternates: alternatesFor(opts.href, opts.locale),
    openGraph: openGraphFor(opts.locale, `${opts.title} · Cape Avra`, opts.description),
  };
}
