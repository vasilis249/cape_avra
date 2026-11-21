# Deploying Cape Avra

Two deployments exist:

| | What | Where | How |
| --- | --- | --- | --- |
| **Real site** | Next.js app: all pages, working forms, later booking/payments/admin | Vercel | push to GitHub (automatic) |
| **Static preview** | Copy of every page, forms switched off, `noindex` | GitHub Pages: https://vasilis249.github.io/cape_avra/ | `npm run deploy:pages` |

## 1. Vercel (real site), one-time setup, about 10 minutes

1. Sign in at [vercel.com](https://vercel.com) with GitHub → **Add New… → Project** → import `vasilis249/cape_avra`.
2. Framework preset: **Next.js** (detected). Leave build settings as they are.
3. **Environment Variables**: add the ones from step 2 and 3 below (you can add them later and redeploy).
4. Deploy. Every push to a branch gets its own **preview URL** (not indexed by search engines);
   the production branch (`main`) becomes the live site.
5. Later: **Settings → Domains** → add `capeavra.com`, then set `NEXT_PUBLIC_SITE_URL=https://capeavra.com`.

Commercial sites need Vercel **Pro** (the free Hobby plan is for non-commercial use).

## 2. Supabase (stores early booking requests and messages)

1. Create a project at [supabase.com](https://supabase.com); choose an **EU region** (e.g. Frankfurt), as the privacy policy says.
2. **SQL Editor** → paste and run `supabase/migrations/0001_leads.sql`.
3. **Project Settings → API**, copy into Vercel environment variables:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = `service_role` key (**secret**: server only, never share it)
4. Requests then appear in **Table Editor → leads**.

Without these variables the forms on Vercel tell visitors to email you instead (nothing is lost silently).

### 2b. Booking engine (Phase 3)

1. **SQL Editor** → run `supabase/migrations/0002_booking.sql` (reservations, calendar blocks, the
   double-booking guard and the hold functions).
2. **Connect → Transaction pooler** → copy the connection string → Vercel env `DATABASE_URL`
   (replace `[YOUR-PASSWORD]`). Server only.
3. `ICAL_EXPORT_TOKEN` = a long random string. Your calendar for Airbnb/Booking.com is then
   `https://capeavra.com/api/ical/<ICAL_EXPORT_TOKEN>` (Airbnb: Calendar → Availability →
   Connect calendars → Import; Booking.com: Rates & availability → Sync calendars).
4. `ICAL_FEEDS` = the export links of Airbnb/Booking.com, as JSON:
   `{"airbnb":"https://www.airbnb.com/calendar/ical/….ics?s=…","booking":"https://ical.booking.com/v1/export?t=…"}`
5. `CRON_SECRET` = another long random string (Vercel uses it to call the scheduled jobs).
6. Scheduled jobs are in `vercel.json`: calendar sync every 30 minutes (**needs Vercel Pro**; the free
   plan allows once a day) and a daily job at 06:17 UTC (holds, pre-arrival and review emails).
7. `BOOKING_LINK_SECRET` = another long random string (signs the "manage booking" links in emails).
8. Switch the site to live booking with `SITE_MODE=live` (or `mode: "live"` in `content/site.config.ts`)
   only after the Stripe steps below work in test mode.

### 2c. Payments with Stripe (Phase 4)

Everything below is done first in **test mode** (the "Test mode" switch in the Stripe dashboard).
Live keys go only into the Vercel **Production** environment, at launch.

1. **SQL Editor** → run `supabase/migrations/0003_payments.sql` (payments, webhook log, late confirmation).
2. Stripe → **Developers → API keys** (test mode) → Vercel env (Preview + Development):
   `STRIPE_SECRET_KEY=sk_test_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`, `PAYMENTS_PROVIDER=stripe`.
3. Stripe → **Developers → Webhooks → Add endpoint**: `https://<your-domain>/api/webhooks/stripe`, events:
   `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`,
   `payment_intent.amount_capturable_updated`, `payment_intent.processing`, `charge.refunded`.
   Copy its **Signing secret** → `STRIPE_WEBHOOK_SECRET`. (One endpoint per environment: test and live
   have different secrets.)
4. Stripe → **Settings → Payment methods**: enable Cards, Apple Pay, Google Pay (and Link if you like).
   **Payment method domains** → add your domain(s), so Apple Pay shows on Safari.
5. Stripe → **Settings → Business → Public details**: statement descriptor "CAPE AVRA", support email.
6. Test a booking end to end with card `4242 4242 4242 4242`, any future date, any CVC:
   - confirmation page and both emails; Stripe → Payments shows the deposit with the card saved;
   - `4000 0025 0000 3155` asks for 3-D Secure; `4000 0000 0000 9995` is declined;
   - "Manage your booking" (link in the email) → cancel → the refund appears in Stripe;
   - balance and security deposit run in the daily job: in test mode, book dates 31–35 days ahead
     and call `/api/cron/daily` the next day (or wait for the schedule).
7. At launch, in the Production environment only: live keys, a live webhook endpoint with its own
   secret, then `SITE_MODE=live`.

**How payments work.** Guests pay a deposit (`content/booking.ts` → `payment.depositPercent`) or, when
the balance would already be due, the full amount. The card is saved with Stripe (we never see it); the
balance is charged automatically `balanceDaysBeforeArrival` days before arrival. If that charge fails,
the guest gets an email with a link to pay and you get a copy. The security deposit is an authorisation
(not a charge) placed on the arrival day and released `securityDepositReleaseDays` after departure; card
authorisations lapse after about 7 days, so for longer stays it is placed again automatically. Keeping
part of it (damage) is done from the Stripe dashboard (Payments → the authorisation → Capture) until the
admin panel (Phase 5). Cancellations refund the percentage of what was paid set in `cancellation`.
Webhooks are the source of truth; if one is late, the confirmation page asks Stripe directly.

### 2d. Admin panel (Phase 5)

1. **SQL Editor** → run `supabase/migrations/0004_admin.sql` (notes, sign-in links, photo overrides).
2. Vercel env: `ADMIN_EMAIL` = your email address (comma-separate to add someone else),
   `ADMIN_SESSION_SECRET` = a long random string.
3. Supabase → **Storage → New bucket** → name `site-media`, **Private** (the site serves the photos
   itself, so the bucket never needs to be public).
4. Open `https://<your-domain>/admin`, enter your email, click the link in the email (valid 15 minutes,
   once), then **Sign in**. The session lasts 14 days on that device. Resend must be set up (section 3)
   for the sign-in email to arrive.

What you can do there: create bookings yourself (phone, email or an early-booking request: **Αιτήματα →
Κράτηση**), with an agreed price; the dates are held for the guest for 1–7 days and they get an email with
a link to pay online, or you record a bank transfer / cash payment, which confirms the booking. See upcoming
stays, revenue and occupancy; view bookings, add notes, refund part
of a payment, cancel with the policy refund / full / none / any amount, keep or release the security
deposit, resend the confirmation; block and reopen dates (they also go out in the iCal export) and sync
Airbnb/Booking.com now; edit seasons, prices, fees, payment and cancellation rules (new bookings only;
the terms page follows); see early-booking requests and messages and download them as CSV; upload or
replace photos for each section and add the interior photos after the renovation.

Why not Supabase Auth: there is exactly one admin, so a signed cookie plus single-use email links does the
job with no user table, no extra client library and nothing to configure in Supabase. All tables keep RLS
on with no public policies; only the server reaches them.

## 3. Resend (emails: notification to you + auto-reply to the guest)

1. Create an account at [resend.com](https://resend.com) → **Domains** → add `capeavra.com` and add the DNS records it shows.
2. **API Keys** → create a key → Vercel env `RESEND_API_KEY`.
3. `EMAIL_FROM` = `Cape Avra <hello@capeavra.com>` (must be on the verified domain).
4. `OWNER_NOTIFICATION_EMAIL` = the inbox where you want new requests.

Without `RESEND_API_KEY` the request is still stored; only the emails are skipped.

## 4. Analytics

Vercel → project → **Analytics** → enable Web Analytics. It only loads for visitors who click
"Allow analytics" in the cookie banner, and it uses no cookies.

## Checklist after setting variables

- Redeploy (Vercel → Deployments → ⋯ → Redeploy).
- Send a test request from `/en/book` and `/el/kratisi`; check the `leads` table and both emails.
