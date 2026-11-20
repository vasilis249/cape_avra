import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/motion/Reveal";
import { ArrowRight, ButtonLink } from "@/components/ui/Button";
import { Container, Eyebrow, Hairline, Section } from "@/components/ui/Layout";
import { distances } from "@content/property";

type PlaceKey = "beach" | "prevezaTown" | "airport" | "nikopolis" | "lefkada" | "parga";

export async function LocationTeaser() {
  const t = await getTranslations("home.location");
  const tp = await getTranslations("places");
  const tc = await getTranslations("cta");

  return (
    <Section labelledBy="location-title">
      <Container className="grid gap-14 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:col-span-5">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <Hairline className="mt-5" />
          <h2 id="location-title" className="mt-6 text-h2 text-ionian">
            {t("title")}
          </h2>
          <p className="mt-8 max-w-prose text-ink-soft">{t("text")}</p>
          <ButtonLink href="/location" variant="text" className="mt-10">
            {tc("exploreLocation")} <ArrowRight />
          </ButtonLink>
        </Reveal>

        <Reveal className="lg:col-span-6 lg:col-start-7" delay={150}>
          <dl className="border-t border-limestone/70">
            {distances.map((d) => (
              <div
                key={d.key}
                className="flex items-baseline justify-between gap-6 border-b border-limestone/70 py-5"
              >
                <dt className="font-display text-xl">{tp(d.key as PlaceKey)}</dt>
                <dd className="text-right text-[0.9375rem] text-ink-soft">
                  {d.minutes === null ? tp("beachValue") : tp("minutes", { count: d.minutes })}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>
    </Section>
  );
}
