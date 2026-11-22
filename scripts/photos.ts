/**
 * Generates web-ready masters from the untouched originals in /photos/raw.
 *
 *   npm run photos
 *
 * For each entry in content/photos.ts:
 *  - auto-orients, applies optional rotate + crop
 *  - resizes to at most MAX_WIDTH (never upscales)
 *  - writes a progressive mozjpeg master with ALL metadata stripped (no GPS)
 *    to public/photos/<id>.<hash>.jpg (content-hashed → cache forever)
 *  - computes a tiny blur placeholder and an average colour
 * and writes src/generated/photos.json for <Photo>.
 *
 * next/image then serves AVIF/WebP at responsive sizes from these masters.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { photos } from "../content/photos";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "photos/raw");
const OUT_DIR = path.join(ROOT, "public/photos");
const MANIFEST = path.join(ROOT, "src/generated/photos.json");
const MAX_WIDTH = 2400;

type ManifestEntry = {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
  color: string;
};

async function processOne(entry: (typeof photos)[number]): Promise<ManifestEntry> {
  const input = path.join(RAW_DIR, entry.file);

  // 1. orient (+ rotate) into a buffer so crop fractions refer to what we see
  let pipeline = sharp(input).rotate();
  if ("rotate" in entry && entry.rotate) {
    pipeline = sharp(await pipeline.toBuffer()).rotate(entry.rotate, {
      background: "#000000",
    });
  }
  let buffer = await pipeline.toBuffer();
  const meta = await sharp(buffer).metadata();
  const W = meta.width!;
  const H = meta.height!;

  if ("crop" in entry && entry.crop) {
    const c = entry.crop;
    buffer = await sharp(buffer)
      .extract({
        left: Math.round(c.x * W),
        top: Math.round(c.y * H),
        width: Math.round(c.w * W),
        height: Math.round(c.h * H),
      })
      .toBuffer();
  }

  if ("grade" in entry && entry.grade) buffer = await applyGrade(buffer, entry.grade);

  const master = await sharp(buffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true, progressive: true })
    .toBuffer(); // sharp drops EXIF/GPS unless withMetadata() is called

  const { width, height } = await sharp(master).metadata();
  const hash = createHash("sha256").update(master).digest("hex").slice(0, 8);
  const fileName = `${entry.id}.${hash}.jpg`;
  await writeFile(path.join(OUT_DIR, fileName), master);

  const blur = await sharp(master).resize(16).webp({ quality: 40 }).toBuffer();
  const { dominant } = await sharp(master).stats();
  const color = `#${[dominant.r, dominant.g, dominant.b]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;

  return {
    src: `/photos/${fileName}`,
    width: width!,
    height: height!,
    blurDataURL: `data:image/webp;base64,${blur.toString("base64")}`,
    color,
  };
}

type Grade = { brightness?: number; saturation?: number; contrast?: number; warmth?: number; highlights?: number };

/**
 * Restrained "editorial" grade for harsh phone photos: roll off blown midday highlights into a
 * creamy white, a touch of contrast, calmer saturation, slight warmth. Each step re-encodes
 * losslessly (PNG) so the next one starts from plain pixels.
 */
async function applyGrade(input: Buffer, g: Grade): Promise<Buffer<ArrayBuffer>> {
  let buf = await sharp(input).png().toBuffer();
  if (g.highlights) {
    // shoulder above 60%: y = t + (x − t)·(1 − k·(x − t)/(1 − t)); pure white lands at 1 − k·0.4
    const t = 0.6;
    const k = g.highlights;
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      const y = x <= t ? x : t + (x - t) * (1 - (k * (x - t)) / (1 - t));
      lut[i] = Math.round(y * 255);
    }
    const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i++) data[i] = lut[data[i]];
    buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
  }
  if (g.contrast && g.contrast !== 1) buf = await sharp(buf).linear(g.contrast, 128 * (1 - g.contrast)).png().toBuffer();
  if ((g.brightness ?? 1) !== 1 || (g.saturation ?? 1) !== 1) {
    buf = await sharp(buf).modulate({ brightness: g.brightness ?? 1, saturation: g.saturation ?? 1 }).png().toBuffer();
  }
  if (g.warmth) {
    const w = g.warmth;
    buf = await sharp(buf).recomb([[1 + w, 0, 0], [0, 1 + w * 0.3, 0], [0, 0, 1 - w]]).png().toBuffer();
  }
  return buf;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  // remove previous generated masters (keeps the folder clean of stale hashes)
  for (const f of await readdir(OUT_DIR)) {
    if (f.endsWith(".jpg")) await rm(path.join(OUT_DIR, f));
  }

  const manifest: Record<string, ManifestEntry> = {};
  for (const entry of photos) {
    manifest[entry.id] = await processOne(entry);
    const m = manifest[entry.id];
    console.log(`✓ ${entry.id.padEnd(24)} ${m.width}×${m.height}  ${m.src}`);
  }
  await mkdir(path.dirname(MANIFEST), { recursive: true });
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nWrote ${Object.keys(manifest).length} photos → ${path.relative(ROOT, MANIFEST)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
