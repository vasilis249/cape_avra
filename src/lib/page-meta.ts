import type { Metadata } from "next";
import { locale as rootLocale } from "next/root-params";
import { isLocale, type AppPathname, type Locale } from "@/i18n/routing";
import { getPhoto } from "@/lib/photos";
import { alternatesFor, openGraphFor } from "@/lib/seo";
import type { PhotoId } from "@content/photos";

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
  photo?: PhotoId;
}): Metadata {
  const meta: Metadata = {
    title: opts.title,
    description: opts.description,
    alternates: alternatesFor(opts.href, opts.locale),
  };
  if (opts.photo) {
    const p = getPhoto(opts.photo, opts.locale);
    meta.openGraph = openGraphFor(opts.locale, `${opts.title} · Cape Avra`, opts.description, {
      url: p.src,
      width: p.width,
      height: p.height,
      alt: p.alt,
    });
  }
  return meta;
}
