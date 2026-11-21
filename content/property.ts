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
 * Bedrooms and beds. Leave empty until the renovation fixes the layout;
 * the page then says the bed configuration will follow.
 * Example entry: { name: { en: "Bedroom 1", el: "Υπνοδωμάτιο 1" }, beds: { en: "Double bed", el: "Διπλό κρεβάτι" }, ensuite: true }
 */
export const bedrooms: { name: { en: string; el: string }; beds: { en: string; el: string }; ensuite?: boolean }[] = [];

/**
 * Amenities shown on The House. Only list what is certain (photos or owner).
 * Keys map to messages `amenities.<key>`. Add more after the renovation.
 */
export const amenities = ["seaView", "garden", "pergola", "outdoorDining", "bbq", "balconies", "beach"] as const;

/** Check-in / check-out times (24h). null = "to be confirmed". */
export const stayTimes = {
  checkIn: "16:00" as string | null, // TODO(owner): confirm
  checkOut: "10:00" as string | null, // TODO(owner): confirm
};

/** House rules. Keys map to messages `rules.<key>`. */
export const houseRules = ["maxGuests", "noParties", "quietHours", "noSmoking", "pets", "beach"] as const;

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

/**
 * Arrival details, sent ONLY to confirmed guests in the pre-arrival email
 * (the public site shows an approximate area). TODO(owner): fill in.
 */
export const arrivalInfo: {
  address: string | null;
  mapsUrl: string | null;
  notes: { en: string; el: string } | null;
  /** e.g. a Google review link; null = we just ask guests to reply */
  reviewUrl: string | null;
} = {
  address: null,
  mapsUrl: null,
  notes: null,
  reviewUrl: null,
};
