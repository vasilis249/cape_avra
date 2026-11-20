/**
 * Location page data. Text lives in content/messages/*.json under `location.*`.
 *
 * `bearing` = compass direction from the house in degrees (0 = north, 90 = east),
 * used to place points on the schematic map. `minutes` = approximate drive.
 * `confirmed: false` marks estimates the owner should check.
 */
export type MapPlace = { key: string; bearing: number; minutes: number; confirmed: boolean };

export const mapPlaces: MapPlace[] = [
  { key: "monolithi", bearing: 345, minutes: 5, confirmed: false },
  { key: "nikopolis", bearing: 35, minutes: 10, confirmed: false },
  { key: "prevezaTown", bearing: 140, minutes: 10, confirmed: false },
  { key: "airport", bearing: 155, minutes: 15, confirmed: true },
  { key: "lefkada", bearing: 182, minutes: 40, confirmed: false },
  { key: "parga", bearing: 318, minutes: 50, confirmed: false },
];

/** Experiences / day trips. Keys map to messages `location.experiences.<key>`. */
export const experiences = ["preveza", "nikopolis", "lefkada", "parga", "gulf", "acheron"] as const;

/** Beaches. Keys map to messages `location.beaches.<key>`. */
export const beaches = ["below", "monolithi", "lefkadaWest", "parga"] as const;

/**
 * Local tavernas the owner recommends. Empty = a friendly "coming soon" note.
 * Example: { name: "…", area: { en: "Preveza waterfront", el: "Παραλία Πρέβεζας" }, note: { en: "Grilled fish", el: "Ψάρι στα κάρβουνα" }, mapsUrl: "https://maps.google.com/?q=…" }
 */
export const tavernas: { name: string; area: { en: string; el: string }; note: { en: string; el: string }; mapsUrl?: string }[] = [];

/** Approximate area link (no exact pin until a booking is confirmed). */
export const mapsSearchUrl = "https://www.google.com/maps/search/?api=1&query=Mytikas%2C+Preveza%2C+Greece";
