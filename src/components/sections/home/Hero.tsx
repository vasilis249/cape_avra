import { getImageProps } from "next/image";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/Wordmark";
import { HeroVideo } from "@/components/media/HeroVideo";
import { ButtonLink } from "@/components/ui/Button";
import video from "@/generated/video.json";
import { capacity } from "@content/property";
import { isPreview, siteConfig } from "@content/site.config";
import { heroVideo } from "@content/video";

/**
 * Full-screen hero with a slow-motion background video of the shore at sunset.
 * The poster frame (art-directed: landscape / portrait) paints immediately and is
 * the LCP image; the video fades in over it once the page has loaded.
 */
export async function Hero({ locale }: { locale: "en" | "el" }) {
  const t = await getTranslations("home.hero");
  const tc = await getTranslations("cta");
  const season = siteConfig.earlyBookingSeason[locale];

  const common = { alt: heroVideo.alt[locale], sizes: "100vw", quality: 80 as const };
  const {
    props: { srcSet: landscapeSet },
  } = getImageProps({ ...common, ...video.landscape.poster, src: video.landscape.poster.src });
  const {
    props: { srcSet: portraitSet, ...img },
  } = getImageProps({ ...common, ...video.portrait.poster, src: video.portrait.poster.src });

  return (
    <section aria-labelledby="hero-title" className="relative isolate min-h-[100svh] overflow-hidden bg-night text-salt">
      {/* Layers: poster (-z-20) → video (-z-10) → gradients (-z-[5]) → copy → pause button (z-10) */}
      <div className="absolute inset-0 -z-20">
        <picture>
          <source media="(orientation: landscape)" srcSet={landscapeSet} />
          <source media="(orientation: portrait)" srcSet={portraitSet} />
          {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
          <img
            {...img}
            fetchPriority="high"
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ backgroundImage: `url(${video.portrait.poster.blurDataURL})`, backgroundSize: "cover" }}
          />
        </picture>
      </div>
      <HeroVideo
        landscape={{ mp4: video.landscape.src, webm: video.landscape.webm }}
        portrait={{ mp4: video.portrait.src, webm: video.portrait.webm }}
        labels={{ pause: t("pauseVideo"), play: t("playVideo") }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-[5]">
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-night/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-night/90 via-night/25 to-transparent lg:bg-gradient-to-tr lg:from-night/80 lg:via-night/20" />
      </div>

      {/* Copy */}
      <div className="relative mx-auto flex min-h-[100svh] max-w-site flex-col justify-between px-6 pt-[5.25rem] pb-10 sm:px-10 lg:px-12 lg:pt-36 lg:pb-16">
        <div>
          <p className="fade-up text-eyebrow font-medium uppercase text-salt/80" style={{ "--delay": "300ms" } as React.CSSProperties}>
            {t("eyebrow")}
          </p>
          <Wordmark animate className="mt-5 w-full max-w-[22rem] drop-shadow-[0_1px_18px_rgb(27_36_51/0.35)] lg:max-w-[30rem]" />
        </div>

        <div className="max-w-xl">
          <h1
            id="hero-title"
            className="font-display text-h1 italic [text-shadow:0_1px_24px_rgb(27_36_51/0.55)]"
          >
            {t("title")}
          </h1>
          <p className="mt-5 max-w-md text-lead text-salt/90 [text-shadow:0_1px_16px_rgb(27_36_51/0.5)]">
            {t("lead", { guests: capacity.guests })}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/book" variant="light">
              {isPreview ? tc("earlyBooking") : tc("checkAvailability")}
            </ButtonLink>
            <ButtonLink href={{ pathname: "/", hash: "story" }} variant="outline-light" className="max-sm:hidden">
              {tc("discoverHouse")}
            </ButtonLink>
          </div>
          {isPreview && <p className="mt-5 pr-14 text-[0.875rem] text-salt/80 sm:pr-0">{t("seasonNote", { season })}</p>}
        </div>
      </div>
    </section>
  );
}
