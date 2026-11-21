import { getTranslations } from "next-intl/server";
import { InteriorPlaceholder } from "@/components/media/InteriorPlaceholder";
import { Photo } from "@/components/media/Photo";
import { Reveal } from "@/components/motion/Reveal";
import { ArrowRight, ButtonLink } from "@/components/ui/Button";
import { Container, Eyebrow, Hairline, Section } from "@/components/ui/Layout";
import { capacity, spaces } from "@content/property";
import { spacePhoto } from "@/lib/site-photos";

export async function HouseTeaser() {
  const t = await getTranslations("home.house");
  const ts = await getTranslations("spaces");
  const tc = await getTranslations("cta");
  const facts = [
    t("facts.guests", { count: capacity.guests }),
    t("facts.bedrooms", { count: capacity.bedrooms }),
    t("facts.bathrooms", { count: capacity.bathrooms }),
  ];

  return (
    <Section labelledBy="house-title">
      <Container className="grid gap-14 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:col-span-5">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <Hairline className="mt-5" />
          <h2 id="house-title" className="mt-6 text-h2 text-ionian">
            {t("title", { guests: capacity.guests })}
          </h2>
          <p className="mt-8 max-w-prose text-ink-soft">{t("text")}</p>
          <ul className="mt-10 flex flex-wrap border-y border-limestone/60">
            {facts.map((f) => (
              <li
                key={f}
                className="flex-1 basis-1/3 border-l border-limestone/60 py-5 text-center font-display text-lg first:border-l-0"
              >
                {f}
              </li>
            ))}
          </ul>
          <ButtonLink href="/the-house" variant="text" className="mt-10">
            {tc("discoverHouse")} <ArrowRight />
          </ButtonLink>
        </Reveal>

        <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:col-span-6 lg:col-start-7">
          {(await Promise.all(spaces.map(async (s) => ({ ...s, photo: await spacePhoto(s.key, s.photo) })))).map((s, i) => (
            <li key={s.key} className={i % 2 === 1 ? "translate-y-8 sm:translate-y-12" : undefined}>
              <Reveal delay={i * 100}>
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
      </Container>
    </Section>
  );
}
