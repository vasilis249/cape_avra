import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing, type AppPathname, type Locale } from "@/i18n/routing";

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://capeavra.com").replace(/\/$/, "");

const ogLocale: Record<Locale, string> = { en: "en_GB", el: "el_GR" };

/** Canonical + hreflang alternates (incl. x-default) for a route. */
export function alternatesFor(href: AppPathname, locale: Locale): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = siteUrl + getPathname({ href, locale: l });
  }
  languages["x-default"] = siteUrl + getPathname({ href, locale: routing.defaultLocale });
  return { canonical: siteUrl + getPathname({ href, locale }), languages };
}

/** Open Graph text fields. The share image comes from app/[locale]/opengraph-image.tsx (1200×630). */
export function openGraphFor(locale: Locale, title: string, description: string) {
  return {
    type: "website" as const,
    siteName: "Cape Avra",
    title,
    description,
    locale: ogLocale[locale],
    alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => ogLocale[l]),
    // child segments that set openGraph replace the inherited file-based image, so link it explicitly
    images: [{ url: `/${locale}/opengraph-image`, width: 1200, height: 630, alt: "Cape Avra" }],
  };
}
