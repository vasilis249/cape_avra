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
