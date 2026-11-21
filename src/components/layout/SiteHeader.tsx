import { getTranslations } from "next-intl/server";
import { Monogram } from "@/components/brand/Monogram";
import { Wordmark } from "@/components/brand/Wordmark";
import { isPreview } from "@content/site.config";
import { HeaderClient, type NavItem } from "./HeaderClient";

export async function SiteHeader({ variant = "solid" }: { variant?: "overlay" | "solid" }) {
  const t = await getTranslations();
  const nav: NavItem[] = [
    { href: "/the-house", label: t("nav.house") },
    { href: "/gallery", label: t("nav.gallery") },
    { href: "/location", label: t("nav.location") },
    { href: "/faq", label: t("nav.faq") },
    { href: "/contact", label: t("nav.contact") },
  ];
  return (
    <HeaderClient
      variant={variant}
      nav={nav}
      cta={{ href: "/book", label: isPreview ? t("cta.earlyBookingShort") : t("cta.bookShort") }}
      labels={{
        menu: t("nav.menu"),
        close: t("nav.close"),
        primary: t("nav.primary"),
        language: t("nav.language"),
        home: t("nav.home"),
      }}
      languageNames={{ en: t("languages.en"), el: t("languages.el") }}
      wordmark={<Wordmark decorative />}
      monogram={<Monogram />}
    />
  );
}
