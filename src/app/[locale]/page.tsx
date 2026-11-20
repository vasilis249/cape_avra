import type { Metadata } from "next";
import { locale as rootLocale } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { BookingCta } from "@/components/sections/home/BookingCta";
import { GalleryTeaser } from "@/components/sections/home/GalleryTeaser";
import { Hero } from "@/components/sections/home/Hero";
import { Highlights } from "@/components/sections/home/Highlights";
import { HouseTeaser } from "@/components/sections/home/HouseTeaser";
import { Intro } from "@/components/sections/home/Intro";
import { LocationTeaser } from "@/components/sections/home/LocationTeaser";
import { Reviews } from "@/components/sections/home/Reviews";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPathname } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { getPhoto } from "@/lib/photos";
import { alternatesFor, openGraphFor, siteUrl } from "@/lib/seo";
import { vacationRentalJsonLd } from "@/lib/structured-data";
import { capacity } from "@content/property";
import { siteConfig } from "@content/site.config";

async function getLocaleOrDefault(): Promise<Locale> {
  const l = await rootLocale();
  return isLocale(l) ? l : "en";
}

async function description(locale: Locale) {
  const t = await getTranslations({ locale, namespace: "meta" });
  return t("siteDescription", {
    bedrooms: capacity.bedrooms,
    guests: capacity.guests,
    season: siteConfig.earlyBookingSeason[locale],
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleOrDefault();
  const t = await getTranslations({ locale, namespace: "meta" });
  const hero = getPhoto("blue-hour-agaves", locale);
  const desc = await description(locale);
  return {
    title: { absolute: t("siteTitle") },
    description: desc,
    alternates: alternatesFor("/", locale),
    openGraph: openGraphFor(locale, t("siteTitle"), desc, {
      url: hero.src,
      width: hero.width,
      height: hero.height,
      alt: t("ogAlt"),
    }),
  };
}

export default async function HomePage() {
  const locale = await getLocaleOrDefault();
  const url = siteUrl + getPathname({ href: "/", locale });

  return (
    <>
      <JsonLd data={vacationRentalJsonLd(locale, url, await description(locale))} />
      <SiteHeader variant="overlay" />
      <main id="main">
        <Hero locale={locale} />
        <Intro />
        <Highlights />
        <HouseTeaser />
        <GalleryTeaser />
        <BookingCta locale={locale} />
        <LocationTeaser />
        <Reviews locale={locale} />
      </main>
    </>
  );
}
