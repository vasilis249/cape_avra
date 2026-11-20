/**
 * Facts about the house. Copy (descriptions) lives in content/messages/*.json;
 * this file holds structured data and photo slots.
 *
 * Interior `photo: null` renders an "Interior photography coming soon"
 * placeholder. To add a real photo: register it in content/photos.ts,
 * run `npm run photos`, then set its id here. No component changes needed.
 */
import type { PhotoId } from "./photos";

export const capacity = {
  guests: 8, // TODO(owner): confirm
  bedrooms: 4, // TODO(owner): confirm
  bathrooms: 3, // TODO(owner): confirm
};

/** Interior spaces shown on Home and The House. Keys map to messages `spaces.<key>`. */
export const spaces: { key: "living" | "kitchen" | "bedrooms" | "bathrooms"; photo: PhotoId | null }[] = [
  { key: "living", photo: null },
  { key: "kitchen", photo: null },
  { key: "bedrooms", photo: null },
  { key: "bathrooms", photo: null },
];

/**
 * Approximate driving times. `confirmed: false` = estimate awaiting the owner.
 * Keys map to messages `places.<key>`.
 */
export const distances: { key: string; minutes: number | null; confirmed: boolean }[] = [
  { key: "beach", minutes: null, confirmed: false }, // shown as "below the garden"
  { key: "prevezaTown", minutes: 10, confirmed: false },
  { key: "airport", minutes: 15, confirmed: true }, // from the brief
  { key: "nikopolis", minutes: 10, confirmed: false },
  { key: "lefkada", minutes: 40, confirmed: false },
  { key: "parga", minutes: 50, confirmed: false },
];

/** Outdoor features visible in photos / confirmed by the owner. */
export const outdoorFeatures = ["garden", "pergola", "bbq", "seaView"] as const;
