import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Storage for photos uploaded in the admin: Supabase Storage (private bucket, server-side access
 * with the service-role key) or, locally, .data/media. Files are served by /media/[...path].
 */
export class MediaUnavailableError extends Error {}

const SAFE = /^site\/[a-z0-9-]{1,80}-[a-f0-9]{12}\.jpg$/;
export const isSafeMediaPath = (p: string) => SAFE.test(p);

function supabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_MEDIA_BUCKET ?? "site-media";
  return url && key ? { url, key, bucket } : null;
}
const localDir = () => path.join(process.cwd(), ".data/media");

export const mediaAvailable = () => !!supabase() || !process.env.VERCEL;

export async function putMedia(p: string, body: Buffer, contentType = "image/jpeg") {
  if (!isSafeMediaPath(p)) throw new Error(`unsafe media path ${p}`);
  const s = supabase();
  if (s) {
    const res = await fetch(`${s.url}/storage/v1/object/${s.bucket}/${p}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.key}`, apikey: s.key, "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "31536000" },
      body: new Uint8Array(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);
    return;
  }
  if (process.env.VERCEL) throw new MediaUnavailableError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  const file = path.join(localDir(), p);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function getMedia(p: string): Promise<Buffer | null> {
  if (!isSafeMediaPath(p)) return null;
  const s = supabase();
  if (s) {
    const res = await fetch(`${s.url}/storage/v1/object/${s.bucket}/${p}`, {
      headers: { Authorization: `Bearer ${s.key}`, apikey: s.key },
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`Storage download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  try {
    return await readFile(path.join(localDir(), p));
  } catch {
    return null;
  }
}

export async function deleteMedia(p: string) {
  if (!isSafeMediaPath(p)) return;
  const s = supabase();
  if (s) {
    await fetch(`${s.url}/storage/v1/object/${s.bucket}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${s.key}`, apikey: s.key, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [p] }),
      cache: "no-store",
    });
    return;
  }
  await rm(path.join(localDir(), p), { force: true });
}
