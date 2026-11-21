import { Commissioner, Noto_Serif_Display } from "next/font/google";

// Self-hosted at build time by next/font: no requests to Google from visitors (GDPR).
export const display = Noto_Serif_Display({
  subsets: ["latin", "greek"],
  style: ["normal", "italic"],
  variable: "--font-noto-serif-display",
  // "optional": the headline (our LCP element) paints once and never re-paints on a late
  // font swap. Fonts are preloaded, so on normal connections the serif arrives in time;
  // on very slow first visits the metric-matched fallback is kept for that page view only.
  display: "optional",
});
export const sans = Commissioner({
  subsets: ["latin", "greek"],
  variable: "--font-commissioner",
  display: "swap",
});
