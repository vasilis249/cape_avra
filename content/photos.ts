/**
 * Photo registry: the single source of truth for every photo on the site.
 *
 * - `file` points at an original in /photos/raw (never modified).
 * - `crop` (fractions of the oriented image) and `rotate` (degrees, clockwise)
 *   are applied only to the generated web version.
 * - `focal` is a CSS object-position used when a layout crops further.
 *
 * After editing this file run `npm run photos` to regenerate
 * public/photos/* and src/generated/photos.json.
 */

export type PhotoCategory = "sea" | "garden" | "house" | "surroundings";

export type PhotoEntry = {
  id: string;
  file: string;
  category: PhotoCategory;
  alt: { en: string; el: string };
  crop?: { x: number; y: number; w: number; h: number };
  rotate?: number;
  focal?: string;
  /** Hidden from the public gallery (still usable in sections). */
  galleryHidden?: boolean;
  /**
   * Gentle tonal grade for the web version only (the original is never touched).
   * brightness/saturation/contrast: 1 = unchanged · warmth: -0.1 … 0.1 (cooler … warmer) ·
   * highlights: 0 … 0.3 pulls down harsh midday highlights (sky, white walls).
   */
  grade?: { brightness?: number; saturation?: number; contrast?: number; warmth?: number; highlights?: number };
};

export const photos = [
  // ---- November 2026 set: garden, terrace, pergola, gate, beach (2016 px, graded); first in the gallery ----
  {
    id: "garden-from-above",
    file: "IMG_8962.jpeg",
    category: "garden",
    // the balcony railing on the right is cropped out
    crop: { x: 0, y: 0.04, w: 0.82, h: 0.86 },
    focal: "55% 55%",
    grade: { highlights: 0.1, contrast: 1.04, saturation: 0.95, warmth: 0.03 },
    alt: {
      en: "The garden seen from the upper balcony: lawn, palms and the pergola, with the beach and the Ionian Sea below and Lefkada on the horizon",
      el: "Ο κήπος από το πάνω μπαλκόνι: γκαζόν, φοίνικες και η πέργκολα, με την παραλία και το Ιόνιο από κάτω και τη Λευκάδα στον ορίζοντα",
    },
  },
  {
    id: "gate-to-the-sea",
    file: "IMG_8973.jpeg",
    category: "garden",
    // centred on the gate, so the composition stays symmetrical in every crop
    crop: { x: 0.095, y: 0.1, w: 0.88, h: 0.82 },
    focal: "50% 50%",
    grade: { highlights: 0.15, contrast: 1.05, saturation: 0.92, warmth: 0.03 },
    alt: {
      en: "The garden gate in the wall, with the sea and a flowering agave beyond",
      el: "Η πόρτα του κήπου στον τοίχο, με τη θάλασσα και μια ανθισμένη αγαύη από πίσω",
    },
  },
  {
    id: "house-from-the-beach",
    file: "IMG_2013.jpeg",
    category: "house",
    crop: { x: 0, y: 0.22, w: 1, h: 0.68 },
    focal: "45% 40%",
    grade: { highlights: 0.05, contrast: 1.04, saturation: 0.9, warmth: 0.04 },
    alt: {
      en: "Cape Avra seen from the water: the house above the low cliff, with the beach below and an umbrella pine",
      el: "Το Cape Avra από τη θάλασσα: το σπίτι πάνω από τη χαμηλή πλαγιά, με την παραλία από κάτω και ένα κουκουνάρι",
    },
  },
  {
    id: "terrace-in-the-shade",
    file: "IMG_8922.jpeg",
    category: "house",
    // trims the roof edge in the top-left corner
    crop: { x: 0.06, y: 0.06, w: 0.94, h: 0.94 },
    focal: "50% 55%",
    grade: { highlights: 0.15, contrast: 1.04, saturation: 0.92, warmth: 0.03 },
    alt: {
      en: "The paved terrace in the shade of the magnolia, with a lounger, wooden chairs and the sea beyond the garden wall",
      el: "Η βεράντα στη σκιά της μανόλιας, με ξαπλώστρα, ξύλινες καρέκλες και τη θάλασσα πέρα από τον τοίχο του κήπου",
    },
  },
  {
    id: "pergola-dining",
    file: "IMG_8926.jpeg",
    category: "garden",
    crop: { x: 0.03, y: 0.06, w: 0.94, h: 0.86 },
    focal: "50% 60%",
    grade: { highlights: 0.12, contrast: 1.05, saturation: 0.93, warmth: 0.03 },
    alt: {
      en: "The dining table under the pergola, beneath a tall umbrella pine",
      el: "Το τραπέζι κάτω από την πέργκολα, κάτω από ένα ψηλό κουκουνάρι",
    },
  },
  {
    id: "chairs-facing-the-sea",
    file: "IMG_8920.jpeg",
    category: "house",
    // crops out the sun flare and the garden hose
    crop: { x: 0.3, y: 0.33, w: 0.7, h: 0.6 },
    focal: "45% 55%",
    grade: { highlights: 0.15, contrast: 1.05, saturation: 0.92, warmth: 0.04 },
    alt: {
      en: "Two director's chairs and a small table on the terrace, facing the sea under the magnolia",
      el: "Δύο καρέκλες σκηνοθέτη και ένα τραπεζάκι στη βεράντα, με θέα τη θάλασσα κάτω από τη μανόλια",
    },
  },
  {
    id: "blue-hour-agaves",
    file: "IMG_7209.jpeg",
    category: "sea",
    focal: "50% 45%",
    alt: {
      en: "Two flowering agave stalks silhouetted against the blue-hour sky over the Ionian Sea, with a crescent moon",
      el: "Δύο ανθισμένες αγαύες σε σιλουέτα στον ουρανό του σούρουπου πάνω από το Ιόνιο, με το μισοφέγγαρο",
    },
  },
  {
    id: "garden-to-the-sea",
    file: "IMG_7193.jpeg",
    category: "sea",
    focal: "50% 60%",
    alt: {
      en: "View from the house over the garden and the beach to the turquoise sea, with the mountains of Lefkada on the horizon",
      el: "Θέα από το σπίτι πάνω από τον κήπο και την παραλία προς τα τιρκουάζ νερά, με τα βουνά της Λευκάδας στον ορίζοντα",
    },
  },
  {
    id: "sunset-clouds",
    file: "IMG_3120.jpeg",
    category: "sea",
    crop: { x: 0, y: 0, w: 0.88, h: 1 },
    focal: "40% 60%",
    alt: {
      en: "The sun setting into the Ionian under pink and violet clouds, seen from the edge of the garden",
      el: "Ο ήλιος δύει στο Ιόνιο κάτω από ροζ και μωβ σύννεφα, όπως φαίνεται από την άκρη του κήπου",
    },
  },
  {
    id: "garden-gate-dusk",
    file: "IMG_7616.jpeg",
    category: "garden",
    focal: "40% 60%",
    alt: {
      en: "The garden gate at dusk, with an agave stalk and the calm sea beyond",
      el: "Η πόρτα του κήπου το σούρουπο, με μια αγαύη και την ήρεμη θάλασσα πίσω της",
    },
  },

  {
    id: "agave-silhouettes",
    file: "IMG_7212.jpeg",
    category: "sea",
    rotate: 3.4,
    crop: { x: 0.07, y: 0.07, w: 0.86, h: 0.86 },
    alt: {
      en: "Agave flower stalks against an orange horizon after sunset",
      el: "Ανθοί αγαύης απέναντι σε πορτοκαλί ορίζοντα μετά τη δύση",
    },
  },
  {
    id: "sun-on-the-water",
    file: "IMG_7196.jpeg",
    category: "sea",
    crop: { x: 0, y: 0.27, w: 1, h: 0.41 },
    focal: "62% 50%",
    alt: {
      en: "Afternoon sun glittering on the sea below the garden, with swimmers off the beach",
      el: "Ο απογευματινός ήλιος λαμπυρίζει στη θάλασσα κάτω από τον κήπο, με λουόμενους στην παραλία",
    },
  },
  {
    id: "turquoise-shallows",
    file: "IMG_7224.jpeg",
    category: "sea",
    crop: { x: 0.53, y: 0.47, w: 0.47, h: 0.31 },
    alt: {
      en: "Clear turquoise shallows and agave leaves at the edge of the garden",
      el: "Καθαρά τιρκουάζ νερά και φύλλα αγαύης στην άκρη του κήπου",
    },
  },
  {
    id: "afternoon-from-terrace",
    file: "IMG_7191.jpeg",
    category: "sea",
    crop: { x: 0, y: 0.22, w: 1, h: 0.6 },
    // softens the glare of the low sun on the water
    grade: { highlights: 0.15, contrast: 1.03, warmth: 0.02 },
    alt: {
      en: "Afternoon view from the upper floor over shade trees to the beach and the open sea",
      el: "Απογευματινή θέα από τον όροφο πάνω από τα δέντρα προς την παραλία και το ανοιχτό πέλαγος",
    },
  },
] as const satisfies readonly PhotoEntry[];

export type PhotoId = (typeof photos)[number]["id"];
