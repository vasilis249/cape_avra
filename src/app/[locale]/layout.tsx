import type { Metadata, Viewport } from "next";
import { locale as rootLocale } from "next/root-params";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ConsentBanner } from "@/components/layout/ConsentBanner";
import { MobileBookBar } from "@/components/layout/MobileBookBar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { isLocale, routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/seo";
import { capacity } from "@content/property";
import { isPreview, siteConfig } from "@content/site.config";
import { display, sans } from "../fonts";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(siteUrl),
    title: { default: t("siteTitle"), template: "%s · Cape Avra" },
    description: t("siteDescription", {
      bedrooms: capacity.bedrooms,
      guests: capacity.guests,
      season: siteConfig.earlyBookingSeason[locale],
    }),
    applicationName: "Cape Avra",
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#1b2433",
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootLocale();
  if (!isLocale(locale)) notFound();
  const t = await getTranslations({ locale });

  return (
    <html lang={locale} className={`${display.variable} ${sans.variable}`}>
      <body>
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <a
          href="#main"
          className="sr-only z-[60] bg-ionian px-4 py-3 text-salt focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {t("nav.skip")}
        </a>
        <NextIntlClientProvider messages={null}>
          {children}
          <SiteFooter />
          <MobileBookBar
            label={isPreview ? t("cta.earlyBooking") : t("cta.checkAvailability")}
            note={t("cta.bookDirectShort", { season: siteConfig.earlyBookingSeason[locale] })}
          />
          <ConsentBanner
            labels={{
              label: t("cookies.label"),
              text: t("cookies.text"),
              accept: t("cookies.accept"),
              decline: t("cookies.decline"),
              policy: t("cookies.policy"),
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
