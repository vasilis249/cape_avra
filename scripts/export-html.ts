/**
 * Exports the built Home page (EN + EL) as plain, self-contained HTML:
 * no Node, no React runtime. CSS, fonts and photos are embedded, and a
 * small vanilla script replaces the interactive parts (header on scroll,
 * mobile menu, scroll reveals, sticky booking bar).
 *
 *   npm run export:html        (builds first, then exports)
 *
 * Outputs
 *  - preview/cape-avra-en.html, preview/cape-avra-el.html
 *      one file per language, everything inlined (open by double-click)
 *  - preview/.artifact/index.html + photos/*.webp   (git-ignored)
 *      both languages in one page (#en / #el), for the hosted preview link
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import sharp from "sharp";

const ROOT = process.cwd();
const PORT = Number(process.env.EXPORT_PORT ?? 3197);
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(ROOT, "preview");
const ART = path.join(OUT, ".artifact");
const LOCALES = ["en", "el"] as const;
type L = (typeof LOCALES)[number];

const SOON: Record<L, string> = {
  en: "This page arrives in the next phase of the build.",
  el: "Αυτή η σελίδα έρχεται στην επόμενη φάση.",
};

/* ------------------------------------------------------------- helpers */

async function startServer(): Promise<ChildProcess> {
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/en`);
      if (r.ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error("next start did not come up. Run `npm run build` first.");
}

const toDataUri = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;

/** Inline the stylesheet: fonts → data URIs, font variables → :root, reveal visible at rest. */
async function buildCss(html: string): Promise<string> {
  const $ = cheerio.load(html);
  let css = "";
  for (const el of $('link[rel="stylesheet"]').toArray()) {
    const cssUrl = new URL($(el).attr("href")!, BASE);
    let sheet = await (await fetch(cssUrl)).text();
    // font URLs are relative to the stylesheet (e.g. ../media/x.woff2)
    const fontUrls = [...new Set([...sheet.matchAll(/url\(([^)]+?\.woff2)\)/g)].map((m) => m[1]))];
    for (const u of fontUrls) {
      const buf = Buffer.from(await (await fetch(new URL(u.replace(/["']/g, ""), cssUrl))).arrayBuffer());
      sheet = sheet.split(`url(${u})`).join(`url(${toDataUri(buf, "font/woff2")})`);
    }
    css += sheet;
  }
  // next/font puts its CSS variables on classes of <html>; the export can't rely on them
  const htmlClasses = ($("html").attr("class") ?? "").split(/\s+/).filter(Boolean);
  const vars = htmlClasses
    .map((c) => css.match(new RegExp(`\\.${c}\\{([^}]*)\\}`))?.[1])
    .filter(Boolean)
    .join(";");
  css += `:root{${vars}}`;
  // Content is visible at rest; only blocks below the fold (marked by the script) fade in.
  css += `.reveal{opacity:1;transform:none}.reveal.is-pending{opacity:0;transform:translate3d(0,1.25rem,0)}.reveal.is-pending[data-revealed]{opacity:1;transform:none}`;
  css += `.soon-toast{position:fixed;left:50%;bottom:max(1.25rem,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:70;background:var(--color-night);color:var(--color-salt);padding:.75rem 1.25rem;font-size:.875rem;max-width:calc(100% - 2rem);text-align:center}`;
  return css;
}

/** Photos: /_next/image?url=/photos/<id>.<hash>.jpg → 1600px WebP (data URI or file). */
const photoCache = new Map<string, Buffer>();
async function photoWebp(file: string): Promise<Buffer> {
  if (!photoCache.has(file)) {
    const buf = await sharp(path.join(ROOT, "public/photos", file))
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    photoCache.set(file, buf);
  }
  return photoCache.get(file)!;
}

type Mode = { kind: "standalone" } | { kind: "artifact" };

/** Turn one rendered page's <body> into static markup. */
async function processBody(html: string, locale: L, mode: Mode): Promise<string> {
  const $ = cheerio.load(html);
  $("script, noscript, template, link").remove();
  $('[hidden][id^="S:"]').remove();

  for (const el of $("img").toArray()) {
    const img = $(el);
    const src = img.attr("src") ?? "";
    const m = decodeURIComponent(src).match(/\/photos\/([^&]+)/);
    if (!m) continue;
    const file = m[1];
    const id = file.split(".")[0];
    if (mode.kind === "standalone") {
      img.attr("src", toDataUri(await photoWebp(file), "image/webp"));
    } else {
      await photoWebp(file);
      img.attr("src", `photos/${id}.webp`);
    }
    img.removeAttr("srcset").removeAttr("sizes").removeAttr("fetchpriority");
  }

  const suffix = mode.kind === "artifact" && locale === "el" ? "-el" : "";
  if (suffix) {
    // both languages live in one document: keep ids unique
    $("[id]").each((_, e) => void $(e).attr("id", $(e).attr("id") + suffix));
    for (const attr of ["aria-labelledby", "aria-controls"]) {
      $(`[${attr}]`).each((_, e) => void $(e).attr(attr, $(e).attr(attr) + suffix));
    }
  }

  $("a[href]").each((_, e) => {
    const a = $(e);
    const href = a.attr("href")!;
    if (!href.startsWith("/")) return;
    const [p, hash] = href.split("#");
    const target = p.replace(/\/$/, "");
    if (target === "/en" || target === "/el") {
      const l = target.slice(1) as L;
      if (hash) a.attr("href", `#${hash}${suffix}`);
      else a.attr("href", mode.kind === "standalone" ? `cape-avra-${l}.html` : `#${l}`);
    } else {
      a.attr("href", "#").attr("data-soon", "");
    }
  });

  return $("body").html() ?? "";
}

function runtimeScript(soon: Record<string, string>, multiLang: boolean) {
  // Vanilla replacement for the React islands. Kept small and dependency-free.
  return `<script>
(() => {
  const SOON = ${JSON.stringify(soon)};
  const OVERLAY = ["bg-gradient-to-b","from-night/45","to-transparent","text-salt"];
  const SOLID = ["bg-salt/92","text-ink","shadow-[0_1px_0_rgb(191_174_147/0.45)]","backdrop-blur-md"];
  const CTA_LIGHT = ["border","border-salt/50","text-salt","hover:border-salt","hover:bg-salt","hover:text-night"];
  const CTA_SOLID = ["bg-ionian","text-salt","hover:bg-ionian-deep"];
  const lang = () => (${multiLang} && location.hash === "#el") ? "el" : document.documentElement.dataset.activeLang || "en";
  const scope = () => document.querySelector('[data-lang="' + lang() + '"]') || document;

  function setLang() {
    if (!${multiLang}) return;
    const l = location.hash === "#el" ? "el" : location.hash === "#en" || !document.documentElement.dataset.activeLang ? "en" : document.documentElement.dataset.activeLang;
    if (location.hash !== "#el" && location.hash !== "#en" && document.documentElement.dataset.activeLang) return;
    document.documentElement.dataset.activeLang = l;
    document.documentElement.lang = l;
    document.querySelectorAll("[data-lang]").forEach((b) => (b.hidden = b.dataset.lang !== l));
    const t = document.querySelector('[data-lang="' + l + '"]')?.dataset.title;
    if (t) document.title = t;
    window.scrollTo(0, 0);
    initReveal();
    onScroll();
  }

  function onScroll() {
    const s = scope();
    const scrolled = window.scrollY > 24;
    s.querySelectorAll("header").forEach((h) => {
      if (!h.dataset.variant) h.dataset.variant = h.classList.contains("from-night/45") ? "overlay" : "solid";
      const solid = h.dataset.variant === "solid" || scrolled;
      h.classList.remove(...(solid ? OVERLAY : SOLID));
      h.classList.add(...(solid ? SOLID : OVERLAY));
      const wm = h.querySelector("a > span:nth-child(2)");
      if (wm) { wm.classList.toggle("opacity-100", solid); wm.classList.toggle("opacity-0", !solid); wm.classList.toggle("pointer-events-none", !solid); }
      const cta = h.querySelector("div > a.max-lg\\\\:hidden");
      if (cta) { cta.classList.remove(...(solid ? CTA_LIGHT : CTA_SOLID)); cta.classList.add(...(solid ? CTA_SOLID : CTA_LIGHT)); }
    });
    const visible = window.scrollY > window.innerHeight * 0.6;
    s.querySelectorAll(".fixed.bottom-0.lg\\\\:hidden").forEach((bar) => {
      bar.classList.toggle("translate-y-0", visible);
      bar.classList.toggle("translate-y-full", !visible);
      bar.setAttribute("aria-hidden", String(!visible));
      bar.querySelectorAll("a").forEach((a) => (a.tabIndex = visible ? 0 : -1));
    });
  }

  let io;
  function initReveal() {
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    io?.disconnect();
    io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.setAttribute("data-revealed", ""); io.unobserve(e.target); } }), { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });
    scope().querySelectorAll(".reveal:not([data-revealed])").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add("is-pending"); io.observe(el); }
      else el.setAttribute("data-revealed", "");
    });
  }

  // mobile menu
  let lastButton = null;
  function closeMenu(d) {
    d.hidden = true; document.body.style.overflow = "";
    document.querySelectorAll('[aria-controls="' + d.id + '"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
    lastButton?.focus();
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const dialog = t.closest('[role="dialog"]');
    if (t.matches("button[aria-controls]")) {
      const d = document.getElementById(t.getAttribute("aria-controls"));
      if (d) { lastButton = t; d.hidden = false; t.setAttribute("aria-expanded", "true"); document.body.style.overflow = "hidden"; d.querySelector("a, button")?.focus(); }
      return;
    }
    if (dialog && (t.tagName === "BUTTON" || t.tagName === "A")) { if (t.tagName === "BUTTON") { closeMenu(dialog); return; } closeMenu(dialog); }
    if (t.matches("a[data-soon]")) {
      e.preventDefault();
      let toast = document.querySelector(".soon-toast");
      if (!toast) { toast = document.createElement("div"); toast.className = "soon-toast"; toast.setAttribute("role", "status"); document.body.appendChild(toast); }
      toast.textContent = SOON[lang()]; toast.hidden = false;
      clearTimeout(toast._t); toast._t = setTimeout(() => (toast.hidden = true), 2600);
    }
  });
  document.addEventListener("keydown", (e) => {
    const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => !x.hidden);
    if (!d) return;
    if (e.key === "Escape") closeMenu(d);
    if (e.key === "Tab") {
      const items = [...d.querySelectorAll("a, button")];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("hashchange", setLang);
  setLang();
  initReveal();
  onScroll();
})();
</script>`;
}

/* ---------------------------------------------------------------- main */

async function main() {
  await mkdir(path.join(ART, "photos"), { recursive: true });
  const server = await startServer();
  try {
    const pages = {} as Record<L, string>;
    for (const l of LOCALES) pages[l] = await (await fetch(`${BASE}/${l}`)).text();
    const css = await buildCss(pages.en);
    const icon = toDataUri(await readFile(path.join(ROOT, "src/app/icon.svg")), "image/svg+xml");

    // 1) One self-contained file per language
    for (const l of LOCALES) {
      const $ = cheerio.load(pages[l]);
      const title = $("title").text();
      const desc = $('meta[name="description"]').attr("content") ?? "";
      const body = await processBody(pages[l], l, { kind: "standalone" });
      const doc = `<!doctype html>
<html lang="${l}" data-active-lang="${l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc.replace(/"/g, "&quot;")}">
<meta name="theme-color" content="#1b2433">
<link rel="icon" href="${icon}">
<style>${css}</style>
</head>
<body>${body}${runtimeScript(SOON, false)}</body>
</html>
`;
      await writeFile(path.join(OUT, `cape-avra-${l}.html`), doc);
      console.log(`✓ preview/cape-avra-${l}.html  ${(doc.length / 1024 / 1024).toFixed(1)} MB`);
    }

    // 2) Hosted preview: both languages in one page, photos as sibling files
    const blocks: string[] = [];
    for (const l of LOCALES) {
      const title = cheerio.load(pages[l])("title").text();
      const body = await processBody(pages[l], l, { kind: "artifact" });
      blocks.push(`<div data-lang="${l}" data-title="${title}"${l === "en" ? "" : " hidden"}>${body}</div>`);
    }
    const artifact = `<meta charset="utf-8">
<title>Cape Avra</title>
<meta name="description" content="Cape Avra · Mytikas, Preveza">
<style>${css}</style>
${blocks.join("\n")}
${runtimeScript(SOON, true)}
`;
    await writeFile(path.join(ART, "index.html"), artifact);
    for (const [file, buf] of photoCache) {
      await writeFile(path.join(ART, "photos", `${file.split(".")[0]}.webp`), buf);
    }
    console.log(`✓ preview/.artifact/index.html  ${(artifact.length / 1024).toFixed(0)} KB + ${photoCache.size} photos`);
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
