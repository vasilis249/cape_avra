import "server-only";
import { loadBookingConfig } from "./config";
import { addDays, todayIn } from "./dates";
import { sendPreArrivalEmail, sendReviewEmail } from "./emails";
import { parseICal } from "./ical";
import { getBookingStore } from "./store";

/**
 * External calendars to import, from env ICAL_FEEDS, e.g.
 * {"airbnb":"https://www.airbnb.com/calendar/ical/123.ics?s=…","booking":"https://ical.booking.com/v1/export?t=…"}
 * (these URLs contain secrets: keep them in env, not in the repo)
 */
export function configuredFeeds(): Record<string, string> {
  try {
    const raw = JSON.parse(process.env.ICAL_FEEDS ?? "{}");
    const allowed = (v: unknown) =>
      typeof v === "string" &&
      (v.startsWith("https://") || (process.env.VERCEL_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(v)));
    return Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^[a-z0-9-]+$/.test(k) && k !== "manual" && allowed(v))) as Record<string, string>;
  } catch {
    console.error("[ical] ICAL_FEEDS is not valid JSON");
    return {};
  }
}

export type SyncResult = { source: string; ok: boolean; events?: number; error?: string };

/** Import each feed; a failed or malformed fetch never wipes the existing blocks of that source. */
export async function syncCalendars(): Promise<SyncResult[]> {
  const store = getBookingStore();
  const results: SyncResult[] = [];
  for (const [source, url] of Object.entries(configuredFeeds())) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store", headers: { "User-Agent": "CapeAvra-CalendarSync/1.0" } });
      const text = await res.text();
      if (!res.ok || !text.includes("BEGIN:VCALENDAR")) throw new Error(`HTTP ${res.status}, not a calendar`);
      const events = parseICal(text);
      await store.replaceBlocks(source, events);
      results.push({ source, ok: true, events: events.length });
    } catch (e) {
      console.error(`[ical] ${source} sync failed`, e);
      results.push({ source, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

/** Daily housekeeping: release expired holds, pre-arrival and review emails. */
export async function runDaily(now = new Date()) {
  const config = await loadBookingConfig();
  const store = getBookingStore();
  const today = todayIn(config.timeZone, now);
  const expired = await store.expireHolds();

  const sent = { preArrival: 0, review: 0, failed: 0 };
  for (const r of await store.dueForEmail("preArrival", addDays(today, config.emails.preArrivalDaysBefore))) {
    try {
      await sendPreArrivalEmail(r, config);
      await store.markEmailSent(r.id, "preArrival");
      sent.preArrival++;
    } catch (e) {
      sent.failed++;
      console.error(`[daily] pre-arrival email for ${r.ref} failed`, e);
    }
  }
  for (const r of await store.dueForEmail("review", addDays(today, -config.emails.reviewDaysAfter))) {
    try {
      await sendReviewEmail(r);
      await store.markEmailSent(r.id, "review");
      sent.review++;
    } catch (e) {
      sent.failed++;
      console.error(`[daily] review email for ${r.ref} failed`, e);
    }
  }
  return { today, expiredHolds: expired, emails: sent };
}
