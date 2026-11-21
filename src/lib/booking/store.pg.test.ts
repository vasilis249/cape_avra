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
    await sql`truncate reservations, calendar_blocks`;
    store = (await import("./store")).getBookingStore();
  });
  afterAll(async () => {
    await sql`truncate reservations, calendar_blocks`;
    await sql.end();
  });

  it("holds dates, refuses overlaps, allows turnover", async () => {
    expect((await hold("CA-TEST-01", "2027-06-15", "2027-06-20"))?.status).toBe("hold");
    expect(await hold("CA-TEST-02", "2027-06-18", "2027-06-23")).toBeNull();
    expect((await hold("CA-TEST-03", "2027-06-20", "2027-06-25"))?.status).toBe("hold");
  });

  it("confirms only an active hold, and confirmed stays block the calendar", async () => {
    const r = await store.getByRef("CA-TEST-01");
    const ok = await store.confirm(r!.id, { name: "A", email: "a@example.com" }, { provider: "test", status: "test", paidCents: 1 });
    expect(ok?.status).toBe("confirmed");
    expect(await store.confirm(r!.id, { name: "A", email: "a@example.com" }, { provider: "test", status: "test", paidCents: 1 })).toBeNull();
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
});
