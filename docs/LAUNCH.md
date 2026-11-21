# Launch checklist

Work top to bottom. Items marked **(you)** need the owner; the rest are technical steps you can hand to
whoever deploys. Setup details for each service are in [DEPLOY.md](DEPLOY.md).

## 1. Content and legal (you)

- [ ] Real prices, seasons, minimum stays and arrival days (admin → Prices & seasons, or `content/booking.ts`)
- [ ] Climate resilience fee amounts for the year, deposit %, balance timing, security deposit amount
- [ ] Cancellation tiers you are happy to honour
- [ ] Operator name, ΑΦΜ and ΑΜΑ (`content/site.config.ts` → `legal`); contact email and phone/WhatsApp
- [ ] Privacy, cookie, terms and imprint texts reviewed by a lawyer; then set `draft: false` in `content/pages/*/*.md`
- [ ] Check-in/out times, bed configuration, capacity 8 / 4 bedrooms / 3 bathrooms confirmed
- [ ] Arrival details for the pre-arrival email (`content/property.ts` → `arrivalInfo`: address, map link, notes)
- [ ] Review link for the after-stay email (Google or other), or leave empty to ask for a reply
- [ ] Driving times confirmed (`content/property.ts` → `distances`, set `confirmed: true`); favourite tavernas (`content/location.ts`)
- [ ] Interior photos after the renovation (admin → Photos); garden photos without the house if you have them
- [ ] Confirm "your own gate to the sea" is accurate (copy on The House)

## 2. Accounts and configuration

- [ ] Domain `capeavra.com` bought; Vercel **Pro** project; domain added in Vercel; `NEXT_PUBLIC_SITE_URL=https://capeavra.com`
- [ ] Supabase project in an **EU region**; migrations `0001`–`0004` run; private Storage bucket `site-media`
- [ ] Resend: domain verified (SPF, DKIM), DMARC record added; `EMAIL_FROM`, `OWNER_NOTIFICATION_EMAIL`
- [ ] Stripe account **activated** (business details, bank account for payouts, statement descriptor `CAPE AVRA`)
- [ ] Generate long random secrets (e.g. `openssl rand -base64 48`) for: `CRON_SECRET`, `ICAL_EXPORT_TOKEN`,
      `BOOKING_LINK_SECRET`, `ADMIN_SESSION_SECRET`
- [ ] Production env vars set (Vercel → Settings → Environment Variables → **Production**):
      `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`,
      `OWNER_NOTIFICATION_EMAIL`, `ICAL_EXPORT_TOKEN`, `ICAL_FEEDS`, `CRON_SECRET`, `BOOKING_LINK_SECRET`,
      `ADMIN_EMAIL`, `ADMIN_SESSION_SECRET`, `PAYMENTS_PROVIDER=stripe`, Stripe **test** keys for now
- [ ] Preview env vars: the same, with **test** Stripe keys and a separate test database if possible
- [ ] Your mailbox for `ADMIN_EMAIL` has 2-step verification on

## 3. Full rehearsal on the production URL, still in test mode

- [ ] `SITE_MODE=live` on **Preview** only; open the preview deployment
- [ ] Book with `4242 4242 4242 4242`: confirmation page, guest email (EN), owner email (EL), Stripe shows the deposit with a saved card
- [ ] Book in Greek with `4000 0025 0000 3155` (3-D Secure): approve, confirmation, Greek emails
- [ ] Declined card `4000 0000 0000 9995`: clear message, dates still held, retry works
- [ ] Guest "Manage your booking" → cancel → refund visible in Stripe and the email arrives
- [ ] Admin: sign in by email link; the bookings appear; add a note; partial refund; owner cancellation
- [ ] Admin → Αιτήματα → Κράτηση: book a request with an agreed price; the guest email arrives with the
      payment link; pay through it. Then a second one paid "by bank transfer" (record it in the booking)
- [ ] Admin → Calendar: block a week → it disappears from the public calendar and appears in the iCal export
- [ ] Airbnb/Booking.com: import our iCal link there; put our `ICAL_FEEDS` links here; block a date on Airbnb →
      after the next sync (≤ 30 min, or "Sync now") it is unavailable on our calendar, and vice versa
- [ ] Vercel → Cron Jobs: both jobs ran without errors (`/api/cron/daily`, `/api/cron/sync-calendars`)
- [ ] Stripe → Webhooks: endpoint shows successful deliveries (no 4xx/5xx)
- [ ] Balance and security deposit: make a test booking ~31 days ahead and call the daily job the next day
      (or wait); the balance is charged and the deposit authorised on arrival day in Stripe test mode
- [ ] Phones: book once on iPhone (Safari, Apple Pay test) and once on Android (Chrome, Google Pay test)

## 4. Go live

- [ ] Stripe **live** keys and a **live** webhook endpoint (its own signing secret) in **Production** env only
- [ ] Apple Pay: Stripe → Payment method domains → `capeavra.com` verified
- [ ] `SITE_MODE=live` in Production (or `mode: "live"` in `content/site.config.ts`); redeploy
- [ ] First real booking with your own card for one night, then cancel it from the admin with a full refund
- [ ] Vercel Firewall rate-limit rules (see [SECURITY.md](SECURITY.md) § residual risks)
- [ ] Vercel Web Analytics enabled (loads only after consent)
- [ ] Google Search Console: add the domain, submit `https://capeavra.com/sitemap.xml`
- [ ] Google Business Profile for the house (photos, link to the site, "Book" link)
- [ ] Update the booking links on Airbnb/Booking.com listings where allowed, Instagram bio, email signature

## 5. After launch

- [ ] Supabase backups on (Pro: point-in-time recovery); test one restore
- [ ] Weekly glance at the admin dashboard → "Needs attention" (failed balances, deposits)
- [ ] Monthly: Stripe payouts reconciled; iCal sync working (no "failed" in Sync now)
- [ ] When prices change: admin → Prices & seasons (affects new bookings only)
- [ ] Each year: climate fee amounts, seasons for the next year, legal texts still accurate

## Quality bar met in Phase 6 (for the record)

- Automated tests: pricing, availability (edge cases + 2,000 randomised stays), iCal, payments
  (simulated provider), webhooks (signature), admin tools, database store (Postgres), security invariants.
  CI runs lint, types, tests against Postgres and both builds on every push.
- Accessibility: axe (WCAG 2.0/2.1/2.2 A + AA) on every page in both languages, the booking flow and the
  admin: 0 violations; Lighthouse accessibility 100.
- Lighthouse (mobile, simulated slow 4G, local server): performance 84–90, best practices 100, SEO 100
  (production-like build). On Vercel's CDN the numbers are usually better.
- Security: see [SECURITY.md](SECURITY.md).
