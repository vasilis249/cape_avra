import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LeadForm } from "@/components/forms/LeadForm";
import { leadFormLabels } from "@/components/forms/lead-form-labels";
import { privacyConsentLabel } from "@/components/forms/PrivacyConsentLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/ui/Layout";
import { currentLocale, pageMetadata } from "@/lib/page-meta";
import { capacity } from "@content/property";
import { siteConfig } from "@content/site.config";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = await getTranslations({ locale, namespace: "meta.pages.contact" });
  return pageMetadata({ locale, href: "/contact", title: t("title"), description: t("description") });
}

export default async function ContactPage() {
  const locale = await currentLocale();
  const t = await getTranslations("contact");
  const { email, phone, whatsapp, viber } = siteConfig.contact;
  const digits = phone?.replace(/[^\d]/g, "");
  const channel = "flex items-baseline justify-between gap-6 border-b border-limestone/70 py-4";

  return (
    <>
      <SiteHeader variant="solid" />
      <main id="main">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
        <Container className="grid gap-14 pb-24 lg:grid-cols-12 lg:gap-10 lg:pb-32">
          <aside className="lg:col-span-4" aria-labelledby="direct-title">
            <h2 id="direct-title" className="text-h3 text-ionian">
              {t("directTitle")}
            </h2>
            <dl className="mt-6 border-t border-limestone/70">
              <div className={channel}>
                <dt className="text-[0.8125rem] tracking-[0.12em] text-ink-soft uppercase">{t("email")}</dt>
                <dd>
                  <a href={`mailto:${email}`} className="font-display text-lg text-ionian select-all">
                    {email}
                  </a>
                </dd>
              </div>
              {digits && whatsapp && (
                <div className={channel}>
                  <dt className="text-[0.8125rem] tracking-[0.12em] text-ink-soft uppercase">{t("whatsapp")}</dt>
                  <dd>
                    <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener" className="font-display text-lg text-ionian">
                      {phone}
                    </a>
                  </dd>
                </div>
              )}
              {digits && viber && (
                <div className={channel}>
                  <dt className="text-[0.8125rem] tracking-[0.12em] text-ink-soft uppercase">{t("viber")}</dt>
                  <dd>
                    <a href={`viber://chat?number=%2B${digits}`} className="font-display text-lg text-ionian">
                      {phone}
                    </a>
                  </dd>
                </div>
              )}
              {siteConfig.social.instagram && (
                <div className={channel}>
                  <dt className="text-[0.8125rem] tracking-[0.12em] text-ink-soft uppercase">{t("instagram")}</dt>
                  <dd>
                    <a href={`https://www.instagram.com/${siteConfig.social.instagram}/`} target="_blank" rel="noopener" className="font-display text-lg text-ionian">
                      @{siteConfig.social.instagram}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </aside>
          <section className="lg:col-span-7 lg:col-start-6" aria-labelledby="form-title">
            <h2 id="form-title" className="sr-only">
              {t("formTitle")}
            </h2>
            <LeadForm
              kind="contact"
              locale={locale}
              labels={await leadFormLabels("contact")}
              privacyLabel={await privacyConsentLabel()}
              maxGuests={capacity.guests}
              contactEmail={email}
            />
          </section>
        </Container>
      </main>
    </>
  );
}
