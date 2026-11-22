import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { PageHeader } from "@/components/layout/PageHeader";
import { InteriorPlaceholder } from "@/components/media/InteriorPlaceholder";
import { Photo } from "@/components/media/Photo";
import { Reveal } from "@/components/motion/Reveal";
import { BookingCta } from "@/components/sections/home/BookingCta";
import { Container, Eyebrow, Hairline, Section } from "@/components/ui/Layout";
import { currentLocale, pageMetadata } from "@/lib/page-meta";
import { spacePhoto } from "@/lib/site-photos";
import { amenities, bedrooms, capacity, spaces } from "@content/property";
import { siteConfig } from "@content/site.config";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = await getTranslations({ locale, namespace: "meta.pages.house" });
  return pageMetadata({
    locale,
    href: "/the-house",
    title: t("title"),
    description: t("description", { guests: capacity.guests, bedrooms: capacity.bedrooms }),
  });
}

export default async function HousePage() {
  const locale = await currentLocale();
  const t = await getTranslations("house");
  const th = await getTranslations("home.house");
  const ts = await getTranslations("spaces");
  const ta = await getTranslations("amenities");
  const season = siteConfig.earlyBookingSeason[locale];
  const facts = [
    th("facts.guests", { count: capacity.guests }),
    th("facts.bedrooms", { count: capacity.bedrooms }),
    th("facts.bathrooms", { count: capacity.bathrooms }),
  ];

  return (
    <>
      <SiteHeader variant="overlay" />
      <main id="main">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} lead={t("lead", { season })} photo="garden-from-above" focal="50% 0%">
          <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-[0.9375rem] text-salt/85">
            {facts.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <span aria-hidden="true" className="h-px w-4 bg-salt/50" />
                {f}
              </li>
            ))}
          </ul>
        </PageHeader>

        {/* Outdoors: what is already certain */}
        <Section labelledBy="outdoors-title">
          <Container className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
            <Reveal className="lg:col-span-5">
              <Eyebrow>{t("eyebrow")}</Eyebrow>
              <Hairline className="mt-5" />
              <h2 id="outdoors-title" className="mt-6 text-h2 text-ionian">
                {t("outdoorsTitle")}
              </h2>
              <ul className="mt-8 border-t border-limestone/70">
                {amenities.map((a) => (
                  <li key={a} className="border-b border-limestone/70 py-4 font-display text-lg">
                    {ta(a)}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[0.9375rem] text-ink-soft">{t("outdoorsNote")}</p>
            </Reveal>
            <Reveal className="grid grid-cols-2 gap-3 sm:gap-5 lg:col-span-6 lg:col-start-7" delay={150}>
              <Photo id="terrace-in-the-shade" fill sizes="(min-width: 1024px) 24vw, 50vw" className="aspect-[4/5]" focal="30% 55%" />
              <Photo id="pergola-dining" fill sizes="(min-width: 1024px) 24vw, 50vw" className="mt-12 aspect-[4/5]" focal="45% 60%" />
            </Reveal>
          </Container>
        </Section>

        {/* Inside: config-driven placeholders */}
        <Section labelledBy="inside-title" className="bg-sand">
          <Container>
            <Reveal className="max-w-2xl">
              <h2 id="inside-title" className="text-h2 text-ionian">
                {t("insideTitle")}
              </h2>
              <p className="mt-6 text-ink-soft">{t("insideText")}</p>
            </Reveal>
            <ul className="mt-12 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {(await Promise.all(spaces.map(async (s) => ({ ...s, photo: await spacePhoto(s.key, s.photo) })))).map((s, i) => (
                <li key={s.key}>
                  <Reveal delay={i * 90}>
                    {s.photo ? (
                      <figure>
                        <Photo id={s.photo} fill sizes="(min-width: 1024px) 22vw, 45vw" className="aspect-[4/5]" />
                        <figcaption className="mt-3 font-display text-lg">{ts(s.key)}</figcaption>
                      </figure>
                    ) : (
                      <InteriorPlaceholder label={ts(s.key)} className="aspect-[4/5]" />
                    )}
                  </Reveal>
                </li>
              ))}
            </ul>

            <Reveal className="mt-20 grid gap-8 border-t border-limestone/70 pt-10 lg:grid-cols-12">
              <h2 className="text-h3 text-ionian lg:col-span-4">{t("sleepingTitle")}</h2>
              <div className="lg:col-span-8">
                {bedrooms.length === 0 ? (
                  <p className="max-w-prose text-ink-soft">{t("sleepingPending", { bedrooms: capacity.bedrooms })}</p>
                ) : (
                  <ul className="grid gap-6 sm:grid-cols-2">
                    {bedrooms.map((b) => (
                      <li key={b.name.en} className="border-l border-limestone pl-5">
                        <p className="font-display text-lg">{b.name[locale]}</p>
                        <p className="text-[0.9375rem] text-ink-soft">{b.beds[locale]}</p>
                        {b.ensuite && <p className="text-[0.8125rem] text-ink-soft">{t("ensuite")}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Reveal>
          </Container>
        </Section>

        <BookingCta locale={locale} />
      </main>
    </>
  );
}
