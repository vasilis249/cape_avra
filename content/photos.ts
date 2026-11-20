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
};

export const photos = [
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
    id: "garden-sunset-lawn",
    file: "IMG_3119.jpeg",
    category: "garden",
    crop: { x: 0, y: 0.3, w: 0.6, h: 0.56 },
    focal: "55% 50%",
    alt: {
      en: "The lawn at sunset, with a fan palm in a stone planter and the pergola at the edge of the garden",
      el: "Το γρασίδι στο ηλιοβασίλεμα, με έναν φοίνικα σε πέτρινη ζαρντινιέρα και την πέργκολα στην άκρη του κήπου",
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
    crop: { x: 0, y: 0, w: 1, h: 0.68 },
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
    alt: {
      en: "Afternoon view from the upper floor over shade trees to the beach and the open sea",
      el: "Απογευματινή θέα από τον όροφο πάνω από τα δέντρα προς την παραλία και το ανοιχτό πέλαγος",
    },
  },
] as const satisfies readonly PhotoEntry[];

export type PhotoId = (typeof photos)[number]["id"];
