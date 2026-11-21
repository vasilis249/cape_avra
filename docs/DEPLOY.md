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
7. Switch the site to live booking with `SITE_MODE=live` (or `mode: "live"` in `content/site.config.ts`).
   Until Stripe is connected (Phase 4), keep it in preview on production.

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
