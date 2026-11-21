import { defineRouting } from "next-intl/routing";

/**
 * Locales + translated URL slugs. To add Italian or German:
 *  1. add "it"/"de" to `locales`
 *  2. add content/messages/it.json (copy en.json and translate)
 *  3. add an `it`/`de` slug to every entry in `pathnames`
 */
export const routing = defineRouting({
  locales: ["en", "el"],
  defaultLocale: "en",
  localePrefix: "always",
  pathnames: {
    "/": "/",
    "/the-house": { en: "/the-house", el: "/to-spiti" },
    "/gallery": { en: "/gallery", el: "/fotografies" },
    "/location": { en: "/location", el: "/topothesia" },
    "/book": { en: "/book", el: "/kratisi" },
    "/book/checkout": { en: "/book/checkout", el: "/kratisi/oloklirosi" },
    "/book/confirmation": { en: "/book/confirmation", el: "/kratisi/epivevaiosi" },
    "/faq": { en: "/faq", el: "/syxnes-erotiseis" },
    "/contact": { en: "/contact", el: "/epikoinonia" },
    "/legal/privacy": { en: "/legal/privacy", el: "/nomika/aporrito" },
    "/legal/cookies": { en: "/legal/cookies", el: "/nomika/cookies" },
    "/legal/terms": { en: "/legal/terms", el: "/nomika/oroi" },
    "/legal/imprint": { en: "/legal/imprint", el: "/nomika/stoixeia" },
  },
});

export type Locale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (routing.locales as readonly string[]).includes(value);
}
