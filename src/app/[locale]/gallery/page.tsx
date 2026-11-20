import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { GalleryGrid, type GalleryPhoto } from "@/components/media/GalleryGrid";
import { Container } from "@/components/ui/Layout";
import { getPhoto } from "@/lib/photos";
import { currentLocale, pageMetadata } from "@/lib/page-meta";
import { photos } from "@content/photos";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = await getTranslations({ locale, namespace: "meta.pages.gallery" });
  return pageMetadata({ locale, href: "/gallery", title: t("title"), description: t("description"), photo: "sunset-clouds" });
}

export default async function GalleryPage() {
  const locale = await currentLocale();
  const t = await getTranslations("gallery");
  const list: GalleryPhoto[] = photos
    .filter((p) => !("galleryHidden" in p && p.galleryHidden))
    .map((p) => {
      const r = getPhoto(p.id, locale);
      return { id: r.id, src: r.src, width: r.width, height: r.height, blurDataURL: r.blurDataURL, color: r.color, alt: r.alt, category: r.category };
    });

  return (
    <>
      <SiteHeader variant="solid" />
      <main id="main">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
        <Container className="pb-24 lg:pb-32">
          <GalleryGrid
            photos={list}
            labels={{
              filterLabel: t("filterLabel"),
              filters: {
                all: t("filters.all"),
                sea: t("filters.sea"),
                garden: t("filters.garden"),
                house: t("filters.house"),
                surroundings: t("filters.surroundings"),
              },
              empty: { house: t("empty.house"), surroundings: t("empty.surroundings") },
              lightbox: {
                label: t("lightbox.label"),
                close: t("lightbox.close"),
                prev: t("lightbox.prev"),
                next: t("lightbox.next"),
                counter: t.raw("lightbox.counter") as string,
                open: t.raw("lightbox.open") as string,
              },
            }}
          />
        </Container>
      </main>
    </>
  );
}
