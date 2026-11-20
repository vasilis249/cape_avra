import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing, type AppPathname } from "@/i18n/routing";
import { siteUrl } from "@/lib/seo";

const priority: Partial<Record<AppPathname, number>> = { "/": 1, "/book": 0.9, "/the-house": 0.8, "/location": 0.8, "/gallery": 0.7 };

/** Every page in every locale, each listing its translations (hreflang). */
export default function sitemap(): MetadataRoute.Sitemap {
  const hrefs = Object.keys(routing.pathnames) as AppPathname[];
  return hrefs.flatMap((href) =>
    routing.locales.map((locale) => ({
      url: siteUrl + getPathname({ href, locale }),
      changeFrequency: href.startsWith("/legal") ? ("yearly" as const) : ("monthly" as const),
      priority: priority[href] ?? 0.4,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, siteUrl + getPathname({ href, locale: l })])),
      },
    })),
  );
}
