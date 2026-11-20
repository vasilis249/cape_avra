import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgaveMotif } from "@/components/brand/AgaveMotif";
import { PageHeader } from "@/components/layout/PageHeader";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Reveal } from "@/components/motion/Reveal";
import { BookingCta } from "@/components/sections/home/BookingCta";
import { Container, Section } from "@/components/ui/Layout";
import { currentLocale, pageMetadata } from "@/lib/page-meta";
import { JsonLd } from "@/components/seo/JsonLd";
import { capacity, houseRules, stayTimes } from "@content/property";
import { siteConfig } from "@content/site.config";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = await getTranslations({ locale, namespace: "meta.pages.faq" });
  return pageMetadata({ locale, href: "/faq", title: t("title"), description: t("description") });
}

export default async function FaqPage() {
  const locale = await currentLocale();
  const t = await getTranslations("faq");
  const tr = await getTranslations("rules");
  const vars = {
    season: siteConfig.earlyBookingSeason[locale],
    guests: capacity.guests,
    bedrooms: capacity.bedrooms,
    bathrooms: capacity.bathrooms,
    checkIn: stayTimes.checkIn ?? "—",
    checkOut: stayTimes.checkOut ?? "—",
  };
  // ICU-style {placeholders} inside an array of messages
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: keyof typeof vars) => String(vars[k] ?? `{${k}}`));
  const items = (t.raw("items") as { q: string; a: string }[]).map((i) => ({ q: fill(i.q), a: fill(i.a) }));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
        }}
      />
      <SiteHeader variant="solid" />
      <main id="main">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />

        <Section className="pt-6 sm:pt-8 lg:pt-10" labelledBy="faq-q">
          <Container className="grid gap-14 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <h2 id="faq-q" className="sr-only">
                {t("questionsTitle")}
              </h2>
              <div className="border-t border-limestone/70">
                {items.map((item, i) => (
                  <details key={i} className="group border-b border-limestone/70">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 font-display text-xl text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span
                        aria-hidden="true"
                        className="relative h-3 w-3 shrink-0 before:absolute before:top-1/2 before:left-0 before:h-px before:w-3 before:bg-ionian after:absolute after:top-0 after:left-1/2 after:h-3 after:w-px after:bg-ionian after:transition-transform group-open:after:scale-y-0"
                      />
                    </summary>
                    <p className="max-w-prose pb-7 text-ink-soft">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>

            <Reveal className="lg:col-span-4 lg:col-start-9">
              <aside aria-labelledby="rules-title" className="relative overflow-hidden bg-sand p-8 sm:p-10">
                <AgaveMotif className="absolute -right-2 -bottom-4 w-14 text-limestone/60" />
                <h2 id="rules-title" className="text-h3 text-ionian">
                  {t("rulesTitle")}
                </h2>
                <ul className="relative mt-6 space-y-4 text-[0.9375rem] text-ink-soft">
                  {houseRules.map((r) => (
                    <li key={r} className="flex gap-3">
                      <span aria-hidden="true" className="mt-[0.8em] h-px w-3 shrink-0 bg-limestone" />
                      {tr(r, { guests: capacity.guests })}
                    </li>
                  ))}
                </ul>
              </aside>
            </Reveal>
          </Container>
        </Section>
        <BookingCta locale={locale} />
      </main>
    </>
  );
}
