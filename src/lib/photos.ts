import manifest from "@/generated/photos.json";
import { photos, type PhotoEntry, type PhotoId } from "@content/photos";
import type { Locale } from "@/i18n/routing";

export type ResolvedPhoto = {
  id: PhotoId;
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
  color: string;
  alt: string;
  focal: string;
  category: PhotoEntry["category"];
};

const byId = new Map<string, PhotoEntry>(photos.map((p) => [p.id, p]));

export function getPhoto(id: PhotoId, locale: Locale): ResolvedPhoto {
  const entry = byId.get(id);
  const generated = (manifest as Record<string, Omit<ResolvedPhoto, "id" | "alt" | "focal" | "category">>)[id];
  if (!entry || !generated) {
    throw new Error(`Photo "${id}" is missing. Add it to content/photos.ts and run \`npm run photos\`.`);
  }
  return {
    id,
    ...generated,
    alt: entry.alt[locale],
    focal: entry.focal ?? "50% 50%",
    category: entry.category,
  };
}
