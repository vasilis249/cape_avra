"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import A from "@content/messages/admin.el.json";
import { BOOKING_CONFIG_TAG } from "@/lib/booking/config";
import { bookingConfigSchema } from "@/lib/booking/config-schema";
import { isISODate, todayIn } from "@/lib/booking/dates";
import { syncCalendars, type SyncResult } from "@/lib/booking/jobs";
import { getBookingStore } from "@/lib/booking/store";
import { hashToken } from "@/lib/booking/tokens";
import { emailLayout, sendEmail } from "@/lib/email";
import { deleteMedia, MediaUnavailableError, putMedia } from "@/lib/media-storage";
import { paymentDeps } from "@/lib/payments/deps";
import {
  cancelReservation,
  keepSecurityDeposit,
  refundPayment,
  releaseSecurityDeposit,
} from "@/lib/payments/service";
import { rateLimited } from "@/lib/rate-limit";
import { isPhotoSlot, SITE_PHOTOS_TAG } from "@/lib/site-photos";
import { ADMIN_COOKIE, adminBaseUrl, adminConfigured, adminEmails, cookieOptions, encodeSession, LINK_MINUTES, requireAdmin } from "./auth";
import { PhotoTooSmallError, processPhoto } from "./photo-processing";

export type ActionState = { ok?: boolean; error?: string; message?: string; data?: unknown };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));
const euros = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/* ------------------------------------------------------------------ login */

export async function requestLoginLink(_: ActionState, form: FormData): Promise<ActionState> {
  if (!adminConfigured()) return { error: A.login.notConfigured };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { error: A.login.invalidEmail };
  if (rateLimited(`admin-login:${await clientIp()}`, 5, 15 * 60_000) || rateLimited(`admin-login:${email}`, 5, 15 * 60_000)) {
    return { error: A.login.rate };
  }
  // same answer whether or not the address is allowed (no account discovery)
  if (adminEmails().includes(email)) {
    const token = randomBytes(32).toString("base64url");
    await getBookingStore().saveLoginToken(hashToken(token), email, new Date(Date.now() + LINK_MINUTES * 60_000).toISOString());
    const url = `${adminBaseUrl()}/admin/login/verify?token=${token}`;
    const mail = emailLayout(A.login.emailTitle, [], fill(A.login.emailIntro, { minutes: LINK_MINUTES }), {
      cta: { label: A.login.emailCta, url },
      note: A.login.emailNote,
    });
    try {
      await sendEmail({ to: email, subject: A.login.emailSubject, ...mail });
    } catch (e) {
      console.error("[admin] login email failed", e);
      return { error: A.common.error };
    }
  }
  return { ok: true, message: A.login.sent };
}

/** The emailed link opens a page with a button (POST), so mail scanners that follow links can't use it up. */
export async function verifyLogin(_: ActionState, form: FormData): Promise<ActionState> {
  const token = String(form.get("token") ?? "");
  if (token.length < 20 || token.length > 100) return { error: A.login.invalidLink };
  if (rateLimited(`admin-verify:${await clientIp()}`, 10, 15 * 60_000)) return { error: A.login.rate };
  const email = await getBookingStore().consumeLoginToken(hashToken(token));
  if (!email || !adminEmails().includes(email)) return { error: A.login.invalidLink };
  const session = encodeSession(email);
  if (!session) return { error: A.login.notConfigured };
  (await cookies()).set(ADMIN_COOKIE, session, cookieOptions);
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: cookieOptions.path });
  redirect("/admin/login");
}

/* --------------------------------------------------------------- bookings */

async function reservationFrom(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return null;
  return getBookingStore().getById(id);
}

export async function addNote(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const r = await reservationFrom(form);
  const body = String(form.get("body") ?? "").trim();
  if (!r || !body || body.length > 4000) return { error: A.common.error };
  await getBookingStore().addNote(r.id, body);
  refresh();
  return { ok: true };
}

export async function adminCancel(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const r = await reservationFrom(form);
  if (!r) return { error: A.booking.notFound };
  if (form.get("confirm") !== "on") return { error: A.booking.cancelConfirmError };
  const mode = String(form.get("mode") ?? "policy");
  try {
    const deps = await paymentDeps();
    const today = todayIn(deps.config.timeZone);
    let refundCents: number | undefined;
    if (mode === "full") refundCents = Number.MAX_SAFE_INTEGER; // capped to what was paid
    else if (mode === "none") refundCents = 0;
    else if (mode === "custom") {
      refundCents = euros(form.get("amount"));
      if (!Number.isFinite(refundCents) || refundCents < 0) return { error: A.common.error };
    }
    const reason = String(form.get("reason") ?? "").trim().slice(0, 500) || undefined;
    const res = await cancelReservation(deps, r, today, { by: "owner", refundCents, reason });
    if (!res.ok) return { error: A.common.error };
    if (reason) await getBookingStore().addNote(r.id, `Ακύρωση: ${reason}`);
  } catch (e) {
    console.error(`[admin] cancel ${r.ref}`, e);
    return { error: A.common.error };
  }
  refresh();
  return { ok: true, message: A.booking.cancelDone };
}

export async function adminRefund(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const r = await reservationFrom(form);
  if (!r) return { error: A.booking.notFound };
  const cents = euros(form.get("amount"));
  if (!Number.isFinite(cents) || cents <= 0) return { error: A.booking.refundTooMuch };
  try {
    const res = await refundPayment(await paymentDeps(), r, String(form.get("payment") ?? ""), cents);
    if (!res.ok) return { error: res.code === "tooMuch" ? A.booking.refundTooMuch : A.common.error };
  } catch (e) {
    console.error(`[admin] refund ${r.ref}`, e);
    return { error: A.common.error };
  }
  refresh();
  return { ok: true, message: A.booking.refundDone };
}

export async function adminSecurity(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const r = await reservationFrom(form);
  if (!r) return { error: A.booking.notFound };
  const ref = String(form.get("payment") ?? "");
  try {
    const deps = await paymentDeps();
    if (form.get("op") === "release") {
      const res = await releaseSecurityDeposit(deps, r, ref);
      if (!res.ok) return { error: A.common.error };
      refresh();
      return { ok: true, message: A.booking.releaseDone };
    }
    const cents = euros(form.get("amount"));
    if (!Number.isFinite(cents) || cents <= 0) return { error: A.booking.refundTooMuch };
    const res = await keepSecurityDeposit(deps, r, ref, cents);
    if (!res.ok) return { error: res.code === "tooMuch" ? A.booking.refundTooMuch : A.common.error };
  } catch (e) {
    console.error(`[admin] security deposit ${r.ref}`, e);
    return { error: A.common.error };
  }
  refresh();
  return { ok: true, message: A.booking.captureDone };
}

export async function resendConfirmation(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const r = await reservationFrom(form);
  if (!r || r.status !== "confirmed") return { error: A.booking.notFound };
  try {
    const deps = await paymentDeps();
    await deps.notify.confirmed(r, await deps.store.listPayments(r.id));
  } catch (e) {
    console.error(`[admin] resend ${r.ref}`, e);
    return { error: A.common.error };
  }
  return { ok: true, message: A.booking.resent };
}

/* --------------------------------------------------------------- calendar */

export async function addBlock(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const start = String(form.get("start") ?? "");
  const end = String(form.get("end") ?? "");
  if (!isISODate(start) || !isISODate(end) || end <= start) return { error: A.calendar.invalidRange };
  const summary = String(form.get("summary") ?? "").trim().slice(0, 120);
  const res = await getBookingStore().addManualBlock(start, end, summary);
  if (res === "booked") return { error: A.calendar.booked };
  refresh();
  return { ok: true, message: A.calendar.added };
}

export async function removeBlock(form: FormData) {
  await requireAdmin();
  await getBookingStore().removeManualBlock(String(form.get("id") ?? ""));
  refresh();
}

export async function syncNow(): Promise<ActionState> {
  await requireAdmin();
  const results: SyncResult[] = await syncCalendars();
  refresh();
  return { ok: true, data: results };
}

/* ---------------------------------------------------------------- pricing */

export async function savePricing(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("config") ?? ""));
  } catch {
    return { error: A.pricing.invalid };
  }
  const parsed = bookingConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: A.pricing.invalid, data: parsed.error.issues.map((i) => i.path.join(".")) };
  }
  await getBookingStore().saveConfig(parsed.data);
  updateTag(BOOKING_CONFIG_TAG); // legal terms quote the deposit and cancellation tiers
  return { ok: true, message: A.common.saved };
}

export async function resetPricing() {
  await requireAdmin();
  await getBookingStore().saveConfig(null);
  updateTag(BOOKING_CONFIG_TAG);
  refresh();
}

/* ----------------------------------------------------------------- photos */

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function uploadPhoto(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const slot = String(form.get("slot") ?? "");
  if (!isPhotoSlot(slot)) return { error: A.common.error };
  const alt = {
    en: String(form.get("alt_en") ?? "").trim().slice(0, 300),
    el: String(form.get("alt_el") ?? "").trim().slice(0, 300),
  };
  const store = getBookingStore();
  const existing = (await store.listSitePhotos()).find((p) => p.slot === slot) ?? null;
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    // descriptions only
    if (!existing) return { error: A.photos.chooseFile };
    await store.saveSitePhoto({ ...existing, alt });
    updateTag(SITE_PHOTOS_TAG);
    refresh();
    return { ok: true, message: A.common.saved };
  }
  if (!ALLOWED.has(file.type) || file.size > 4 * 1024 * 1024) return { error: A.photos.badType };

  try {
    const p = await processPhoto(Buffer.from(await file.arrayBuffer()));
    const path = `site/${slot}-${p.hash}.jpg`;
    await putMedia(path, p.data);
    await store.saveSitePhoto({ slot, path, width: p.width, height: p.height, blur: p.blur, color: p.color, alt, focal: existing?.focal ?? null });
    if (existing && existing.path !== path) await deleteMedia(existing.path).catch(() => {});
  } catch (e) {
    if (e instanceof PhotoTooSmallError) return { error: fill(A.photos.tooSmall, { min: 1200 }) };
    if (e instanceof MediaUnavailableError) return { error: A.photos.storageUnavailable };
    console.error(`[admin] photo upload ${slot}`, e);
    return { error: A.photos.badType };
  }
  updateTag(SITE_PHOTOS_TAG);
  refresh();
  return { ok: true, message: A.photos.done };
}

export async function restorePhoto(form: FormData) {
  await requireAdmin();
  const slot = String(form.get("slot") ?? "");
  if (!isPhotoSlot(slot)) return;
  const removed = await getBookingStore().deleteSitePhoto(slot);
  if (removed) await deleteMedia(removed.path).catch(() => {});
  updateTag(SITE_PHOTOS_TAG);
  refresh();
}
