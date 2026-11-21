# Cape Avra: project memory

Direct-booking website for **Cape Avra**, a single seafront house on the cape of Mytikas, Preveza (GR).
Brand name is always "Cape Avra" (never "Villa Avra" / "Avra").

Also read `AGENTS.md`: this is **Next.js 16** (Proxy instead of Middleware, Cache Components,
`next/root-params`, `preload` instead of `priority` on images). Check `node_modules/next/dist/docs/`
before using an API from memory.

## Current phase

- [x] **Phase 1**: setup, brand, design system, Home page (EN/EL), hero video
- [x] **Phase 2**: all pages, early-booking + contact forms (Supabase + Resend, local fallbacks), legal drafts,
      cookie banner + consent-gated analytics, sitemap/robots, OG images, GitHub Pages static preview
      (Vercel deploy needs the owner's account: see docs/DEPLOY.md)
- [x] **Phase 3**: booking engine (rules, pricing, holds, calendar, checkout with test payments),
      iCal 2-way sync, cron jobs, booking emails ← *done, awaiting owner review*
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
content/pages/<locale>/*.md  legal pages (Markdown + front matter, {{placeholders}} from config)
content/location.ts       map bearings, beaches, days out, tavernas (empty = "coming soon")
src/app/[locale]/         pages (root layout lives here; locale is a root param)
src/lib/leads/            form schemas (zod), server actions, storage (Supabase REST / .data fallback)
supabase/migrations/      SQL for the database (leads table, RLS on, no public policies)
docs/DEPLOY.md            Vercel / Supabase / Resend setup for the owner
content/booking.ts        seasons, rates, min stay, arrival days, fees, taxes, deposit, cancellation (seed)
src/lib/booking/          pure logic (dates, pricing, availability, ical: shared client+server, tested)
                          + server: config loader, store (Postgres via DATABASE_URL / .data file), service,
                          actions (startBooking, confirmBooking), emails, jobs (iCal sync, daily)
src/lib/payments/         PaymentProvider interface ("test" now, Stripe in Phase 4)
src/components/booking/   BookingWidget (calendar), PriceSummary, CheckoutForm, StaySummary
src/app/api/              booking/calendar, ical/[token] (export), cron/sync-calendars, cron/daily
vercel.json               cron schedules
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
- **Forms**: server actions in `src/lib/leads/actions.ts`. Anti-spam = honeypot `website`, time since page
  load (attached at submit, never reset on re-render), per-IP rate limit. Values return on error (React
  resets forms after actions). Emails go out in `after()`. Never drop a real submission silently.
- **Legal/long text**: Markdown in `content/pages`; `draft: true` shows a "draft" note. Loader is `"use cache"`.
- **Static export** (`scripts/export-html.ts`): any new interactive client component needs a vanilla
  equivalent in the export runtime script (see gallery), or it is inert on GitHub Pages.
- **OG images**: `app/[locale]/opengraph-image.tsx`; pages link it explicitly via `openGraphFor()`
  (a child `openGraph` would otherwise drop the inherited image).
- **Booking**: money in integer cents; dates are ISO strings computed in UTC (`lib/booking/dates.ts`),
  "today" is the property's time zone. The client prices instantly with the same pure functions, but
  the server re-validates and re-prices before holding. Double bookings are impossible at the DB level
  (exclusion constraint on active reservations; check-out day is free). Holds expire after
  `holdMinutes`; `create_hold()` expires stale holds first. iCal: imports never wipe a source on a failed
  fetch; the export contains direct bookings + manual blocks only (never re-exports imports).
  Guest links carry a random token; only its SHA-256 is stored.
- **Tests**: `npm test` (pure logic). Store integration tests run with `TEST_DATABASE_URL` pointing at a
  disposable Postgres with the migrations applied.
- Secrets only in `.env.local` (git-ignored); document every variable in `.env.example`.

## Design tokens (src/app/globals.css)

salt `#f6f2ea` (bg) · sand `#ebe2d3` · limestone `#bfae93` · agave `#8ea39b` · olive `#5f6b48` ·
ionian `#1f4d55` (primary) · night `#1b2433` · dusk `#c9744e` (decorative only on light bg) · ink `#1d2220` · ink-soft `#4a524f`.
All text pairs checked ≥ 4.5:1. Type: Noto Serif Display (display, `display: optional`) + Commissioner (text),
both with Greek, self-hosted by next/font. Motif: fine-line flowering agave stalk (`<AgaveMotif>`).

## Open items from the owner (TODO(owner) in content files)

Real prices & seasons (`content/booking.ts`, all example values) · climate-fee amounts ·
cancellation tiers · deposit % · arrival details for the pre-arrival email (`property.arrivalInfo`) ·
Operator name / ΑΦΜ for privacy & imprint (`siteConfig.legal`) · legal texts reviewed by a lawyer ·
bed configuration (`property.bedrooms`) · check-in/out times · favourite tavernas (`content/location.ts`) ·
Confirm capacity 8/4/3 · driving times (estimates marked `confirmed: false`) · contact email/phone
(WhatsApp/Viber) · ΑΜΑ number · garden photos without the house · interior photos after renovation ·
whether the beach is reached via the garden gate (copy says "your own gate to the sea").
Photos are 1512px wide (chat-compressed); layouts are designed so they're never stretched beyond ~1.1×.

## Commands

```
npm run dev      # http://localhost:3000 → redirects to /en or /el
npm run build && npm start
npm run lint
npm test         # booking logic (+ DB integration tests with TEST_DATABASE_URL)
SITE_MODE=live npm run build   # build with the booking calendar instead of the early-booking form
npm run photos   # after editing content/photos.ts or adding raw photos
npm run brand    # regenerate logo assets
npm run video    # regenerate hero video (needs ffmpeg: libx264, libvpx-vp9, vidstab, zscale)
npm run export:html  # build + static HTML preview → preview/cape-avra-{en,el}.html,
                     # dist/pages/ (GitHub Pages) and preview/.artifact/ (both git-ignored)
npm run deploy:pages # export:html + push dist/pages to the gh-pages branch (GitHub Pages)
```

Public static preview (GitHub Pages, `noindex`): https://vasilis249.github.io/cape_avra/ (Greek: `/el/`).
It is a static export of the Home page only; the real site (booking, payments, admin) needs a
server and is deployed to Vercel from Phase 2. Run `npm run deploy:pages` after changes.

Private preview (owner's claude.ai): https://claude.ai/artifact/RM4Wuck6XbSUQ26LCV5XNv
(append `#el` for Greek). Re-run `npm run export:html` and republish after changes.
