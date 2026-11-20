# Cape Avra: project memory

Direct-booking website for **Cape Avra**, a single seafront house on the cape of Mytikas, Preveza (GR).
Brand name is always "Cape Avra" (never "Villa Avra" / "Avra").

Also read `AGENTS.md`: this is **Next.js 16** (Proxy instead of Middleware, Cache Components,
`next/root-params`, `preload` instead of `priority` on images). Check `node_modules/next/dist/docs/`
before using an API from memory.

## Current phase

- [x] **Phase 1**: setup, brand, design system, Home page (EN/EL) ← *done, awaiting owner review*
- [ ] Phase 2: remaining pages, preview/waitlist mode (form + DB + notification), legal pages, sitemap/robots, OG images, cookie banner, Vercel preview deploy
- [ ] Phase 3: booking engine, iCal 2-way sync, emails
- [ ] Phase 4: Stripe (test mode), webhooks, refunds
- [ ] Phase 5: admin panel
- [ ] Phase 6: tests, security review, WCAG AA, Lighthouse, launch checklist

Work in phases; stop at the end of each, summarise, give run/test steps, wait for the owner's "go".
Commit after each working step. Develop on branch `claude/focused-thompson-tknjd4`.

## Stack

Next.js 16 App Router + TypeScript + Tailwind v4 · next-intl 4 (root-params based) · zod ·
sharp/opentype.js (build scripts only). Planned: Supabase (Postgres/Auth/Storage, RLS), Stripe
behind a `PaymentProvider` interface (Viva.com possible later), Resend + React Email, Vercel Cron.

## Layout

```
photos/raw/               ORIGINAL photos: never modified, never served
videos/raw/               ORIGINAL hero video (iPhone .MOV): never modified, never served
content/                  everything editable without touching components
  site.config.ts          mode (preview|live), contacts, ΑΜΑ, season … (zod-validated)
  property.ts             capacity, interior spaces (photo slots), distances
  photos.ts               photo registry: crop/rotate/focal/alt EN+EL/category
  video.ts                hero video settings: trim, speed (slow-mo), crops, alt
  reviews.ts              REAL reviews only; section hidden while empty
  messages/{en,el}.json   all UI copy
scripts/photos.ts         npm run photos → public/photos/*.jpg + src/generated/photos.json
scripts/brand.ts          npm run brand  → wordmark/monogram paths, favicon, avatars
scripts/video.ts          npm run video  → public/video/* (mp4+webm, landscape+portrait, posters) + src/generated/video.json
scripts/export-html.ts    npm run export:html → static HTML preview (see Commands)
src/app/[locale]/         pages (root layout lives here; locale is a root param)
src/i18n/                 routing (translated slugs), navigation, request config
src/proxy.ts              next-intl locale negotiation (Next 16 Proxy)
src/components/{brand,ui,media,motion,layout,sections,seo}
src/lib/                  photos, seo (hreflang/OG), structured-data, cn
```

## Conventions

- **No copy in components.** Strings → `content/messages/*.json`; facts → `content/*.ts`.
  Greek and English must be kept in sync (same keys).
- **Photos**: add to `content/photos.ts`, run `npm run photos`, reference by id via `<Photo id=… sizes=…/>`.
  Never edit files in `photos/raw`. Output is EXIF/GPS-free and content-hashed.
- **Hero video**: full-screen, one seamless loop built from several clips (`content/video.ts`
  `clips`: sunset pan with the agaves, played in reverse → blue-hour sea, HDR tone-mapped),
  joined by 2.5 s dissolves, with a final dissolve back into the opening so it never restarts
  visibly. Slow motion 0.4× (motion-interpolated to 30 fps), stabilised, muted, decorative (`aria-hidden`).
  To add a clip: copy the original into `videos/raw/`, add an entry to `clips`, run `npm run video`. The poster (art-directed
  landscape/portrait `<picture>`) paints first; `<HeroVideo>` loads the video only after `load`,
  picks landscape/portrait + MP4/WebM, skips autoplay under reduced-motion / Save-Data / 2G,
  pauses off-screen, and has a visible pause/play button (WCAG 2.2.2). Pipeline needs ffmpeg;
  the slow-motion master is cached in `.cache/video` (interpolation takes ~6 min).
- **Interior placeholders**: `property.spaces[].photo = null` → `<InteriorPlaceholder>`; set a photo id to replace.
- **Site mode**: `siteConfig.mode` (`preview` now). Env `SITE_MODE` overrides. Preview = early-booking CTAs.
- **Links**: use `Link`/`ButtonLink` from `@/i18n/navigation` with internal pathnames (`"/the-house"`),
  never hard-coded localized URLs. New pages need an entry in `src/i18n/routing.ts` `pathnames`.
- **Motion**: `.reveal` via `<Reveal>`, `.parallax` (CSS scroll-timeline), `.breeze-settle`,
  wordmark letter drift. Everything is disabled under `prefers-reduced-motion`.
  Don't fade the hero headline in: it is the LCP element.
- **Honesty rules**: no fake reviews, no "private beach" (Greek beaches are public), no pool
  (there isn't one), no ratings/prices in structured data until real.
- Secrets only in `.env.local` (git-ignored); document every variable in `.env.example`.

## Design tokens (src/app/globals.css)

salt `#f6f2ea` (bg) · sand `#ebe2d3` · limestone `#bfae93` · agave `#8ea39b` · olive `#5f6b48` ·
ionian `#1f4d55` (primary) · night `#1b2433` · dusk `#c9744e` (decorative only on light bg) · ink `#1d2220` · ink-soft `#4a524f`.
All text pairs checked ≥ 4.5:1. Type: Noto Serif Display (display, `display: optional`) + Commissioner (text),
both with Greek, self-hosted by next/font. Motif: fine-line flowering agave stalk (`<AgaveMotif>`).

## Open items from the owner (TODO(owner) in content files)

Confirm capacity 8/4/3 · driving times (estimates marked `confirmed: false`) · contact email/phone
(WhatsApp/Viber) · ΑΜΑ number · garden photos without the house · interior photos after renovation ·
whether the beach is reached via the garden gate (copy says "your own gate to the sea").
Photos are 1512px wide (chat-compressed); layouts are designed so they're never stretched beyond ~1.1×.

## Commands

```
npm run dev      # http://localhost:3000 → redirects to /en or /el
npm run build && npm start
npm run lint
npm run photos   # after editing content/photos.ts or adding raw photos
npm run brand    # regenerate logo assets
npm run video    # regenerate hero video (needs ffmpeg: libx264, libvpx-vp9, vidstab, zscale)
npm run export:html  # build + static HTML preview → preview/cape-avra-{en,el}.html
                     # (+ preview/.artifact/ for the hosted preview link, git-ignored)
```

Hosted preview (private, owner's claude.ai): https://claude.ai/artifact/RM4Wuck6XbSUQ26LCV5XNv
(append `#el` for Greek). Re-run `npm run export:html` and republish after changes.
