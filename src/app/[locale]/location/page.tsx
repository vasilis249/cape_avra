import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Photo } from "@/components/media/Photo";
import { Reveal } from "@/components/motion/Reveal";
import { BookingCta } from "@/components/sections/home/BookingCta";
import { SchematicMap } from "@/components/sections/location/SchematicMap";
import { ArrowRight } from "@/components/ui/Button";
import { Container, Eyebrow, Hairline, Section } from "@/components/ui/Layout";
import { currentLocale, pageMetadata } from "@/lib/page-meta";
import { beaches, experiences, mapsSearchUrl, tavernas } from "@content/location";
import { distances } from "@content/property";

type PlaceKey = "beach" | "prevezaTown" | "airport" | "nikopolis" | "lefkada" | "parga";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = await getTranslations({ locale, namespace: "meta.pages.location" });
  return pageMetadata({ locale, href: "/location", title: t("title"), description: t("description"), photo: "sun-on-the-water" });
}

export default async function LocationPage() {
  const locale = await currentLocale();
  const t = await getTranslations("location");
  const tp = await getTranslations("places");

  return (
    <>
      <SiteHeader variant="overlay" />
      <main id="main">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} photo="afternoon-from-terrace" focal="50% 40%" />

        {/* Map + driving times */}
        <Section labelledBy="map-title">
          <Container className="grid items-start gap-14 lg:grid-cols-12 lg:gap-10">
            <Reveal className="lg:col-span-7">
              <h2 id="map-title" className="sr-only">
                {t("map.title")}
              </h2>
              <SchematicMap />
            </Reveal>
            <Reveal className="lg:col-span-4 lg:col-start-9" delay={150}>
              <Eyebrow>{t("map.title")}</Eyebrow>
              <Hairline className="mt-5" />
              <h3 className="mt-6 text-h3 text-ionian">{t("distancesTitle")}</h3>
              <dl className="mt-6 border-t border-limestone/70">
                {distances.map((d) => (
                  <div key={d.key} className="flex items-baseline justify-between gap-6 border-b border-limestone/70 py-4">
                    <dt className="font-display text-lg">{tp(d.key as PlaceKey)}</dt>
                    <dd className="text-right text-[0.9375rem] text-ink-soft">
                      {d.minutes === null ? tp("beachValue") : tp("minutes", { count: d.minutes })}
                    </dd>
                  </div>
                ))}
              </dl>
              <a
                href={mapsSearchUrl}
                target="_blank"
                rel="noopener"
                className="mt-8 inline-flex min-h-11 items-center gap-3 text-[0.8125rem] font-medium tracking-[0.18em] text-ionian uppercase underline decoration-ionian/30 underline-offset-8 hover:decoration-ionian"
              >
                {t("map.openMaps")} <ArrowRight />
              </a>
              <p className="mt-3 text-[0.8125rem] text-ink-soft">{t("map.exactNote")}</p>
            </Reveal>
          </Container>
        </Section>

        {/* Beaches */}
        <Section labelledBy="beaches-title" className="bg-sand">
          <Container className="grid gap-14 lg:grid-cols-12 lg:gap-10">
            <Reveal className="lg:col-span-5">
              <Photo id="turquoise-shallows" fill sizes="(min-width: 1024px) 40vw, 100vw" className="aspect-[4/5]" />
            </Reveal>
            <div className="lg:col-span-6 lg:col-start-7">
              <Reveal>
                <h2 id="beaches-title" className="text-h2 text-ionian">
                  {t("beachesTitle")}
                </h2>
              </Reveal>
              <ul className="mt-10 border-t border-limestone/70">
                {beaches.map((b, i) => (
                  <li key={b} className="border-b border-limestone/70 py-6">
                    <Reveal delay={i * 80}>
                      <h3 className="font-display text-xl">{t(`beaches.${b}.title`)}</h3>
                      <p className="mt-2 max-w-prose text-ink-soft">{t(`beaches.${b}.text`)}</p>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>
          </Container>
        </Section>

        {/* Days out */}
        <Section labelledBy="days-title">
          <Container>
            <Reveal>
              <h2 id="days-title" className="text-h2 text-ionian">
                {t("experiencesTitle")}
              </h2>
            </Reveal>
            <ul className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {experiences.map((e, i) => (
                <li key={e}>
                  <Reveal delay={(i % 3) * 90}>
                    <span aria-hidden="true" className="block h-px w-10 bg-dusk" />
                    <h3 className="mt-5 font-display text-2xl">{t(`experiences.${e}.title`)}</h3>
                    <p className="mt-3 text-ink-soft">{t(`experiences.${e}.text`)}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </Container>
        </Section>

        {/* Where to eat + getting here */}
        <Section labelledBy="eat-title" className="bg-sand">
          <Container className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <h2 id="eat-title" className="text-h3 text-ionian">
                {t("tavernasTitle")}
              </h2>
              {tavernas.length === 0 ? (
                <p className="mt-5 max-w-prose text-ink-soft">{t("tavernasEmpty")}</p>
              ) : (
                <ul className="mt-6 border-t border-limestone/70">
                  {tavernas.map((tv) => (
                    <li key={tv.name} className="border-b border-limestone/70 py-4">
                      <p className="font-display text-lg">
                        {tv.mapsUrl ? (
                          <a href={tv.mapsUrl} target="_blank" rel="noopener" className="underline decoration-limestone underline-offset-4">
                            {tv.name}
                          </a>
                        ) : (
                          tv.name
                        )}
                      </p>
                      <p className="text-[0.9375rem] text-ink-soft">
                        {tv.area[locale]} · {tv.note[locale]}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Reveal>
            <Reveal delay={120}>
              <h2 className="text-h3 text-ionian">{t("gettingHereTitle")}</h2>
              <ul className="mt-5 space-y-4 text-ink-soft">
                {(["plane", "car", "local"] as const).map((k) => (
                  <li key={k} className="flex gap-3">
                    <span aria-hidden="true" className="mt-[0.8em] h-px w-3 shrink-0 bg-limestone" />
                    {t(`gettingHere.${k}`)}
                  </li>
                ))}
              </ul>
            </Reveal>
          </Container>
        </Section>

        <BookingCta locale={locale} />
      </main>
    </>
  );
}
