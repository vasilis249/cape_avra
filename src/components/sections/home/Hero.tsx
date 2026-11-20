import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/Wordmark";
import { Photo } from "@/components/media/Photo";
import { ButtonLink } from "@/components/ui/Button";
import { capacity } from "@content/property";
import { isPreview, siteConfig } from "@content/site.config";

/**
 * Phones: full-screen portrait photo with the wordmark in the empty blue-hour sky.
 * Desktop: editorial split. The night-blue panel continues the photo's sky,
 * so the 1512px-wide original is never stretched beyond what it can hold.
 */
export async function Hero({ locale }: { locale: "en" | "el" }) {
  const t = await getTranslations("home.hero");
  const tc = await getTranslations("cta");
  const season = siteConfig.earlyBookingSeason[locale];

  return (
    <section aria-labelledby="hero-title" className="relative bg-night text-salt lg:grid lg:min-h-[100svh] lg:grid-cols-12">
      {/* Photo */}
      <div className="absolute inset-0 overflow-hidden lg:relative lg:order-2 lg:col-span-7">
        <div className="breeze-settle absolute inset-0">
          <Photo
            id="blue-hour-agaves"
            fill
            preload
            quality={80}
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="h-full w-full"
          />
        </div>
        {/* legibility: soft night gradient at the bottom (mobile) / left edge (desktop) */}
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/30 to-night/10 lg:bg-gradient-to-r lg:from-night lg:via-night/0 lg:to-transparent" />
      </div>

      {/* Copy */}
      <div className="relative flex min-h-[100svh] flex-col justify-between px-6 pt-[5.25rem] pb-10 sm:px-10 lg:order-1 lg:col-span-5 lg:justify-center lg:gap-14 lg:px-12 lg:pt-32 lg:pb-20 xl:px-20">
        <div>
          <p className="fade-up text-eyebrow font-medium uppercase text-agave" style={{ "--delay": "300ms" } as React.CSSProperties}>
            {t("eyebrow")}
          </p>
          <Wordmark animate className="mt-5 w-full max-w-[22rem] lg:max-w-[26rem]" />
        </div>

        <div className="max-w-md">
          <h1
            id="hero-title"
            className="font-display text-h1 italic [text-shadow:0_1px_24px_rgb(27_36_51/0.55)]"
          >
            {t("title")}
          </h1>
          <p
            className="mt-5 text-lead text-salt/85"
          >
            {t("lead", { guests: capacity.guests })}
          </p>
          <div
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <ButtonLink href="/book" variant="light">
              {isPreview ? tc("earlyBooking") : tc("checkAvailability")}
            </ButtonLink>
            <ButtonLink href={{ pathname: "/", hash: "story" }} variant="outline-light" className="max-sm:hidden">
              {tc("discoverHouse")}
            </ButtonLink>
          </div>
          {isPreview && (
            <p
              className="mt-5 text-[0.875rem] text-salt/75"
            >
              {t("seasonNote", { season })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
