import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

export const MIN_WIDTH = 1200;
const MAX_WIDTH = 2400;

export class PhotoTooSmallError extends Error {}

/**
 * Normalise an uploaded photo: apply EXIF orientation, cap the size, re-encode as JPEG.
 * Re-encoding drops all metadata (EXIF, GPS, camera serials). Also returns the blur placeholder,
 * the dominant colour and a content hash for the file name.
 */
export async function processPhoto(input: Buffer) {
  const img = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
  const meta = await img.metadata();
  const width = meta.autoOrient?.width ?? meta.width ?? 0;
  if (width < MIN_WIDTH) throw new PhotoTooSmallError(String(width));
  const jpeg = await img
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .toColourspace("srgb")
    .jpeg({ quality: 82, mozjpeg: true, progressive: true })
    .toBuffer({ resolveWithObject: true });
  const blur = await sharp(jpeg.data).resize(16).webp({ quality: 40 }).toBuffer();
  const { dominant } = await sharp(jpeg.data).stats();
  const color = `#${[dominant.r, dominant.g, dominant.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  return {
    data: jpeg.data,
    width: jpeg.info.width,
    height: jpeg.info.height,
    blur: `data:image/webp;base64,${blur.toString("base64")}`,
    color,
    hash: createHash("sha256").update(jpeg.data).digest("hex").slice(0, 12),
  };
}
