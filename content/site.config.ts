/**
 * Site-wide configuration. Edit values here, not in components.
 *
 * Values marked `// TODO(owner)` are placeholders waiting for real data.
 * Anything set to `null` is hidden on the site until it is filled in.
 */
import { z } from "zod";

const siteConfigSchema = z.object({
  /** `preview`: no live booking, CTAs collect early-booking requests.
   *  `live`: calendar + checkout (Phase 3–4). Override with env SITE_MODE. */
  mode: z.enum(["preview", "live"]),
  name: z.literal("Cape Avra"),
  domain: z.string(),
  /** Season shown on preview-mode CTAs, per locale. */
  earlyBookingSeason: z.object({ en: z.string(), el: z.string() }),
  contact: z.object({
    email: z.string().email(),
    /** E.164 without spaces, e.g. +306900000000. null hides phone/WhatsApp/Viber. */
    phone: z.string().nullable(),
    whatsapp: z.boolean(),
    viber: z.boolean(),
  }),
  social: z.object({
    instagram: z.string().nullable(),
  }),
  address: z.object({
    locality: z.string(),
    region: z.string(),
    postalCode: z.string(),
    country: z.literal("GR"),
  }),
  legal: z.object({
    /** Αριθμός Μητρώου Ακινήτου (short-term rental registry). Shown in the imprint. */
    ama: z.string().nullable(),
  }),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;

const raw: SiteConfig = {
  mode: "preview",
  name: "Cape Avra",
  domain: "capeavra.com",
  earlyBookingSeason: { en: "Summer 2027", el: "Καλοκαίρι 2027" },
  contact: {
    email: "hello@capeavra.com", // TODO(owner): confirm the mailbox exists
    phone: null, // TODO(owner): WhatsApp/Viber number
    whatsapp: true,
    viber: true,
  },
  social: {
    instagram: "capeavra",
  },
  address: {
    locality: "Mytikas, Preveza",
    region: "Epirus",
    postalCode: "48100",
    country: "GR",
  },
  legal: {
    ama: null, // TODO(owner): property registry number (ΑΜΑ)
  },
};

const envMode = process.env.SITE_MODE;

export const siteConfig: SiteConfig = siteConfigSchema.parse({
  ...raw,
  mode: envMode === "live" || envMode === "preview" ? envMode : raw.mode,
});

export const isPreview = siteConfig.mode === "preview";
