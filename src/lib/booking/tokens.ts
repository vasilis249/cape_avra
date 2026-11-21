import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L: easy to read out on the phone

/** Human-friendly booking reference, e.g. CA-7KQ2-M9 */
export function newRef(): string {
  const pick = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `CA-${pick(4)}-${pick(2)}`;
}

/** Secret for the guest's private links (checkout, confirmation). Only its hash is stored. */
export const newToken = () => randomBytes(24).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Token for the guest's "manage booking" link in emails that are sent later (balance, cancellation…),
 * when the original random token is no longer known. HMAC of the reference with BOOKING_LINK_SECRET.
 */
function linkSecret(): string | null {
  const s = process.env.BOOKING_LINK_SECRET;
  if (s && s.length >= 32) return s;
  return process.env.VERCEL_ENV === "production" ? null : "dev-only-booking-link-secret-not-for-production";
}

export function manageToken(ref: string): string | null {
  const secret = linkSecret();
  return secret ? createHmac("sha256", secret).update(`manage:${ref}`).digest("base64url").slice(0, 32) : null;
}

/** the original checkout token or the manage token */
export function canAccess(ref: string, token: string, hash: string): boolean {
  if (!token) return false;
  if (tokenMatches(token, hash)) return true;
  const m = manageToken(ref);
  if (!m || m.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(m), Buffer.from(token));
}
