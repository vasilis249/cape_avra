import { getTranslations } from "next-intl/server";
import { Photo } from "@/components/media/Photo";
import { Reveal } from "@/components/motion/Reveal";
import { ArrowRight, ButtonLink } from "@/components/ui/Button";
import { Container, Eyebrow, Hairline, Section } from "@/components/ui/Layout";

export async function GalleryTeaser() {
  const t = await getTranslations("home.gallery");
  const tc = await getTranslations("cta");
  return (
    <Section labelledBy="gallery-title" className="bg-sand">
      <Container>
        <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <Hairline className="mt-5" />
            <h2 id="gallery-title" className="mt-6 max-w-xl text-h2 text-ionian">
              {t("title")}
            </h2>
          </div>
          <ButtonLink href="/gallery" variant="text">
            {tc("viewGallery")} <ArrowRight />
          </ButtonLink>
        </Reveal>

        {/* Tall photo left; two squares over a wide photo right. */}
        <div className="mt-12 grid gap-3 sm:gap-5 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <Photo
              id="agave-silhouettes"
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="aspect-[4/5] lg:aspect-auto lg:h-full"
            />
          </Reveal>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:col-span-7">
            <Reveal delay={100}>
              <Photo id="garden-from-above" fill sizes="(min-width: 1024px) 28vw, 50vw" className="aspect-square" focal="0% 50%" />
            </Reveal>
            <Reveal delay={180}>
              <Photo id="sunset-clouds" fill sizes="(min-width: 1024px) 28vw, 50vw" className="aspect-square" focal="50% 45%" />
            </Reveal>
            <Reveal className="col-span-2" delay={240}>
              <Photo
                id="terrace-in-the-shade"
                fill
                sizes="(min-width: 1024px) 56vw, 100vw"
                className="aspect-[16/10]"
                focal="50% 55%"
              />
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  );
}
