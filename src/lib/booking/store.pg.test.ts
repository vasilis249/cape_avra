/**
 * Integration tests for the Postgres booking store. Run against a disposable database
 * with both migrations applied:
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5499/postgres npm test
 * Skipped when TEST_DATABASE_URL is not set.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookingSeed } from "@content/booking";
import { quoteStay } from "./pricing";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("PostgresStore (integration)", () => {
  let sql: postgres.Sql;
  let store: import("./store").BookingStore;
  const quote = (checkIn: string, checkOut: string) => quoteStay(bookingSeed, { checkIn, checkOut, guests: 2 });
  const hold = (ref: string, checkIn: string, checkOut: string, holdMinutes = 15) =>
    store.createHold({ ref, tokenHash: "h", checkIn, checkOut, guests: 2, locale: "en", quote: quote(checkIn, checkOut), holdMinutes });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    sql = postgres(url!, { max: 1 });
    await sql`truncate reservations, calendar_blocks, payments, payment_events, reservation_notes, admin_login_tokens, site_photos, booking_config cascade`;
    store = (await import("./store")).getBookingStore();
  });
  afterAll(async () => {
    await sql`truncate reservations, calendar_blocks, payments, payment_events, reservation_notes, admin_login_tokens, site_photos, booking_config cascade`;
    await sql.end();
  });

  it("holds dates, refuses overlaps, allows turnover", async () => {
    expect((await hold("CA-TEST-01", "2027-06-15", "2027-06-20"))?.status).toBe("hold");
    expect(await hold("CA-TEST-02", "2027-06-18", "2027-06-23")).toBeNull();
    expect((await hold("CA-TEST-03", "2027-06-20", "2027-06-25"))?.status).toBe("hold");
  });

  it("confirms a paid hold (idempotently), and confirmed stays block the calendar", async () => {
    const r = await store.getByRef("CA-TEST-01");
    await store.saveGuest(r!.id, { name: "A", email: "a@example.com" }, 20);
    expect((await store.confirmPaid(r!.id))?.status).toBe("confirmed");
    expect((await store.confirmPaid(r!.id))?.status).toBe("confirmed");
    const ranges = await store.blockedRanges("2027-06-01", "2027-07-01");
    expect(ranges.map((x) => `${x.start}/${x.end}`).sort()).toEqual(["2027-06-15/2027-06-20", "2027-06-20/2027-06-25"]);
  });

  it("releases expired holds so the dates can be booked again", async () => {
    await sql`update reservations set expires_at = now() - interval '1 second' where ref = 'CA-TEST-03'`;
    expect((await hold("CA-TEST-04", "2027-06-21", "2027-06-26"))?.status).toBe("hold");
    expect((await store.getByRef("CA-TEST-03"))?.status).toBe("expired");
  });

  it("imports iCal blocks, refuses holds on them, and never re-exports them", async () => {
    await store.replaceBlocks("airbnb", [{ uid: "x@airbnb", start: "2027-07-05", end: "2027-07-09", summary: "Reserved" }]);
    expect(await hold("CA-TEST-05", "2027-07-08", "2027-07-12")).toBeNull();
    await store.replaceBlocks("airbnb", []); // the feed no longer lists it
    expect((await hold("CA-TEST-06", "2027-07-08", "2027-07-12"))?.status).toBe("hold");
    const exported = await store.exportEvents();
    expect(exported.map((e) => e.uid)).toEqual(["res-CA-TEST-01@capeavra.com"]);
  });

  it("lists stays due for emails exactly once", async () => {
    const due = await store.dueForEmail("preArrival", "2027-06-15");
    expect(due.map((r) => r.ref)).toEqual(["CA-TEST-01"]);
    await store.markEmailSent(due[0].id, "preArrival");
    expect(await store.dueForEmail("preArrival", "2027-06-15")).toEqual([]);
  });

  it("late payment: confirms an expired hold only if the dates are still free", async () => {
    const free = await hold("CA-LATE-01", "2027-09-01", "2027-09-05");
    await sql`update reservations set expires_at = now() - interval '1 second' where id = ${free!.id}`;
    await store.expireHolds();
    expect((await store.confirmPaid(free!.id))?.status).toBe("confirmed");

    const lost = await hold("CA-LATE-02", "2027-09-10", "2027-09-15");
    await sql`update reservations set expires_at = now() - interval '1 second' where id = ${lost!.id}`;
    expect((await hold("CA-LATE-03", "2027-09-12", "2027-09-14"))?.status).toBe("hold");
    expect(await store.confirmPaid(lost!.id)).toBeNull();
  });

  it("records payments with atomic transitions and one live balance per stay", async () => {
    const r = (await store.getByRef("CA-LATE-01"))!;
    await store.createPayment({ reservationId: r.id, kind: "deposit", provider: "test", providerRef: "pi_1", amountCents: 1000, currency: "EUR", status: "pending" });
    expect((await store.transitionPayment("pi_1", ["pending"], { status: "succeeded" }))?.status).toBe("succeeded");
    expect(await store.transitionPayment("pi_1", ["pending"], { status: "succeeded" })).toBeNull();
    await store.createPayment({ reservationId: r.id, kind: "balance", provider: "test", providerRef: "pi_2", amountCents: 2000, currency: "EUR", status: "pending" });
    await expect(
      store.createPayment({ reservationId: r.id, kind: "balance", provider: "test", providerRef: "pi_3", amountCents: 2000, currency: "EUR", status: "pending" }),
    ).rejects.toThrow();
    await store.updatePayment("pi_1", { refundedCents: 400 });
    expect((await store.listPayments(r.id)).map((p) => [p.providerRef, p.status, p.refundedCents])).toEqual([
      ["pi_1", "succeeded", 400],
      ["pi_2", "pending", 0],
    ]);
    await expect(store.updatePayment("pi_1", { refundedCents: 5000 })).rejects.toThrow(); // more than paid
  });

  it("deduplicates webhook events and claims emails once", async () => {
    expect(await store.recordEvent("evt_1", "stripe", "payment_intent.succeeded")).toBe(true);
    expect(await store.recordEvent("evt_1", "stripe", "payment_intent.succeeded")).toBe(true); // not processed yet: retry allowed
    await store.markEventProcessed("evt_1");
    expect(await store.recordEvent("evt_1", "stripe", "payment_intent.succeeded")).toBe(false);
    const r = (await store.getByRef("CA-LATE-01"))!;
    const claims = await Promise.all([store.claimEmail(r.id, "confirmation"), store.claimEmail(r.id, "confirmation")]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("finds balances due and security deposits to place and release", async () => {
    const r = (await store.getByRef("CA-LATE-01"))!; // 2027-09-01 → 05, has a pending balance
    await sql`update reservations set balance_due_date = '2027-08-02', payment_method_id = 'pm_1', provider_customer_id = 'cus_1' where id = ${r.id}`;
    expect(await store.balancesDue("2027-08-02")).toEqual([]); // pending balance exists
    await store.updatePayment("pi_2", { status: "failed" });
    expect(await store.balancesDue("2027-08-02")).toEqual([]); // failed: guest pays from the manage page
    await sql`delete from payments where provider_ref = 'pi_2'`;
    expect((await store.balancesDue("2027-08-02")).map((x) => x.ref)).toEqual(["CA-LATE-01"]);
    expect(await store.balancesDue("2027-08-01")).toEqual([]);

    expect(await store.securityHoldsToPlace("2027-08-31", 2)).toEqual([]);
    expect((await store.securityHoldsToPlace("2027-09-01", 2)).map((x) => x.ref)).toEqual(["CA-LATE-01"]);
    await store.createPayment({ reservationId: r.id, kind: "security_deposit", provider: "test", providerRef: "pi_sec", amountCents: 50000, currency: "EUR", status: "authorized" });
    expect(await store.securityHoldsToPlace("2027-09-03", 2)).toEqual([]);
    expect(await store.securityHoldsToRelease("2027-09-06", 2)).toEqual([]);
    expect((await store.securityHoldsToRelease("2027-09-07", 2)).map((p) => p.providerRef)).toEqual(["pi_sec"]);
    await store.updatePayment("pi_sec", { status: "canceled" }); // lapsed after 7 days → re-placed while in the window
    expect((await store.securityHoldsToPlace("2027-09-04", 2)).map((x) => x.ref)).toEqual(["CA-LATE-01"]);
  });

  it("admin: manual blocks, single-use login tokens, config, notes, photos, lists", async () => {
    const r = (await store.getByRef("CA-LATE-01"))!; // confirmed 2027-09-01 → 05
    expect(await store.addManualBlock("2027-09-04", "2027-09-07", "x")).toBe("booked");
    const b = await store.addManualBlock("2027-09-05", "2027-09-07", "family");
    expect(b).toMatchObject({ source: "manual", start: "2027-09-05", end: "2027-09-07", summary: "family" });
    expect((await store.exportEvents()).some((e) => e.start === "2027-09-05")).toBe(true);
    expect(await store.removeManualBlock((b as { id: string }).id)).toBe(true);
    expect(await store.removeManualBlock((b as { id: string }).id)).toBe(false);

    await store.saveLoginToken("h1", "o@example.com", new Date(Date.now() + 60_000).toISOString());
    const twice = await Promise.all([store.consumeLoginToken("h1"), store.consumeLoginToken("h1")]);
    expect(twice.filter(Boolean)).toEqual(["o@example.com"]);
    await store.saveLoginToken("h2", "o@example.com", new Date(Date.now() - 1000).toISOString());
    expect(await store.consumeLoginToken("h2")).toBeNull();

    await store.saveConfig({ a: 1 });
    await store.saveConfig({ a: 2 });
    expect(await store.loadConfig()).toEqual({ a: 2 });
    await store.saveConfig(null);
    expect(await store.loadConfig()).toBeNull();

    await store.addNote(r.id, "first");
    await store.addNote(r.id, "second");
    expect((await store.listNotes(r.id)).map((n) => n.body)).toEqual(["first", "second"]);

    const photo = { slot: "space-living", path: "site/space-living-0123456789ab.jpg", width: 10, height: 5, blur: "b", color: "#fff", alt: { en: "e", el: "ε" }, focal: null };
    await store.saveSitePhoto(photo);
    await store.saveSitePhoto({ ...photo, width: 20 });
    expect((await store.listSitePhotos()).map((p) => [p.slot, p.width])).toEqual([["space-living", 20]]);
    expect((await store.deleteSitePhoto("space-living"))?.slot).toBe("space-living");
    expect(await store.deleteSitePhoto("space-living")).toBeNull();

    expect((await store.listReservations({ scope: "upcoming", today: "2026-11-21" })).map((x) => x.ref)).toContain("CA-LATE-01");
    expect(await store.listReservations({ scope: "past", today: "2026-11-21" })).toEqual([]);
    expect((await store.listReservations({ scope: "all", today: "2026-11-21", q: "late-01" })).map((x) => x.ref)).toEqual(["CA-LATE-01"]);
    expect(await store.listReservations({ scope: "all", today: "2026-11-21", q: "%" })).toEqual([]); // LIKE wildcards are literal
    expect((await store.allPayments()).length).toBeGreaterThan(0);
  });

  it("retention: deletes only never-paid expired reservations older than the cut-off", async () => {
    const old = await hold("CA-GDPR-01", "2028-05-10", "2028-05-15");
    const paid = await hold("CA-GDPR-02", "2028-05-20", "2028-05-25");
    await store.createPayment({ reservationId: paid!.id, kind: "deposit", provider: "test", providerRef: "pi_gdpr", amountCents: 1, currency: "EUR", status: "failed" });
    await sql`update reservations set status = 'expired', created_at = now() - interval '100 days' where ref in ('CA-GDPR-01', 'CA-GDPR-02')`;
    expect(await store.purgeAbandoned(new Date(Date.now() - 90 * 86_400_000).toISOString())).toBe(1);
    expect(await store.getById(old!.id)).toBeNull();
    expect(await store.getById(paid!.id)).not.toBeNull();
  });

  it("owner holds: listed as pending, extendable while active", async () => {
    const r = await hold("CA-OWNR-01", "2028-06-01", "2028-06-05", 60 * 48);
    expect((await store.listReservations({ scope: "pending", today: "2026-11-21" })).map((x) => x.ref)).toContain("CA-OWNR-01");
    const until = new Date(Date.now() + 72 * 3_600_000).toISOString();
    expect((await store.extendHold(r!.id, until))?.expiresAt).toBe(until);
    await store.releaseHold(r!.id);
    expect(await store.extendHold(r!.id, until)).toBeNull();
    expect((await store.listReservations({ scope: "pending", today: "2026-11-21" })).map((x) => x.ref)).not.toContain("CA-OWNR-01");
  });
});
