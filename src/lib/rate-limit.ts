import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort in-memory rate limit (per server instance). Good enough to stop
 * casual form abuse; swap for a shared store (e.g. Upstash) if spam appears.
 */
const hits = new Map<string, number[]>();

export function rateLimited(key: string, max = 5, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  // bounded memory: drop the oldest keys (Map keeps insertion order) instead of resetting every limit
  if (hits.size > 5000) for (const k of [...hits.keys()].slice(0, 1000)) hits.delete(k);
  return recent.length > max;
}

/**
 * Client IP for rate limiting. On Vercel, x-forwarded-for / x-real-ip are set by the platform
 * (not by the client); elsewhere they can be spoofed, so put the app behind a proxy that sets them.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
