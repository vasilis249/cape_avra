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
      iCal 2-way sync, cron jobs, booking emails
- [x] **Phase 4**: payments behind `PaymentProvider` (simulated "test" + Stripe), Payment Element checkout,
      signed idempotent webhooks, saved card → automatic balance, security-deposit authorisations,
      guest cancellation with tier refunds, manage-booking page
      (verified with the simulated provider; real Stripe run: `src/lib/payments/stripe.e2e.test.ts`
      with `STRIPE_E2E=1`, still pending a working `sk_test_` key)
- [x] **Phase 5**: admin panel at `/admin` (Greek): email-link sign-in, dashboard (revenue, occupancy,
      arrivals, attention), bookings (notes, refunds, owner cancel, security deposit, resend), calendar
      (manual blocks, sync now), prices & seasons editor, leads + CSV, photo uploads per section
- [x] **Phase 6**: edge-case + randomised tests, security review & fixes (docs/SECURITY.md), CSP and
      security headers, axe WCAG AA sweep (0 violations), Lighthouse, GDPR retention job, CI,
      launch checklist (docs/LAUNCH.md)
- [x] **Owner bookings** (after Phase 6): admin "Νέα κράτηση" (from scratch or from a request), agreed price,
      dates held for the guest for days, emailed payment link (EN/EL), offline payments (transfer/cash)
      that confirm the booking ← *done, awaiting owner review*

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
docs/DEPLOY.md            Vercel / Supabase / Resend / Stripe / admin setup for the owner
docs/SECURITY.md          security review: threats, controls, residual risks
docs/LAUNCH.md            launch checklist (owner content, accounts, rehearsal, go-live)
security-headers.ts       CSP + security headers (next.config.ts); add any new third-party host here
.github/workflows/ci.yml  lint, typecheck, tests against Postgres (migrations applied), both builds
content/booking.ts        seasons, rates, min stay, arrival days, fees, taxes, deposit, cancellation (seed)
src/lib/booking/          pure logic (dates, pricing, availability, ical: shared client+server, tested)
                          + server: config loader, store (Postgres via DATABASE_URL / .data file), service,
                          actions (startBooking, confirmBooking), emails, jobs (iCal sync, daily)
src/lib/payments/         provider.ts (interface), stripe.ts, test-provider.ts, service.ts (all payment rules,
                          dependency-injected, idempotent), deps.ts (real wiring)
src/components/booking/   BookingWidget (calendar), PriceSummary, CheckoutForm (details → PaymentStep),
                          PaymentStep (Stripe Payment Element / simulated card), ManageActions, StaySummary
src/app/[locale]/book/    page (calendar), checkout, confirmation (pending/failed/conflict states), manage
src/app/api/              booking/calendar, ical/[token] (export), cron/sync-calendars, cron/daily,
                          webhooks/stripe
src/app/admin/            own root layout (no public chrome); login/ (+ verify), (panel)/ pages,
                          leads/export (CSV route)
src/lib/admin/            auth (cookie session, ADMIN_EMAIL), actions ("use server", all mutations),
                          stats (pure dashboard maths), photo-processing (sharp), months
src/components/admin/     ui / ui-client (classes, Card, Stat…), ActionForm, PricingEditor, PhotoSlot…
content/messages/admin.el.json  admin copy (Greek only: the admin is for the owner)
src/lib/site-photos.ts    admin photo overrides ("use cache" + tag) on top of the registry
src/app/media/[...path]   serves uploaded photos (Supabase Storage / .data/media)
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
  Never edit files in `photos/raw`. Output is EXIF/GPS-free and content-hashed. Optional `grade`
  (highlights roll-off, contrast, saturation, warmth) gives harsh midday phone shots a calmer, warmer
  "editorial" look in the web version only; keep it subtle. Registry order = gallery order (strongest first).
  Avoid showing the pre-renovation façade (bare concrete upper floor) or the pergola canvas from above
  (its diamond openings read as tears); frame with `focal` instead.
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
  Guest links carry a random token; only its SHA-256 is stored. Emails sent later carry a "manage" token =
  HMAC(ref, `BOOKING_LINK_SECRET`) (`canAccess` accepts either).
- **Payments**: all rules in `lib/payments/service.ts`, never in routes/components. Every entry point is
  idempotent and safe under concurrency: `syncPayment()` applies the provider's state; the store's atomic
  `transitionPayment` / `claimEmail` decide who acts (one email per event). Webhooks are the source of
  truth (raw body, signature, dedupe by event id, re-fetch the intent); the confirmation and manage pages
  also reconcile directly. A payment that succeeds after its hold expired confirms if the dates are still
  free, otherwise it is refunded in full (`dates-taken`). Refund = tier % of what was paid, newest payment
  first. Balance: off-session, idempotency key per reservation, no automatic retry after a decline (guest
  pays from the manage page). Security deposit: manual-capture authorisation from check-in to check-out +
  `securityDepositReleaseDays`, re-placed when it lapses. Stripe.js loads only on payment forms
  (`@stripe/stripe-js/pure`). Live Stripe keys are refused outside the production deployment.
- **Admin**: every page, server action and route handler calls `requireAdmin()`/`getAdmin()` itself
  (layouts are not an auth boundary). Sign-in = single-use emailed link (only its SHA-256 stored; the
  GET page only shows a button, so mail scanners can't use it) → HMAC-signed cookie (`ADMIN_SESSION_SECRET`,
  path `/admin`, httpOnly, Lax, 14 days); removing an address from `ADMIN_EMAIL` revokes it. Session
  reads sit behind `<Suspense>` and call `connection()`. Forms use `ActionForm` (dispatches by hand, so
  fields survive an error). Money rules stay in `lib/payments/service.ts`. Pricing saves the whole
  config (validated by the same zod schema) and `updateTag("booking-config")` (terms page); photo
  uploads are resized in the browser (≤2400px, 4 MB server limit), re-encoded by sharp (metadata/GPS
  stripped), content-hashed, and `updateTag("site-photos")`. Interior spaces use slot `space-<key>`.
- **Owner bookings**: `createOwnerBooking()` (booking/service.ts) holds the dates for `holdHours` with the
  guest filled in; booking rules (min nights, arrival day, advance window, max nights) are overridable,
  availability and closed dates are not. An agreed price = `withCustomTotal()` (keeps the breakdown,
  `quote.adjustmentCents` shows as a line). The guest's link is the checkout page with the HMAC manage
  token (`paymentUrl()`); checkout/confirmation accept it (`canAccess`). Offline payments are payments with
  `provider: "manual"` (`recordManualPayment()`): the first confirms the hold (if the dates are still free),
  later ones count as balance; refunds of manual payments are only recorded (`refundVia`). Bookings paid
  offline have no saved card, so at the balance date the guest gets a reminder (`no_saved_card`), not a
  failed-charge email. Admin tools that must work without Stripe use `ownerDeps()`.
- **Security headers**: a new external script/frame/API host must be added to `security-headers.ts`
  (CSP) or it is blocked. Private pages (guest booking pages, admin, API) get `noindex` + same-origin referrer.
- **Retention**: the daily job deletes leads after 24 months and never-paid checkouts after 90 days
  (privacy policy says so; keep them in sync).
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
cancellation tiers · deposit % · security deposit amount (€500 example) · Stripe account (test key, then live) · `ADMIN_EMAIL` · arrival details for the pre-arrival email (`property.arrivalInfo`) ·
Operator name / ΑΦΜ for privacy & imprint (`siteConfig.legal`) · legal texts reviewed by a lawyer ·
bed configuration (`property.bedrooms`) · check-in/out times · favourite tavernas (`content/location.ts`) ·
Confirm capacity 8/4/3 · driving times (estimates marked `confirmed: false`) · contact email/phone
(WhatsApp/Viber) · ΑΜΑ number · interior photos after renovation.
Confirmed by the owner: the garden gate in the sea-side wall leads down to the beach (Nov 2026).
Photos: the first set is 1512px wide, the Nov 2026 set 2016px (chat-compressed); layouts are designed so
they're never stretched beyond ~1.1×. Interior photos still to come after the renovation.

## Commands

```
npm run dev      # http://localhost:3000 → redirects to /en or /el
npm run build && npm start
npm run lint
npm run typecheck  # route types + tsc
npm test         # booking + payment logic (+ DB integration tests with TEST_DATABASE_URL)
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
