import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { siteConfig } from "@content/site.config";

/**
 * Owner-only admin sign-in: a single-use link sent by email (no passwords to leak or forget),
 * then a signed, httpOnly session cookie. Only addresses in ADMIN_EMAIL can sign in.
 */
export const ADMIN_COOKIE = "ca_admin";
export const SESSION_DAYS = 14;
export const LINK_MINUTES = 15;

const isProduction = () => process.env.VERCEL_ENV === "production";

/** allowed admin addresses (lower case); outside production defaults to the site's contact email */
export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAIL ?? (isProduction() ? "" : siteConfig.contact.email);
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function secret(): string | null {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (s && s.length >= 32) return s;
  return isProduction() || process.env.VERCEL ? null : "dev-only-admin-session-secret-not-for-production";
}

export const adminConfigured = () => secret() !== null && adminEmails().length > 0;

type Session = { email: string; exp: number };
const sign = (data: string, key: string) => createHmac("sha256", key).update(data).digest("base64url");

export function encodeSession(email: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const data = Buffer.from(JSON.stringify({ email, exp: now + SESSION_DAYS * 86_400_000 } satisfies Session)).toString("base64url");
  return `${data}.${sign(data, key)}`;
}

export function decodeSession(value: string | undefined, now = Date.now()): Session | null {
  const key = secret();
  if (!key || !value) return null;
  const [data, mac] = value.split(".");
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(data, key));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, "base64url").toString()) as Session;
    if (typeof s.email !== "string" || typeof s.exp !== "number" || s.exp < now) return null;
    // removing an address from ADMIN_EMAIL revokes its sessions
    return adminEmails().includes(s.email.toLowerCase()) ? s : null;
  } catch {
    return null;
  }
}

export async function getAdmin(): Promise<{ email: string } | null> {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  await connection(); // session expiry compares with the current time: request-time only
  const s = decodeSession(value);
  return s ? { email: s.email } : null;
}

/** Call at the top of every admin page, server action and route handler. */
export async function requireAdmin(): Promise<{ email: string }> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  // Lax: the cookie must survive arriving from the email link; server actions are also Origin-checked
  sameSite: "lax" as const,
  path: "/admin",
  maxAge: SESSION_DAYS * 86_400,
};

/** Base URL for links in admin emails. Never taken from the request's Host header. */
export function adminBaseUrl(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (!process.env.VERCEL) return (process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://capeavra.com").replace(/\/$/, "");
}
