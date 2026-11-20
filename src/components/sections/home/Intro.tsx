import { getTranslations } from "next-intl/server";
import { AgaveMotif } from "@/components/brand/AgaveMotif";
import { Photo } from "@/components/media/Photo";
import { Reveal } from "@/components/motion/Reveal";
import { Container, Eyebrow, Hairline, Section } from "@/components/ui/Layout";

export async function Intro() {
  const t = await getTranslations("home.intro");
  return (
    <Section id="story" labelledBy="story-title">
      <Container className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:col-span-5 lg:col-start-1">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <Hairline className="mt-5" />
          <h2 id="story-title" className="mt-6 text-h2 text-ionian">
            {t("title")}
          </h2>
          <div className="mt-8 max-w-prose space-y-5 text-ink-soft">
            <p className="text-lead text-ink">{t("p1")}</p>
            <p>{t("p2")}</p>
            <p>{t("p3")}</p>
          </div>
          <AgaveMotif className="mt-10 w-8 text-limestone" />
        </Reveal>

        <Reveal className="lg:col-span-6 lg:col-start-7" delay={150}>
          <figure>
            <div className="relative aspect-square overflow-hidden lg:aspect-[4/5]">
              <div className="parallax absolute inset-0">
                <Photo
                  id="garden-to-the-sea"
                  fill
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="h-full w-full"
                  focal="50% 78%"
                />
              </div>
            </div>
            <figcaption className="mt-3 text-[0.8125rem] italic text-ink-soft">{t("caption")}</figcaption>
          </figure>
        </Reveal>
      </Container>
    </Section>
  );
}
