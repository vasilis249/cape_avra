/**
 * Exports the built site as plain static HTML: no Node, no React runtime.
 * A small vanilla script replaces the interactive parts (header on scroll,
 * mobile menu, scroll reveals, sticky booking bar, hero video, gallery
 * filters + photo viewer). Forms need a server, so static pages show a
 * note with the contact email instead.
 *
 *   npm run export:html        (builds first, then exports)
 *
 * Outputs
 *  - preview/cape-avra-en.html, preview/cape-avra-el.html
 *      one file per language, everything inlined (open by double-click)
 *  - dist/pages/   every page in both languages, for GitHub Pages (git-ignored)
 *  - preview/.artifact/index.html + photos/*.webp   (git-ignored)
 *      Home in both languages in one page (#en / #el), for the private preview link
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { routing } from "../src/i18n/routing";
import { siteConfig } from "../content/site.config";

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

const STATIC_FORM: Record<L, string> = {
  en: "This preview is a static copy of the site, so the form is switched off here. Write to us at {email} and we will reply personally.",
  el: "Αυτή η προεπισκόπηση είναι στατικό αντίγραφο του ιστότοπου, οπότε η φόρμα δεν λειτουργεί εδώ. Γράψτε μας στο {email} και θα σας απαντήσουμε προσωπικά.",
};

/** Every page: internal pathname × locale → rendered URL and static output folder. */
type Route = { url: string; out: string; locale: L };
// checkout / confirmation need the server and a guest's private link: not exported
const ROUTES: Route[] = Object.entries(routing.pathnames).filter(([k]) => !k.startsWith("/book/")).flatMap(([, v]) =>
  LOCALES.map((l) => {
    const slug = typeof v === "string" ? v : v[l];
    const url = `/${l}${slug === "/" ? "" : slug}`;
    const out = `${l === "en" ? "" : "el/"}${slug.replace(/^\//, "")}`.replace(/\/$/, "");
    return { url, out, locale: l };
  }),
);
const outByUrl = new Map(ROUTES.map((r) => [r.url, r.out]));

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
  css += `.x-lightbox{margin:0;width:100vw;height:100dvh;max-width:none;max-height:none;padding:0;border:0;background:rgb(27 36 51/.97);color:var(--color-salt)}.x-lightbox::backdrop{background:rgb(27 36 51/.8)}.x-lb-top{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;font-size:.8125rem;letter-spacing:.14em;text-transform:uppercase}.x-lb-close{min-height:44px;padding:0 .5rem;letter-spacing:.14em;text-transform:uppercase}.x-lb-fig{height:calc(100dvh - 5rem);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 1rem 1rem;margin:0}.x-lb-fig img{max-width:100%;min-height:0;flex:1;object-fit:contain}.x-lb-fig figcaption{margin-top:1rem;max-width:42rem;text-align:center;font-size:.875rem;color:rgb(246 242 234/.8)}.x-lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:48px;height:48px;font-size:2.25rem;line-height:1;color:rgb(246 242 234/.8)}.x-lb-prev{left:.5rem}.x-lb-next{right:.5rem}`;
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

const posterCache = new Map<string, Buffer>();
async function posterWebp(file: string): Promise<Buffer> {
  if (!posterCache.has(file)) {
    posterCache.set(file, await sharp(path.join(ROOT, "public/video", file)).webp({ quality: 80 }).toBuffer());
  }
  return posterCache.get(file)!;
}
const videoFiles = new Set<string>();

/** standalone: one file, everything inlined · artifact: both languages in one page · pages: static site (GitHub Pages) */
type Mode = { kind: "standalone" } | { kind: "artifact" } | { kind: "pages"; prefix: string; route: Route };

/** Turn one rendered page's <body> into static markup. */
async function processBody(html: string, locale: L, mode: Mode): Promise<string> {
  const $ = cheerio.load(html);
  // relative asset path (pages for /el/ live one folder deeper)
  const rel = (p: string) => (mode.kind === "pages" ? mode.prefix + p : p);
  const messages = JSON.parse(await readFile(path.join(ROOT, `content/messages/${locale}.json`), "utf8"));
  const labels = { pause: messages.home.hero.pauseVideo as string, play: messages.home.hero.playVideo as string };
  $("script, noscript, template, link").remove();
  $('[hidden][id^="S:"]').remove();

  // hero video: poster (art-directed <picture>) + video sources
  for (const el of $("picture source[srcset]").toArray()) {
    const src = $(el);
    const file = decodeURIComponent(src.attr("srcset") ?? "").match(/\/video\/([^&\s]+\.jpg)/)?.[1];
    if (!file) continue;
    const buf = await posterWebp(file);
    src.attr("srcset", mode.kind === "standalone" ? toDataUri(buf, "image/webp") : rel(`video/${file.split(".")[0]}.webp`));
  }
  for (const el of $("video").toArray()) {
    const v = $(el);
    v.attr("muted", "").attr("autoplay", null);
    for (const attr of ["data-src-landscape", "data-src-portrait", "data-webm-landscape", "data-webm-portrait"]) {
      const file = (v.attr(attr) ?? "").split("/").pop()!;
      if (!file) continue;
      videoFiles.add(file);
      // standalone files sit in preview/, next to the repo's public/ folder
      v.attr(attr, mode.kind === "standalone" ? `../public/video/${file}` : rel(`video/${file}`));
    }
  }

  for (const el of $("img").toArray()) {
    const img = $(el);
    const src = img.attr("src") ?? "";
    const vposter = decodeURIComponent(src).match(/\/video\/([^&]+\.jpg)/)?.[1];
    if (vposter) {
      const buf = await posterWebp(vposter);
      img.attr("src", mode.kind === "standalone" ? toDataUri(buf, "image/webp") : rel(`video/${vposter.split(".")[0]}.webp`));
      img.removeAttr("srcset").removeAttr("sizes").removeAttr("fetchpriority");
      continue;
    }
    const m = decodeURIComponent(src).match(/\/photos\/([^&]+)/);
    if (!m) continue;
    const file = m[1];
    const id = file.split(".")[0];
    if (mode.kind === "standalone") {
      img.attr("src", toDataUri(await photoWebp(file), "image/webp"));
    } else {
      await photoWebp(file);
      img.attr("src", rel(`photos/${id}.webp`));
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

  $("[data-video-toggle]").each((_, e) => {
    const b = $(e);
    b.attr("data-label-pause", labels.pause).attr("data-label-play", labels.play);
  });

  // every export is static: forms can't submit, and no consent banner/analytics is shipped
  $("form").each((_, e) => {
    const email = siteConfig.contact.email;
    const note = STATIC_FORM[locale].replace("{email}", `<a href="mailto:${email}" class="text-ionian underline underline-offset-4">${email}</a>`);
    $(e).replaceWith(`<p class="bg-sand p-8 text-ink-soft sm:p-10">${note}</p>`);
  });
  $("[data-cookie-settings]").closest("li").remove();

  $("a[href]").each((_, e) => {
    const a = $(e);
    const href = a.attr("href")!;
    if (!href.startsWith("/")) return;
    const [p, hash] = href.split("#");
    const target = p.replace(/\/$/, "");
    if (mode.kind === "pages") {
      const out = outByUrl.get(target);
      if (out === undefined) {
        a.attr("href", "#").attr("data-soon", "");
        return;
      }
      if (out === mode.route.out && hash) {
        a.attr("href", `#${hash}`);
        return;
      }
      const rel = (mode.prefix + (out ? `${out}/` : "")) || "./";
      a.attr("href", rel + (hash ? `#${hash}` : ""));
      return;
    }
    if (target === "/en" || target === "/el") {
      const l = target.slice(1) as L;
      if (hash) a.attr("href", `#${hash}${suffix}`);
      else if (mode.kind === "standalone") a.attr("href", `cape-avra-${l}.html`);
      else a.attr("href", `#${l}`);
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

  // hero background video (mirrors components/media/HeroVideo.tsx)
  const PAUSE_ICON = "M4 2.5h2.5v11H4zM9.5 2.5H12v11H9.5z", PLAY_ICON = "M4.5 2.5v11l9-5.5z";
  function setupVideos() {
    document.querySelectorAll("video[data-src-landscape]").forEach((v) => {
      if (v.dataset.ready) return; v.dataset.ready = "1";
      const btn = v.parentElement.querySelector("[data-video-toggle]");
      const labels = { pause: btn?.dataset.labelPause, play: btn?.dataset.labelPlay };
      const sync = () => {
        if (!btn) return;
        const playing = !v.paused;
        btn.setAttribute("aria-label", playing ? labels.pause : labels.play);
        btn.setAttribute("aria-pressed", String(!playing));
        btn.querySelector("path")?.setAttribute("d", playing ? PAUSE_ICON : PLAY_ICON);
      };
      let userPaused = false;
      const load = () => {
        if (v.getAttribute("src")) return;
        const o = matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
        v.src = v.canPlayType('video/mp4; codecs="avc1.640028"') ? v.dataset["src" + o[0].toUpperCase() + o.slice(1)] : v.dataset["webm" + o[0].toUpperCase() + o.slice(1)];
      };
      v.addEventListener("playing", () => { v.classList.remove("opacity-0"); v.classList.add("opacity-100"); sync(); });
      v.addEventListener("pause", sync);
      btn?.addEventListener("click", () => { load(); if (v.paused) { userPaused = false; v.play().catch(() => {}); } else { userPaused = true; v.pause(); } });
      v.muted = true; // React sets this as a property on hydration; static HTML has to do it here
      const conn = navigator.connection;
      const skip = matchMedia("(prefers-reduced-motion: reduce)").matches || conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || "");
      v._autostart = () => { if (!skip && !userPaused) { load(); v.play().catch(() => {}); } };
      if (!v.closest("[hidden]")) v._autostart();
      new IntersectionObserver(([e]) => {
        if (!v.getAttribute("src")) return;
        if (!e.isIntersecting || v.closest("[hidden]")) v.pause();
        else if (!userPaused) v.play().catch(() => {});
      }).observe(v);
    });
  }
  function pauseHiddenVideos() {
    document.querySelectorAll("[hidden] video").forEach((v) => v.pause());
    scope().querySelectorAll("video[data-src-landscape]").forEach((v) => v._autostart?.());
  }
  window.addEventListener("hashchange", pauseHiddenVideos);
  if (document.readyState === "complete") setupVideos(); else window.addEventListener("load", setupVideos);

  // gallery: filters + photo viewer (mirrors components/media/GalleryGrid.tsx)
  function setupGallery() {
    const bar = document.querySelector("[data-gallery-filters]");
    const grid = document.querySelector("[data-gallery-grid]");
    if (!bar || !grid) return;
    const ON = ["border-ionian", "bg-ionian", "text-salt"], OFF = ["border-limestone", "text-ink", "hover:border-ionian"];
    const empty = document.createElement("p");
    empty.className = "linen mt-10 flex min-h-64 items-center justify-center p-10 text-center font-display text-xl text-ink-soft";
    empty.hidden = true;
    grid.after(empty);
    const items = [...grid.querySelectorAll("li[data-category]")];
    bar.querySelectorAll("button[data-filter]").forEach((b) => b.addEventListener("click", () => {
      const f = b.dataset.filter;
      bar.querySelectorAll("button[data-filter]").forEach((x) => {
        const on = x === b;
        x.setAttribute("aria-pressed", String(on));
        x.classList.remove(...(on ? OFF : ON)); x.classList.add(...(on ? ON : OFF));
        const n = x.querySelector("span"); if (n) { n.classList.toggle("text-salt/75", on); n.classList.toggle("text-ink-soft", !on); }
      });
      let shown = 0;
      items.forEach((li) => { const v = f === "all" || li.dataset.category === f; li.hidden = !v; if (v) shown++; });
      grid.hidden = shown === 0;
      empty.hidden = shown !== 0;
      empty.textContent = bar.dataset["empty" + f[0].toUpperCase() + f.slice(1)] || "";
    }));

    const L = { close: bar.dataset.labelClose, prev: bar.dataset.labelPrev, next: bar.dataset.labelNext, counter: bar.dataset.labelCounter };
    const dlg = document.createElement("dialog");
    dlg.className = "x-lightbox";
    dlg.innerHTML = '<div class="x-lb-top"><span class="x-lb-count" aria-live="polite"></span><button type="button" class="x-lb-close"></button></div>' +
      '<figure class="x-lb-fig"><img alt=""><figcaption></figcaption></figure>' +
      '<button type="button" class="x-lb-nav x-lb-prev">&#8249;</button><button type="button" class="x-lb-nav x-lb-next">&#8250;</button>';
    document.body.appendChild(dlg);
    dlg.querySelector(".x-lb-close").textContent = L.close;
    dlg.querySelector(".x-lb-prev").setAttribute("aria-label", L.prev);
    dlg.querySelector(".x-lb-next").setAttribute("aria-label", L.next);
    let list = [], i = 0, opener = null;
    const show = () => {
      const li = list[i], img = li.querySelector("img");
      const big = dlg.querySelector("img");
      big.src = img.currentSrc || img.src; big.alt = li.dataset.alt || "";
      dlg.querySelector("figcaption").textContent = li.dataset.alt || "";
      dlg.querySelector(".x-lb-count").textContent = L.counter.replace("{current}", i + 1).replace("{total}", list.length);
    };
    const step = (d) => { i = (i + d + list.length) % list.length; show(); };
    items.forEach((li) => li.querySelector("button")?.addEventListener("click", (e) => {
      list = items.filter((x) => !x.hidden); i = list.indexOf(li); opener = e.currentTarget; show(); dlg.showModal();
    }));
    dlg.querySelector(".x-lb-close").addEventListener("click", () => dlg.close());
    dlg.querySelector(".x-lb-prev").addEventListener("click", () => step(-1));
    dlg.querySelector(".x-lb-next").addEventListener("click", () => step(1));
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); });
    dlg.addEventListener("close", () => opener?.focus());
    let x0 = null;
    dlg.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
    dlg.addEventListener("touchend", (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); x0 = null; });
  }
  setupGallery();

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

    // 2) Static site for GitHub Pages: every page, / = EN, /el/... = EL, shared asset files
    const PAGES = path.join(ROOT, "dist/pages");
    await rm(PAGES, { recursive: true, force: true });
    for (const d of ["assets", "photos", "video"]) await mkdir(path.join(PAGES, d), { recursive: true });
    await writeFile(path.join(PAGES, "assets/site.css"), css);
    await writeFile(path.join(PAGES, "assets/icon.svg"), await readFile(path.join(ROOT, "src/app/icon.svg")));
    for (const [i, route] of ROUTES.entries()) {
      const sibling = ROUTES[i % 2 === 0 ? i + 1 : i - 1]; // same page, other language
      const prefix = "../".repeat(route.out ? route.out.split("/").length : 0);
      const href = (r: Route) => (prefix + (r.out ? `${r.out}/` : "")) || "./";
      const html = route.url === "/en" || route.url === "/el" ? pages[route.locale] : await (await fetch(BASE + encodeURI(route.url))).text();
      const $ = cheerio.load(html);
      const title = $("title").text();
      const desc = $('meta[name="description"]').attr("content") ?? "";
      const body = await processBody(html, route.locale, { kind: "pages", prefix, route });
      const doc = `<!doctype html>
<html lang="${route.locale}" data-active-lang="${route.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc.replace(/"/g, "&quot;")}">
<!-- preview build with placeholder details: keep it out of search engines -->
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#1b2433">
<link rel="icon" href="${prefix}assets/icon.svg" type="image/svg+xml">
<link rel="alternate" hreflang="${route.locale}" href="${href(route)}">
<link rel="alternate" hreflang="${sibling.locale}" href="${href(sibling)}">
<link rel="stylesheet" href="${prefix}assets/site.css">
</head>
<body>${body}${runtimeScript(SOON, false)}</body>
</html>
`;
      await mkdir(path.join(PAGES, route.out), { recursive: true });
      await writeFile(path.join(PAGES, route.out, "index.html"), doc);
    }
    for (const [file, buf] of photoCache) await writeFile(path.join(PAGES, "photos", `${file.split(".")[0]}.webp`), buf);
    for (const [file, buf] of posterCache) await writeFile(path.join(PAGES, "video", `${file.split(".")[0]}.webp`), buf);
    for (const file of videoFiles) {
      await writeFile(path.join(PAGES, "video", file), await readFile(path.join(ROOT, "public/video", file)));
    }
    await writeFile(path.join(PAGES, ".nojekyll"), "");
    await writeFile(path.join(PAGES, "robots.txt"), "User-agent: *\nDisallow: /\n");
    await writeFile(
      path.join(PAGES, "404.html"),
      `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Cape Avra</title><script>location.replace(location.pathname.split("/").slice(0, 2).join("/") + "/")</script>`,
    );
    console.log(`✓ dist/pages/  ${ROUTES.length} pages (GitHub Pages: / = EN, /el/ = EL)`);

    // 3) Hosted preview: both languages in one page, photos as sibling files
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
    await mkdir(path.join(ART, "video"), { recursive: true });
    for (const [file, buf] of posterCache) {
      await writeFile(path.join(ART, "video", `${file.split(".")[0]}.webp`), buf);
    }
    for (const file of videoFiles) {
      await writeFile(path.join(ART, "video", file), await readFile(path.join(ROOT, "public/video", file)));
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
