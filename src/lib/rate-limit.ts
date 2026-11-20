import "server-only";

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
  if (hits.size > 5000) hits.clear();
  return recent.length > max;
}
