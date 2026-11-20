import { getTranslations } from "next-intl/server";
import { AgaveMotif } from "@/components/brand/AgaveMotif";
import { CookieSettingsButton } from "@/components/layout/ConsentBanner";
import { Wordmark } from "@/components/brand/Wordmark";
import { Container } from "@/components/ui/Layout";
import { Link } from "@/i18n/navigation";
import type { AppPathname } from "@/i18n/routing";
import { siteConfig } from "@content/site.config";

export async function SiteFooter() {
  const t = await getTranslations();
  const explore: { href: AppPathname; label: string }[] = [
    { href: "/the-house", label: t("nav.house") },
    { href: "/gallery", label: t("nav.gallery") },
    { href: "/location", label: t("nav.location") },
    { href: "/faq", label: t("nav.faq") },
    { href: "/book", label: t("cta.earlyBookingShort") },
  ];
  const legal: { href: AppPathname; label: string }[] = [
    { href: "/legal/privacy", label: t("footer.privacy") },
    { href: "/legal/cookies", label: t("footer.cookies") },
    { href: "/legal/terms", label: t("footer.terms") },
    { href: "/legal/imprint", label: t("footer.imprint") },
  ];
  const { contact, social, legal: legalCfg } = siteConfig;
  const linkClass = "inline-flex min-h-10 items-center text-salt/80 transition-colors hover:text-salt";

  return (
    <footer className="relative overflow-hidden bg-night pb-28 text-salt lg:pb-0">
      <AgaveMotif className="pointer-events-none absolute -bottom-6 right-4 w-28 text-agave/25 sm:right-12 lg:w-40" />
      <Container className="relative py-16 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Wordmark className="w-56 text-salt sm:w-72" />
            <p className="mt-5 font-display text-xl italic text-agave">{t("footer.tagline")}</p>
            <p className="mt-6 text-[0.9375rem] text-salt/70">{t("footer.address")}</p>
          </div>

          <nav aria-label={t("footer.exploreTitle")} className="lg:col-span-2">
            <h2 className="font-sans text-eyebrow font-medium uppercase text-agave">{t("footer.exploreTitle")}</h2>
            <ul className="mt-4 space-y-1 text-[0.9375rem]">
              {explore.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="lg:col-span-3">
            <h2 className="font-sans text-eyebrow font-medium uppercase text-agave">{t("footer.contactTitle")}</h2>
            <ul className="mt-4 space-y-1 text-[0.9375rem]">
              <li>
                <a href={`mailto:${contact.email}`} className={linkClass}>
                  {contact.email}
                </a>
              </li>
              {social.instagram && (
                <li>
                  <a
                    href={`https://www.instagram.com/${social.instagram}/`}
                    className={linkClass}
                    rel="noopener"
                    title={t("footer.instagram")}
                  >
                    @{social.instagram}
                  </a>
                </li>
              )}
              <li>
                <Link href="/contact" className={linkClass}>
                  {t("nav.contact")}
                </Link>
              </li>
            </ul>
          </div>

          <nav aria-label={t("footer.legalTitle")} className="lg:col-span-2">
            <h2 className="font-sans text-eyebrow font-medium uppercase text-agave">{t("footer.legalTitle")}</h2>
            <ul className="mt-4 space-y-1 text-[0.9375rem]">
              {legal.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <CookieSettingsButton label={t("cookies.settings")} className={linkClass} />
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-salt/15 pt-6 text-[0.8125rem] text-salt/60 sm:flex-row sm:justify-between">
          <p>{t("footer.rights", { year: 2026 })}</p>
          {legalCfg.ama && <p>{t("footer.ama", { ama: legalCfg.ama })}</p>}
        </div>
      </Container>
    </footer>
  );
}
