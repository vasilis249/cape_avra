import "server-only";
import { loadBookingConfig } from "./config";
import { addDays, addMonths, todayIn } from "./dates";
import { LEAD_RETENTION_MONTHS, purgeOldLeads } from "@/lib/leads/store";
import { sendPreArrivalEmail, sendReviewEmail } from "./emails";
import { readCapped } from "@/lib/http/read-capped";
import { parseICal } from "./ical";
import { getBookingStore, type Reservation } from "./store";
import { paymentDeps } from "@/lib/payments/deps";
import { PaymentsUnavailableError } from "@/lib/payments/provider";
import { cancelAbandoned, chargeBalances, manageSecurityHolds } from "@/lib/payments/service";

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

const MAX_FEED_BYTES = 5 * 1024 * 1024; // a year of bookings is a few KB; anything huge is wrong

export type SyncResult = { source: string; ok: boolean; events?: number; error?: string };

/** Import each feed; a failed or malformed fetch never wipes the existing blocks of that source. */
export async function syncCalendars(): Promise<SyncResult[]> {
  const store = getBookingStore();
  const results: SyncResult[] = [];
  for (const [source, url] of Object.entries(configuredFeeds())) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store", headers: { "User-Agent": "CapeAvra-CalendarSync/1.0" } });
      const text = await readCapped(res, MAX_FEED_BYTES);
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

/** Daily housekeeping: holds, payments (balances, security deposits), pre-arrival and review emails. */
export async function runDaily(now = new Date()) {
  const config = await loadBookingConfig();
  const store = getBookingStore();
  const today = todayIn(config.timeZone, now);
  const expired = await store.expireHolds();

  let payments: Record<string, unknown> = { skipped: "no payment provider" };
  try {
    const deps = await paymentDeps();
    payments = {
      abandonedCancelled: await cancelAbandoned(deps),
      balances: await chargeBalances(deps, today),
      securityDeposits: await manageSecurityHolds(deps, today),
    };
  } catch (e) {
    if (!(e instanceof PaymentsUnavailableError)) throw e;
  }

  const sent = { preArrival: 0, review: 0, failed: 0 };
  const send = async (r: Reservation, kind: "preArrival" | "review", fn: () => Promise<void>) => {
    if (!(await store.claimEmail(r.id, kind))) return; // another run is sending it
    try {
      await fn();
      sent[kind]++;
    } catch (e) {
      sent.failed++;
      await store.releaseEmail(r.id, kind);
      console.error(`[daily] ${kind} email for ${r.ref} failed`, e);
    }
  };
  for (const r of await store.dueForEmail("preArrival", addDays(today, config.emails.preArrivalDaysBefore))) {
    await send(r, "preArrival", () => sendPreArrivalEmail(r, config));
  }
  for (const r of await store.dueForEmail("review", addDays(today, -config.emails.reviewDaysAfter))) {
    await send(r, "review", () => sendReviewEmail(r));
  }
  // data retention (privacy policy): abandoned checkouts after 90 days, requests after 24 months
  const privacy = { abandonedCheckouts: 0, leads: 0 };
  try {
    privacy.abandonedCheckouts = await store.purgeAbandoned(new Date(now.getTime() - 90 * 86_400_000).toISOString());
    privacy.leads = await purgeOldLeads(new Date(addMonths(today, -LEAD_RETENTION_MONTHS) + "T00:00:00Z").toISOString());
  } catch (e) {
    console.error("[daily] retention purge failed", e);
  }
  return { today, expiredHolds: expired, payments, emails: sent, privacy };
}
