import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookingWidget } from "@/components/booking/BookingWidget";
import { bookingLabels } from "@/components/booking/labels";
import { LeadForm } from "@/components/forms/LeadForm";
import { leadFormLabels } from "@/components/forms/lead-form-labels";
import { privacyConsentLabel } from "@/components/forms/PrivacyConsentLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Photo } from "@/components/media/Photo";
import { Container } from "@/components/ui/Layout";
import { currentLocale, pageMetadata } from "@/lib/page-meta";
import { capacity } from "@content/property";
import { isPreview, siteConfig } from "@content/site.config";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = await getTranslations({ locale, namespace: "meta.pages.book" });
  return pageMetadata({
    locale,
    href: "/book",
    title: t("title"),
    description: t("description", { season: siteConfig.earlyBookingSeason[locale] }),
  });
}

export default async function BookPage() {
  const locale = await currentLocale();
  const t = await getTranslations("book");
  const th = await getTranslations("home.booking");
  const season = siteConfig.earlyBookingSeason[locale];
  const steps = t.raw("steps") as string[];

  if (!isPreview) {
    return (
      <>
        <SiteHeader variant="solid" />
        <main id="main">
          <PageHeader eyebrow={season} title={t("liveTitle")} lead={t("liveLead")} />
          <Container className="pb-24 lg:pb-32">
            <BookingWidget locale={locale} labels={await bookingLabels()} />
          </Container>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader variant="solid" />
      <main id="main">
        <PageHeader eyebrow={season} title={t("title")} lead={t("lead", { season })} />
        <Container className="grid gap-14 pb-24 lg:grid-cols-12 lg:gap-10 lg:pb-32">
          <aside className="lg:col-span-4" aria-labelledby="how-title">
            <h2 id="how-title" className="text-h3 text-ionian">
              {t("howTitle")}
            </h2>
            <ol className="mt-6 space-y-5">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-4 text-ink-soft">
                  <span className="font-display text-xl leading-none text-dusk tabular-nums" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-8 flex items-center gap-3 text-[0.9375rem] text-ink">
              <span aria-hidden="true" className="h-px w-6 bg-dusk" />
              {th("direct")}
            </p>
            <Photo id="blue-hour-agaves" fill sizes="(min-width: 1024px) 30vw, 100vw" className="mt-10 hidden aspect-[4/5] lg:block" />
          </aside>
          <div className="lg:col-span-7 lg:col-start-6">
            <LeadForm
              kind="waitlist"
              locale={locale}
              labels={await leadFormLabels("waitlist")}
              privacyLabel={await privacyConsentLabel()}
              maxGuests={capacity.guests}
              contactEmail={siteConfig.contact.email}
            />
          </div>
        </Container>
      </main>
    </>
  );
}
