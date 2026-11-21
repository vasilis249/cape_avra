# Security review (Phase 6)

Scope: the whole application as of Phase 6. Public site, booking and payments, guest links, webhooks,
cron jobs, iCal, admin panel, database, email, uploads, dependencies, headers. Each item says what
protects it and where; "Fixed in Phase 6" marks what this review changed.

## Summary

No critical or high findings remain open. The main residual risks are operational: the in-memory rate
limits, and that holds can briefly block dates (see the end). Set up the recommended Vercel Firewall
rules at launch.

## Threats and controls

| Area | Threat | Control |
| --- | --- | --- |
| **Prices** | Guest tampers with the amount | The browser only displays prices; the server re-validates the stay and re-prices it (`holdStay`), and PaymentIntents are created server-side from the stored quote. |
| **Double booking** | Race between two guests, or with Airbnb/Booking.com | Postgres exclusion constraint on active reservations + `create_hold()` / `confirm_paid_reservation()` refuse calendar blocks; tested concurrently. A payment that lands after its hold expired confirms only if the dates are still free, else it is refunded in full. |
| **Payments** | Forged webhooks, replays, out-of-order events | Raw-body Stripe signature check (`STRIPE_WEBHOOK_SECRET`), event-id dedupe, and the handler re-fetches the PaymentIntent instead of trusting the event body. All transitions are atomic (`transitionPayment`), so retries are harmless. |
| | Live keys used by accident | Live keys are refused outside the production deployment; the simulated provider is refused in production. |
| | Card data | Never touches our servers (Stripe Payment Element in Stripe's iframe). Stripe.js only loads on payment forms. |
| **Guest links** | Guessing or leaking booking links | 192-bit random token, only its SHA-256 stored; later emails use HMAC(ref, `BOOKING_LINK_SECRET`). Booking pages send `Referrer-Policy: same-origin` and `X-Robots-Tag: noindex`. |
| **Admin sign-in** | Account takeover, link interception, scanners using the link | Only `ADMIN_EMAIL` addresses; 256-bit single-use link (hash stored, 15 min); the GET page only shows a button (POST signs in); same answer for unknown addresses; rate limits per IP and per address. The link's host comes from configuration, never from the request's `Host` header. |
| | Session theft or forgery | HMAC-signed cookie (`ADMIN_SESSION_SECRET`), `httpOnly`, `Secure`, `SameSite=Lax`, path `/admin`, 14 days; removing an address from `ADMIN_EMAIL` revokes it. |
| | Missing authorisation on an action | Every admin page, server action and route handler checks the session itself (layouts are not trusted). **A test enforces it** (`admin.test.ts › security invariants`). |
| **CSRF** | Cross-site form posts | Next.js checks `Origin` on server actions; `SameSite=Lax`; CSP `form-action 'self'`. |
| **XSS** | Injected scripts | React escaping; emails escape every value; JSON-LD escapes `<`; legal Markdown comes only from the repository. **Fixed in Phase 6:** CSP limiting scripts, frames and connections to this site + Stripe, plus `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. `script-src` keeps `'unsafe-inline'` because Next.js streams inline scripts for prerendered pages; nonces would make every page dynamic. |
| **Clickjacking** | Framing the checkout or admin | `frame-ancestors 'none'` + `X-Frame-Options: DENY`. |
| **SQL injection** | Malicious input in queries | postgres.js tagged templates (parameters) only; `LIKE` wildcards escaped in admin search. |
| **Database access** | Direct access with public keys | RLS on every table with no public policies; functions are `security definer` with a fixed `search_path` and revoked from `anon`/`authenticated`. Only the server connects (`DATABASE_URL`, service role). |
| **Uploads** | Malicious files, decompression bombs, location leaks | Admin only; type and size checks (4 MB); sharp re-encodes to JPEG (strips EXIF/GPS) with a pixel limit; content-hashed names; served with `nosniff` from a strict path pattern (no traversal). |
| **iCal import** | Huge or hostile feeds | Feed URLs only from env (https); 15 s timeout; **Fixed in Phase 6:** 5 MB download cap. A failed or empty fetch never wipes a source. |
| **Cron / iCal export** | Unauthenticated calls | `CRON_SECRET` bearer and `ICAL_EXPORT_TOKEN`, both compared in constant time. |
| **CSV export** | Formula injection in Excel | Cells starting with `=`, `@`, tab/CR, or `+`/`-` followed by non-numbers are prefixed with `'`. |
| **Spam / abuse** | Form spam, many holds | Honeypot, time-to-fill and per-IP limits on forms; 6 holds per 15 min per IP; 12 payment preparations per 15 min. **Fixed in Phase 6:** the limiter evicts old keys instead of resetting all limits when full; one shared `clientIp()`. |
| **Privacy (GDPR)** | Keeping data longer than promised | **Fixed in Phase 6:** the daily job deletes requests after 24 months and never-paid checkouts after 90 days, as the privacy policy says. |
| **Transport** | Downgrade | Vercel serves HTTPS; **Fixed in Phase 6:** HSTS (2 years, subdomains) on production, `upgrade-insecure-requests`. |
| **Other headers** | | `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (same-origin on private pages), `Permissions-Policy` (no camera/mic/geolocation; payment allowed for Apple/Google Pay), `COOP: same-origin-allow-popups`. |
| **Dependencies** | Known vulnerabilities | `npm audit --omit=dev`: 0 vulnerabilities (21 Nov 2026). CI runs on every push. |
| **Secrets** | Leaks in the repo | All in env (`.env.example` documents them); nothing secret uses `NEXT_PUBLIC_`; no secret in client components (checked). |

## Residual risks and recommendations

1. **Rate limits are per server instance** (in memory). On Vercel, add **Firewall → Rate limiting** rules at
   launch: e.g. 30 requests/minute per IP for `POST` to `/en/book*` and `/el/kratisi*`, 10/minute for
   `/admin/login`. If spam appears, move the limiter to a shared store (Upstash Redis).
2. **Holds can block dates for 15 minutes.** Someone using many IPs could keep dates "held". Mitigations
   available if it ever happens: Vercel BotID on the booking button, a shorter `holdMinutes` (admin →
   prices), or requiring the email before holding.
3. **CSP allows inline scripts** (see XSS above). Acceptable with React's escaping; revisit if Next.js
   offers hashes for prerendered pages.
4. **Email is the admin's second factor.** Protect that mailbox with 2-step verification.
5. **Backups**: enable Supabase daily backups (Pro plan: point-in-time recovery) and test a restore once.
6. **Rotate** `ADMIN_SESSION_SECRET`, `CRON_SECRET`, `ICAL_EXPORT_TOKEN` and the Stripe keys if anyone
   who had access leaves. Rotating `BOOKING_LINK_SECRET` invalidates guests' "manage booking" links.
