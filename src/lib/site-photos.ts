import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { getBookingStore, type SitePhoto } from "@/lib/booking/store";
import { getPhoto, type ResolvedPhoto } from "@/lib/photos";
import { photos, type PhotoEntry, type PhotoId } from "@content/photos";
import type { spaces } from "@content/property";

/**
 * Photos replaced or added in the admin override the build-time registry (content/photos.ts).
 * Slots: a registry photo id, or "space-<key>" for an interior space without a photo.
 */
export const SITE_PHOTOS_TAG = "site-photos";
export type SpaceKey = (typeof spaces)[number]["key"];
export type PhotoSlot = PhotoId | `space-${SpaceKey}`;

export async function loadSitePhotos(): Promise<Record<string, SitePhoto>> {
  "use cache";
  cacheTag(SITE_PHOTOS_TAG);
  cacheLife("max");
  try {
    const list = await getBookingStore().listSitePhotos();
    return Object.fromEntries(list.map((p) => [p.slot, p]));
  } catch {
    return {}; // no database at build time: the registry photos are used
  }
}

const registry = new Map<string, PhotoEntry>(photos.map((p) => [p.id, p]));
export const isPhotoSlot = (slot: string): slot is PhotoSlot =>
  registry.has(slot) || /^space-(living|kitchen|bedrooms|bathrooms)$/.test(slot);

export async function resolvePhoto(slot: PhotoSlot, locale: Locale): Promise<ResolvedPhoto> {
  const o = (await loadSitePhotos())[slot];
  const entry = registry.get(slot);
  if (o) {
    return {
      id: slot as PhotoId,
      src: `/media/${o.path}`,
      width: o.width,
      height: o.height,
      blurDataURL: o.blur,
      color: o.color,
      alt: o.alt[locale] || entry?.alt[locale] || "",
      focal: o.focal ?? entry?.focal ?? "50% 50%",
      category: entry?.category ?? "house",
    };
  }
  return getPhoto(slot as PhotoId, locale);
}

/** photo for an interior space: an uploaded one, else the registry's, else null (placeholder) */
export async function spacePhoto(key: SpaceKey, registryId: PhotoId | null): Promise<PhotoSlot | null> {
  const slot = `space-${key}` as const;
  if ((await loadSitePhotos())[slot]) return slot;
  return registryId;
}
