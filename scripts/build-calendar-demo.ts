/**
 * Builds the static calendar demo into dist/pages/booking-demo/ (+ el/).
 * Run after export-html (needs dist/pages/assets/site.css). Part of `npm run export:html`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "dist/pages");

async function main() {
  await mkdir(path.join(OUT, "booking-demo"), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, "scripts/calendar-demo/entry.tsx")],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2020"],
    jsx: "automatic",
    outfile: path.join(OUT, "booking-demo/demo.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@/i18n/navigation": path.join(ROOT, "scripts/calendar-demo/mock-navigation.tsx"),
      "@/lib/booking/actions": path.join(ROOT, "scripts/calendar-demo/mock-actions.ts"),
      "@": path.join(ROOT, "src"),
      "@content": path.join(ROOT, "content"),
    },
    logLevel: "warning",
  });

  const wordmark = (await readFile(path.join(ROOT, "public/brand/wordmark-ionian.svg"), "utf8")).replace("<svg ", '<svg class="block h-auto w-40 sm:w-48" ');
  const copy = {
    en: {
      title: "Booking calendar (demo)",
      lead: "Try the calendar with sample bookings: pick dates and guests to see the rules and the full price. Prices are examples until the owner sets them.",
      other: "Ελληνικά",
      back: "Back to the site",
    },
    el: {
      title: "Ημερολόγιο κρατήσεων (επίδειξη)",
      lead: "Δοκιμάστε το ημερολόγιο με δείγμα κρατήσεων: επιλέξτε ημερομηνίες και επισκέπτες για να δείτε τους κανόνες και την πλήρη τιμή. Οι τιμές είναι παραδείγματα.",
      other: "English",
      back: "Επιστροφή στον ιστότοπο",
    },
  };
  for (const l of ["en", "el"] as const) {
    const dir = l === "en" ? "booking-demo" : "el/booking-demo";
    const up = l === "en" ? "../" : "../../";
    const c = copy[l];
    const html = `<!doctype html>
<html lang="${l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${c.title} · Cape Avra</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="${up}assets/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${up}assets/site.css">
</head>
<body>
<header class="border-b border-limestone/50">
  <div class="mx-auto flex h-20 max-w-site items-center justify-between px-5 sm:px-8 lg:px-12">
    <a href="${up}${l === "el" ? "el/" : ""}" aria-label="Cape Avra" class="text-ionian">${wordmark}</a>
    <a href="${up}${l === "en" ? "el/booking-demo/" : "booking-demo/"}" lang="${l === "en" ? "el" : "en"}" hreflang="${l === "en" ? "el" : "en"}" class="text-[0.8125rem] tracking-[0.12em] uppercase text-ionian">${c.other}</a>
  </div>
</header>
<main id="main" class="mx-auto w-full max-w-site px-5 pt-12 pb-24 sm:px-8 lg:px-12 lg:pt-16">
  <p class="text-eyebrow font-medium uppercase text-ink-soft">Cape Avra</p>
  <span aria-hidden="true" class="mt-5 block h-px w-12 bg-limestone"></span>
  <h1 class="mt-6 text-h1 text-ionian">${c.title}</h1>
  <p class="mt-6 max-w-2xl text-lead text-ink-soft">${c.lead}</p>
  <div id="demo" class="mt-12"></div>
  <p class="mt-16"><a href="${up}${l === "el" ? "el/" : ""}" class="text-ionian underline underline-offset-4">${c.back}</a></p>
</main>
<script src="${up}booking-demo/demo.js"></script>
</body>
</html>
`;
    await mkdir(path.join(OUT, dir), { recursive: true });
    await writeFile(path.join(OUT, dir, "index.html"), html);
  }
  console.log("✓ dist/pages/booking-demo/ (calendar demo, EN + EL)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
