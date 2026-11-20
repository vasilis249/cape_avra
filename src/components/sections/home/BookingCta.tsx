import { getTranslations } from "next-intl/server";
import { AgaveMotif } from "@/components/brand/AgaveMotif";
import { Photo } from "@/components/media/Photo";
import { Reveal } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Layout";
import { isPreview, siteConfig } from "@content/site.config";

/**
 * Availability & price CTA. Preview mode → early-booking request; live mode → availability.
 * Editorial split (portrait photo + copy) so the portrait-only photography stays sharp.
 */
export async function BookingCta({ locale }: { locale: "en" | "el" }) {
  const t = await getTranslations("home.booking");
  const tc = await getTranslations("cta");
  const season = siteConfig.earlyBookingSeason[locale];

  return (
    <section aria-labelledby="booking-title" className="relative overflow-hidden bg-night text-salt">
      <AgaveMotif className="pointer-events-none absolute -bottom-4 right-10 hidden w-24 text-agave/20 lg:block" />
      <Container className="grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-12 lg:gap-10 lg:py-32">
        <Reveal className="lg:col-span-5">
          <div className="relative aspect-[4/5] overflow-hidden">
            <div className="parallax absolute inset-0">
              <Photo id="sunset-clouds" fill sizes="(min-width: 1024px) 40vw, 100vw" className="h-full w-full" />
            </div>
          </div>
        </Reveal>
        <Reveal className="lg:col-span-6 lg:col-start-7" delay={150}>
          <p className="text-eyebrow font-medium uppercase text-agave">{season}</p>
          <span aria-hidden="true" className="mt-5 block h-px w-12 bg-salt/40" />
          <h2 id="booking-title" className="mt-6 text-h1">
            {t("title")}
          </h2>
          <p className="mt-6 max-w-prose text-lead text-salt/85">{t("text", { season })}</p>
          <ButtonLink href="/book" variant="light" className="mt-10">
            {isPreview ? tc("earlyBooking") : tc("checkAvailability")}
          </ButtonLink>
          <p className="mt-6 flex items-center gap-3 text-[0.9375rem] text-salt/80">
            <span aria-hidden="true" className="h-px w-6 bg-dusk" />
            {t("direct")}
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
