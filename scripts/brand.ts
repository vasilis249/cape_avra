/**
 * Generates the Cape Avra wordmark + "CA" monogram as outlined SVG paths
 * (no dependency on web-font loading) from Noto Serif Display (SIL OFL).
 *
 *   npm run brand
 *
 * Outputs
 *  - src/components/brand/brand-paths.ts  (path data used by <Wordmark>/<Monogram>)
 *  - public/brand/*.svg                   (standalone logo files)
 *  - public/brand/avatar-*.png            (Instagram / social avatar, 1080px)
 *  - src/app/icon.svg, src/app/apple-icon.png  (favicon + touch icon)
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import opentype from "opentype.js";
import sharp from "sharp";

const ROOT = process.cwd();
const FONT_DIR = path.join(ROOT, "node_modules/@fontsource/noto-serif-display/files");

const COLORS = {
  ink: "#1D2220",
  salt: "#F6F2EA",
  ionian: "#1F4D55",
  night: "#1B2433",
};

function loadFont(weight: 300 | 400 | 500) {
  const b = readFileSync(path.join(FONT_DIR, `noto-serif-display-latin-${weight}-normal.woff`));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

const r = (n: number) => Math.round(n * 100) / 100;

/** Serialise an opentype path ourselves: its built-in rounding emits NaN for some values. */
function toD(p: opentype.Path): string {
  return p.commands
    .map((c) => {
      switch (c.type) {
        case "M":
        case "L":
          return `${c.type}${r(c.x)} ${r(c.y)}`;
        case "Q":
          return `Q${r(c.x1)} ${r(c.y1)} ${r(c.x)} ${r(c.y)}`;
        case "C":
          return `C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`;
        case "Z":
          return "Z";
      }
    })
    .join("");
}

/* ---------------------------------------------------------------- wordmark */

const WORD = "CAPE AVRA";
const WM_SIZE = 100; // font size in SVG units
const TRACKING = 0.34; // em, generous letter-spacing

function buildWordmark() {
  const font = loadFont(400);
  const scale = WM_SIZE / font.unitsPerEm;
  const capHeight = font.charToGlyph("A").getBoundingBox().y2 * scale;
  const letters: { char: string; d: string; x: number }[] = [];
  let x = 0;
  const glyphs = font.stringToGlyphs(WORD);
  glyphs.forEach((g, i) => {
    const char = WORD[i];
    if (char !== " ") {
      // draw at x=0 then translate in markup → letters can animate independently
      const p = g.getPath(0, capHeight, WM_SIZE);
      letters.push({ char, d: toD(p), x: r(x) });
    }
    const next = glyphs[i + 1];
    const kern = next ? font.getKerningValue(g, next) * scale : 0;
    x += (g.advanceWidth ?? 0) * scale + kern;
    if (next) x += TRACKING * WM_SIZE;
  });
  // trim right side bearing of the last glyph
  const last = glyphs[glyphs.length - 1];
  const lastBox = last.getBoundingBox();
  const width = r(letters[letters.length - 1].x + lastBox.x2 * scale);
  return { letters, width, height: r(capHeight) };
}

/* ---------------------------------------------------------------- monogram */

function buildMonogram() {
  const font = loadFont(400);
  const size = 104;
  const scale = size / font.unitsPerEm;
  const capHeight = font.charToGlyph("A").getBoundingBox().y2 * scale;
  const C = font.charToGlyph("C");
  const A = font.charToGlyph("A");
  const cBox = C.getBoundingBox();
  const aBox = A.getBoundingBox();
  const overlap = 0.14 * (cBox.x2 - cBox.x1) * scale; // A tucks into the C's opening
  const cWidth = (cBox.x2 - cBox.x1) * scale;
  const aWidth = (aBox.x2 - aBox.x1) * scale;
  const total = cWidth + aWidth - overlap;
  const startX = 100 - total / 2;
  const baseline = 100 + capHeight / 2;
  const cPath = toD(C.getPath(startX - cBox.x1 * scale, baseline, size));
  const aPath = toD(A.getPath(startX + cWidth - overlap - aBox.x1 * scale, baseline, size));
  return { c: cPath, a: aPath, viewBox: "0 0 200 200", ring: { cx: 100, cy: 100, r: 96 } };
}

/* ------------------------------------------------------------------ output */

function wordmarkSvg(wm: ReturnType<typeof buildWordmark>, fill: string) {
  const g = wm.letters
    .map((l) => `<path transform="translate(${l.x} 0)" d="${l.d}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wm.width} ${wm.height}" role="img" aria-label="Cape Avra"><title>Cape Avra</title><g fill="${fill}">${g}</g></svg>\n`;
}

function monogramSvg(
  m: ReturnType<typeof buildMonogram>,
  opts: { fg: string; bg?: string; ring?: boolean; ringWidth?: number },
) {
  const bg = opts.bg ? `<rect width="200" height="200" fill="${opts.bg}"/>` : "";
  const ring = opts.ring
    ? `<circle cx="${m.ring.cx}" cy="${m.ring.cy}" r="${m.ring.r - (opts.ringWidth ?? 2) / 2}" fill="none" stroke="${opts.fg}" stroke-width="${opts.ringWidth ?? 2}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m.viewBox}" role="img" aria-label="Cape Avra"><title>Cape Avra</title>${bg}${ring}<g fill="${opts.fg}"><path d="${m.c}"/><path d="${m.a}"/></g></svg>\n`;
}

/** Favicon: solid Ionian disc, salt letters (legible at 16px). */
function faviconSvg(m: ReturnType<typeof buildMonogram>) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="100" fill="${COLORS.ionian}"/><g fill="${COLORS.salt}" transform="translate(100 100) scale(1.12) translate(-100 -100)"><path d="${m.c}"/><path d="${m.a}"/></g></svg>\n`;
}

async function main() {
  const wm = buildWordmark();
  const mono = buildMonogram();

  await mkdir(path.join(ROOT, "public/brand"), { recursive: true });
  const out = (p: string, s: string | Buffer) => writeFile(path.join(ROOT, p), s);

  await out(
    "src/components/brand/brand-paths.ts",
    `// Generated by scripts/brand.ts — do not edit by hand.\n` +
      `export const wordmark = ${JSON.stringify(wm, null, 2)} as const;\n\n` +
      `export const monogram = ${JSON.stringify(mono, null, 2)} as const;\n`,
  );

  await out("public/brand/wordmark.svg", wordmarkSvg(wm, COLORS.ink));
  await out("public/brand/wordmark-ionian.svg", wordmarkSvg(wm, COLORS.ionian));
  await out("public/brand/wordmark-salt.svg", wordmarkSvg(wm, COLORS.salt));
  await out("public/brand/monogram.svg", monogramSvg(mono, { fg: COLORS.ionian, ring: true }));
  await out("public/brand/monogram-salt.svg", monogramSvg(mono, { fg: COLORS.salt, ring: true }));

  const favicon = faviconSvg(mono);
  await out("src/app/icon.svg", favicon);
  await out("src/app/apple-icon.png", await sharp(Buffer.from(
    monogramSvg(mono, { fg: COLORS.salt, bg: COLORS.ionian, ring: false }),
  )).resize(180, 180).png().toBuffer());

  // Social avatars (Instagram crops to a circle, so keep generous margins)
  const avatar = (fg: string, bg: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/><g transform="translate(100 100) scale(0.62) translate(-100 -100)"><circle cx="100" cy="100" r="95" fill="none" stroke="${fg}" stroke-width="2.4"/><g fill="${fg}"><path d="${mono.c}"/><path d="${mono.a}"/></g></g></svg>`;
  await out("public/brand/avatar-1080-ionian.png", await sharp(Buffer.from(avatar(COLORS.salt, COLORS.ionian))).resize(1080, 1080).png().toBuffer());
  await out("public/brand/avatar-1080-salt.png", await sharp(Buffer.from(avatar(COLORS.ionian, COLORS.salt))).resize(1080, 1080).png().toBuffer());

  console.log(`✓ wordmark ${wm.width}×${wm.height}, monogram, favicon, avatars`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
