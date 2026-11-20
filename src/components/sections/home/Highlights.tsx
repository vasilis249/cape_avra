import { getTranslations } from "next-intl/server";
import type { PhotoId } from "@content/photos";
import { Photo } from "@/components/media/Photo";
import { Reveal } from "@/components/motion/Reveal";
import { Container, Eyebrow, Hairline, Section } from "@/components/ui/Layout";

const items: { key: "sea" | "garden" | "privacy"; photo: PhotoId }[] = [
  { key: "sea", photo: "sun-on-the-water" },
  { key: "garden", photo: "garden-sunset-lawn" },
  { key: "privacy", photo: "garden-gate-dusk" },
];

export async function Highlights() {
  const t = await getTranslations("home.highlights");
  return (
    <Section labelledBy="highlights-title" className="bg-sand">
      <Container>
        <Reveal className="max-w-2xl">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <Hairline className="mt-5" />
          <h2 id="highlights-title" className="mt-6 text-h2 text-ionian">
            {t("title")}
          </h2>
        </Reveal>
      </Container>

      {/* Phones: swipeable row. Desktop: three columns. */}
      <ul className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 [scrollbar-width:none] sm:px-8 lg:mx-auto lg:grid lg:max-w-site lg:grid-cols-3 lg:gap-8 lg:overflow-visible lg:px-12 lg:pb-0">
        {items.map((item, i) => (
          <li key={item.key} className="w-[82vw] max-w-sm shrink-0 snap-start sm:w-[60vw] lg:w-auto lg:max-w-none">
            <Reveal delay={i * 120}>
              <Photo
                id={item.photo}
                fill
                sizes="(min-width: 1024px) 30vw, 82vw"
                className="aspect-[4/5]"
              />
              <h3 className="mt-6 text-h3 text-ink">{t(`${item.key}.title`)}</h3>
              <p className="mt-3 text-ink-soft">{t(`${item.key}.text`)}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}
