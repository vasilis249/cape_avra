/**
 * Security headers for every response (applied in next.config.ts).
 *
 * CSP: scripts and styles only from this site, plus Stripe on payment pages. Next.js streams inline
 * scripts for partial prerendering, so script-src needs 'unsafe-inline' (nonces would force every
 * page to render per request); the policy still blocks scripts, frames and connections to any
 * other host, clickjacking, <base> hijacking and form posts elsewhere.
 * Stripe's list: https://docs.stripe.com/security/guide#content-security-policy
 */
const isDev = process.env.NODE_ENV === "development";
const isPreview = process.env.VERCEL_ENV === "preview";
const stripe = { script: ["https://js.stripe.com", "https://*.js.stripe.com"], frame: ["https://js.stripe.com", "https://*.js.stripe.com", "https://hooks.stripe.com"], connect: ["https://api.stripe.com", "https://m.stripe.network", "https://*.stripe.com"] };
// Vercel's preview toolbar (comments) only on preview deployments
const vercelLive = isPreview ? ["https://vercel.live", "https://*.pusher.com", "wss://*.pusher.com"] : [];

const csp = [
  ["default-src", "'self'"],
  ["script-src", "'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), ...stripe.script, ...(isPreview ? ["https://vercel.live"] : [])],
  ["style-src", "'self'", "'unsafe-inline'"],
  ["img-src", "'self'", "data:", "blob:", "https://*.stripe.com", ...(isPreview ? ["https://vercel.live", "https://vercel.com"] : [])],
  ["font-src", "'self'", "data:", ...(isPreview ? ["https://vercel.live"] : [])],
  ["media-src", "'self'", "blob:"],
  ["connect-src", "'self'", ...stripe.connect, ...vercelLive, ...(isDev ? ["ws:"] : [])],
  ["frame-src", ...stripe.frame, ...(isPreview ? ["https://vercel.live"] : [])],
  ["worker-src", "'self'", "blob:"],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"],
  ["frame-ancestors", "'none'"],
  // only where the site is served over HTTPS (a local `next start` is plain http)
  ...(process.env.VERCEL ? [["upgrade-insecure-requests"]] : []),
]
  .map((d) => d.join(" "))
  .join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // payment stays allowed: Stripe's Apple Pay / Google Pay run in its iframes
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(process.env.VERCEL_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

/** Pages with a guest's or the owner's private data: never indexed, never stored by shared caches. */
export const privateHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Referrer-Policy", value: "same-origin" },
];
