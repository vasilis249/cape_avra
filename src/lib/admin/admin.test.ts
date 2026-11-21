import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { bookingSeed } from "@content/booking";
import { addDays as addDaysLocal } from "@/lib/booking/dates";
import { quoteStay } from "@/lib/booking/pricing";
import { FileStore, type BookingStore, type CalendarBlock, type Payment, type Reservation } from "@/lib/booking/store";
import { leadsToCsv, type LeadRow } from "@/lib/leads/store";
import { testProvider } from "@/lib/payments/test-provider";
import { beginCheckout, cancelReservation, keepSecurityDeposit, manageSecurityHolds, refundPayment, releaseSecurityDeposit, syncPayment, type Deps } from "@/lib/payments/service";
import { decodeSession, encodeSession } from "./auth";
import { parseMonths, toRanges } from "./months";
import { dashboard, occupancy, revenueIn, seasonYear } from "./stats";

const config = bookingSeed;
const res = (over: Partial<Reservation>): Reservation =>
  ({ id: crypto.randomUUID(), ref: "CA-TEST-01", status: "confirmed", checkIn: "2027-06-12", checkOut: "2027-06-19", guests: 4, totalCents: 100000, guest: { name: "G", email: "g@example.com" }, ...over }) as Reservation;
const pay = (over: Partial<Payment>): Payment =>
  ({ id: crypto.randomUUID(), reservationId: "", kind: "deposit", provider: "test", providerRef: crypto.randomUUID(), amountCents: 30000, currency: "EUR", status: "succeeded", refundedCents: 0, failure: null, createdAt: "2026-11-21T10:00:00Z", updatedAt: "2026-11-21T10:00:00Z", ...over }) as Payment;

describe("dashboard figures", () => {
  it("counts revenue net of refunds, including kept security deposits", () => {
    const ps = [
      pay({ amountCents: 30000, refundedCents: 5000 }),
      pay({ kind: "balance", amountCents: 70000 }),
      pay({ kind: "security_deposit", status: "captured", amountCents: 12000 }),
      pay({ kind: "security_deposit", status: "authorized", amountCents: 50000 }),
      pay({ status: "failed", amountCents: 99900 }),
      pay({ amountCents: 1000, createdAt: "2025-12-31T23:00:00Z" }),
    ];
    expect(revenueIn(2026, ps)).toBe(25000 + 70000 + 12000);
  });

  it("occupancy: other channels count as booked, your own blocks are not open nights", () => {
    const rs = [res({ checkIn: "2027-06-01", checkOut: "2027-06-08" }), res({ status: "cancelled", checkIn: "2027-06-08", checkOut: "2027-06-15" })];
    const blocks: CalendarBlock[] = [
      { id: "a", source: "airbnb", uid: "x", start: "2027-06-10", end: "2027-06-13", summary: null },
      { id: "m", source: "manual", uid: "y", start: "2027-06-20", end: "2027-06-30", summary: null },
    ];
    const o = occupancy(config, "2027-06-01", "2027-07-01", rs, blocks);
    expect(o).toEqual({ openNights: 20, booked: 10, direct: 7, percent: 50, directPercent: 35 });
  });

  it("closed months are not open nights; the season year moves on after the season", () => {
    expect(occupancy(config, "2027-01-01", "2027-02-01", [], []).openNights).toBe(0);
    expect(seasonYear(config, "2026-11-21")).toBe(2027);
    expect(seasonYear(config, "2027-05-01")).toBe(2027);
  });

  it("lists stays needing attention", () => {
    const a = res({ ref: "A", checkIn: "2027-01-05", checkOut: "2027-01-09" });
    const b = res({ ref: "B", checkIn: "2026-11-20", checkOut: "2026-11-25" });
    const ps = [pay({ reservationId: a.id, kind: "balance", status: "failed" }), pay({ reservationId: b.id, kind: "security_deposit", status: "authorized" })];
    const d = dashboard(config, "2026-11-21", [a, b], ps, []);
    expect(d.balanceFailed.map((r) => r.ref)).toEqual(["A"]);
    expect(d.inHouse.map((r) => r.ref)).toEqual(["B"]);
    expect(d.arrivals.map((r) => r.ref)).toEqual(["A"]);
    expect(d.securityHeld.map(({ r }) => r.ref)).toEqual(["B"]);
  });
});

describe("admin session", () => {
  it("round-trips, and rejects tampering, expiry and removed addresses", () => {
    const now = Date.now();
    const s = encodeSession("hello@capeavra.com", now)!;
    expect(decodeSession(s, now)?.email).toBe("hello@capeavra.com");
    const [data, mac] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ email: "hello@capeavra.com", exp: now + 1e12 })).toString("base64url");
    expect(decodeSession(`${forged}.${mac}`, now)).toBeNull();
    expect(decodeSession(`${data}.${mac.slice(0, -2)}xx`, now)).toBeNull();
    expect(decodeSession(s, now + 15 * 86_400_000)).toBeNull();
    expect(decodeSession(encodeSession("intruder@example.com", now)!, now)).toBeNull();
    expect(decodeSession(undefined, now)).toBeNull();
  });
});

describe("helpers", () => {
  it("parses fee months, including ranges over new year", () => {
    expect(parseMonths("4-10")).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(parseMonths("11-2")).toEqual([1, 2, 11, 12]);
    expect(parseMonths("1, 3,13, x")).toEqual([1, 3]);
    expect(parseMonths("")).toBeUndefined();
    expect(toRanges([1, 2, 11, 12])).toBe("1-2, 11-12");
    expect(toRanges([4, 5, 6, 9])).toBe("4-6, 9");
  });

  it("CSV: BOM, quoting, formula injection neutralised, phone numbers untouched", () => {
    const row = { kind: "contact", locale: "el", name: 'Μαρία "Μ."', email: "m@example.com", phone: "+30 690 000 0000", message: "=HYPERLINK(\"x\")", created_at: "2026-11-21T10:00:00Z", privacy_version: "1" } as LeadRow;
    const csv = leadsToCsv([row]);
    expect(csv.startsWith("﻿created_at,")).toBe(true);
    expect(csv).toContain('"Μαρία ""Μ."""');
    expect(csv).toContain('"+30 690 000 0000"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(leadsToCsv([{ ...row, message: "-2+3+cmd|' /C calc'!A0" }])).toContain(`"'-2+3+cmd`);
  });
});

describe("owner tools (file store, simulated payments)", () => {
  let store: BookingStore;
  let deps: Deps;
  const sent: string[] = [];
  beforeEach(async () => {
    store = new FileStore(path.join(await mkdtemp(path.join(tmpdir(), "cape-admin-")), "booking.json"));
    const notify = new Proxy({}, { get: (_, k) => async (r: Reservation) => void sent.push(`${String(k)}:${r.ref}`) }) as Deps["notify"];
    deps = { store, provider: testProvider, config, notify };
  });
  async function book(checkIn: string, checkOut: string) {
    const quote = quoteStay(config, { checkIn, checkOut, guests: 4 }, "2026-11-21");
    const r = (await store.createHold({ ref: `CA-${Math.random().toString(36).slice(2, 6).toUpperCase()}-AA`, tokenHash: "h", checkIn, checkOut, guests: 4, locale: "el", quote, holdMinutes: 15 }))!;
    const c = await beginCheckout(deps, r, { name: "G", email: "g@example.com" });
    if (!c.ok || !("paymentRef" in c)) throw new Error();
    await syncPayment(deps, testProvider.simulateCheckout(c.paymentRef, "success"));
    return { r: (await store.getById(r.id))!, ref: c.paymentRef };
  }

  it("partial refund without cancelling; never more than was paid", async () => {
    const { r, ref } = await book("2027-06-12", "2027-06-19");
    expect(await refundPayment(deps, r, ref, 5000)).toMatchObject({ ok: true, refundedCents: 5000 });
    expect(await refundPayment(deps, r, ref, r.quote.payment.depositCents)).toMatchObject({ ok: false, code: "tooMuch" });
    expect((await store.getById(r.id))!.status).toBe("confirmed");
  });

  it("owner cancels with a custom refund (capped to what was paid) or none", async () => {
    const a = await book("2027-06-12", "2027-06-19");
    expect(await cancelReservation(deps, a.r, "2027-06-11", { by: "owner", refundCents: 10000 })).toMatchObject({ ok: true, refundCents: 10000 });
    expect((await store.getPayment(a.ref))!.refundedCents).toBe(10000);
    const b = await book("2027-07-03", "2027-07-10");
    expect(await cancelReservation(deps, b.r, "2027-07-04", { by: "owner", refundCents: 99_999_999 })).toMatchObject({ ok: true, refundCents: b.r.quote.payment.depositCents });
    const c = await book("2027-08-07", "2027-08-14");
    expect(await cancelReservation(deps, c.r, "2027-08-01", { by: "owner", refundCents: 0 })).toMatchObject({ ok: true, refundCents: 0 });
    expect((await store.getById(c.r.id))!.cancellation).toMatchObject({ by: "owner", refundCents: 0 });
  });

  it("keeps part of the security deposit, or releases it", async () => {
    const a = await book("2027-06-12", "2027-06-15");
    await manageSecurityHolds(deps, "2027-06-12");
    const sec = (await store.listPayments(a.r.id)).find((p) => p.kind === "security_deposit")!;
    expect(await keepSecurityDeposit(deps, a.r, sec.providerRef, 999_999)).toMatchObject({ ok: false, code: "tooMuch" });
    expect(await keepSecurityDeposit(deps, a.r, sec.providerRef, 12000)).toEqual({ ok: true });
    expect(await store.getPayment(sec.providerRef)).toMatchObject({ status: "captured", amountCents: 12000 });

    const b = await book("2027-07-03", "2027-07-06");
    await manageSecurityHolds(deps, "2027-07-03");
    const sec2 = (await store.listPayments(b.r.id)).find((p) => p.kind === "security_deposit")!;
    expect(await releaseSecurityDeposit(deps, b.r, sec2.providerRef)).toEqual({ ok: true });
    expect((await store.getPayment(sec2.providerRef))!.status).toBe("canceled");
  });

  it("manual blocks refuse booked nights; login links work once; config, notes and photos persist", async () => {
    const { r } = await book("2027-06-12", "2027-06-19");
    expect(await store.addManualBlock("2027-06-18", "2027-06-22", "x")).toBe("booked");
    const blk = await store.addManualBlock("2027-06-19", "2027-06-22", "family");
    expect(blk).toMatchObject({ source: "manual", start: "2027-06-19", end: "2027-06-22" });
    expect(await store.createHold({ ref: "CA-ZZZZ-ZZ", tokenHash: "h", checkIn: "2027-06-20", checkOut: "2027-06-25", guests: 2, locale: "en", quote: r.quote, holdMinutes: 15 })).toBeNull();
    expect(await store.removeManualBlock((blk as CalendarBlock).id)).toBe(true);
    expect(await store.listBlocks("2027-06-01", "2027-07-01")).toEqual([]);

    await store.saveLoginToken("hash1", "hello@capeavra.com", new Date(Date.now() + 60_000).toISOString());
    expect(await store.consumeLoginToken("hash1")).toBe("hello@capeavra.com");
    expect(await store.consumeLoginToken("hash1")).toBeNull();
    await store.saveLoginToken("hash2", "hello@capeavra.com", new Date(Date.now() - 1).toISOString());
    expect(await store.consumeLoginToken("hash2")).toBeNull();

    await store.saveConfig({ ...config, cleaningFee: 200 });
    expect(await store.loadConfig()).toMatchObject({ cleaningFee: 200 });
    await store.saveConfig(null);
    expect(await store.loadConfig()).toBeNull();

    await store.addNote(r.id, "cot please");
    expect((await store.listNotes(r.id)).map((n) => n.body)).toEqual(["cot please"]);

    await store.saveSitePhoto({ slot: "space-living", path: "site/space-living-0123456789ab.jpg", width: 2400, height: 1600, blur: "data:", color: "#000000", alt: { en: "a", el: "α" }, focal: null });
    expect((await store.listSitePhotos()).map((p) => p.slot)).toEqual(["space-living"]);
    expect((await store.deleteSitePhoto("space-living"))?.path).toBe("site/space-living-0123456789ab.jpg");

    expect((await store.listReservations({ scope: "upcoming", today: "2026-11-21" })).map((x) => x.id)).toEqual([r.id]);
    expect(await store.listReservations({ scope: "past", today: "2026-11-21" })).toEqual([]);
    expect((await store.listReservations({ scope: "all", today: "2026-11-21", q: "G@EXAMPLE" })).length).toBe(1);
  });
});

describe("data retention", () => {
  it("purges never-paid checkouts after the cut-off, keeps paid and recent ones", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "cape-gdpr-")), "booking.json");
    const store = new FileStore(file);
    const quote = quoteStay(config, { checkIn: "2027-06-12", checkOut: "2027-06-19", guests: 2 }, "2026-11-21");
    const mk = async (ref: string, checkIn: string) => (await store.createHold({ ref, tokenHash: "h", checkIn, checkOut: addDaysLocal(checkIn, 7), guests: 2, locale: "en", quote, holdMinutes: 15 }))!;
    const a = await mk("CA-OLD1-AA", "2027-06-12");
    const b = await mk("CA-OLD2-AA", "2027-07-03");
    await store.createPayment({ reservationId: b.id, kind: "deposit", provider: "test", providerRef: "p1", amountCents: 1, currency: "EUR", status: "failed" });
    const { readFile, writeFile } = await import("node:fs/promises");
    const db = JSON.parse(await readFile(file, "utf8"));
    for (const r of db.reservations) Object.assign(r, { status: "expired", createdAt: "2026-01-01T00:00:00.000Z" });
    await writeFile(file, JSON.stringify(db));
    expect(await store.purgeAbandoned("2026-06-01T00:00:00.000Z")).toBe(1);
    expect(await store.getById(a.id)).toBeNull();
    expect(await store.getById(b.id)).not.toBeNull(); // has a payment record: kept
  });
});

describe("security invariants", () => {
  it("every admin server action checks the session first (except sign-in itself)", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(path.join(process.cwd(), "src/lib/admin/actions.ts"), "utf8");
    const publicOnes = new Set(["requestLoginLink", "verifyLogin", "logout"]);
    const fns = [...src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/g)];
    expect(fns.length).toBeGreaterThan(10);
    for (const [, name, firstLine] of fns) {
      if (publicOnes.has(name)) continue;
      expect(firstLine.trim(), name).toBe("await requireAdmin();");
    }
  });

  it("every admin page and route handler checks the session", async () => {
    const { readFile, readdir } = await import("node:fs/promises");
    const root = path.join(process.cwd(), "src/app/admin");
    const files = (await readdir(root, { recursive: true })).filter((f) => /(^|\/)(page|route)\.tsx?$/.test(f) && !f.startsWith("login"));
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const f of files) {
      const src = await readFile(path.join(root, f), "utf8");
      expect(/await (requireAdmin|getAdmin)\(\)/.test(src), f).toBe(true);
    }
  });
});
