import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { addDays, type ISODate } from "./dates";
import type { ICalEvent } from "./ical";
import type { Quote } from "./pricing";

export type ReservationStatus = "hold" | "confirmed" | "cancelled" | "expired";
export type GuestDetails = {
  name: string;
  email: string;
  phone?: string;
  country?: string;
  arrivalTime?: string;
  message?: string;
  marketing?: boolean;
};
export type PaymentRecord = {
  provider: string;
  status: "paid" | "deposit_paid" | "pending" | "failed" | "refunded" | "test";
  paidCents: number;
  reference?: string;
  [k: string]: unknown;
};
export type Reservation = {
  id: string;
  ref: string;
  tokenHash: string;
  status: ReservationStatus;
  source: string;
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
  locale: "en" | "el";
  currency: string;
  totalCents: number;
  quote: Quote;
  guest: GuestDetails | null;
  payment: PaymentRecord | null;
  expiresAt: string | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  confirmationSentAt: string | null;
  preArrivalSentAt: string | null;
  reviewSentAt: string | null;
};
export type BlockedRange = { start: ISODate; end: ISODate; source: string };
export type HoldInput = {
  ref: string;
  tokenHash: string;
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
  locale: "en" | "el";
  quote: Quote;
  holdMinutes: number;
};
export type EmailKind = "confirmation" | "preArrival" | "review";

export interface BookingStore {
  /** confirmed bookings, active holds and calendar blocks overlapping [from, to) */
  blockedRanges(from: ISODate, to: ISODate): Promise<BlockedRange[]>;
  /** null = dates no longer available */
  createHold(input: HoldInput): Promise<Reservation | null>;
  getByRef(ref: string): Promise<Reservation | null>;
  /** hold → confirmed, only while the hold is still active; null = expired/taken */
  confirm(id: string, guest: GuestDetails, payment: PaymentRecord): Promise<Reservation | null>;
  /** release a hold early (e.g. payment failed) */
  releaseHold(id: string): Promise<void>;
  expireHolds(): Promise<number>;
  replaceBlocks(source: string, events: ICalEvent[]): Promise<number>;
  /** what we publish in our own iCal feed: direct bookings + manual blocks (never re-export imports) */
  exportEvents(): Promise<ICalEvent[]>;
  /** confirmed stays arriving on `checkIn` (pre-arrival) or that left on `checkOut` (review) without that email yet */
  dueForEmail(kind: "preArrival" | "review", date: ISODate): Promise<Reservation[]>;
  markEmailSent(id: string, kind: EmailKind): Promise<void>;
  loadConfig(): Promise<unknown | null>;
}

export class StoreUnavailableError extends Error {}

/* ----------------------------------------------------------------- Postgres */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const day = (v: unknown): ISODate => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

function fromRow(r: Row): Reservation {
  return {
    id: String(r.id),
    ref: String(r.ref),
    tokenHash: String(r.token_hash),
    status: r.status as ReservationStatus,
    source: String(r.source),
    checkIn: day(r.check_in),
    checkOut: day(r.check_out),
    guests: Number(r.guests),
    locale: (r.locale === "el" ? "el" : "en") as "en" | "el",
    currency: String(r.currency),
    totalCents: Number(r.total_cents),
    quote: r.quote as Quote,
    guest: (r.guest as GuestDetails) ?? null,
    payment: (r.payment as PaymentRecord) ?? null,
    expiresAt: iso(r.expires_at),
    createdAt: iso(r.created_at)!,
    confirmedAt: iso(r.confirmed_at),
    cancelledAt: iso(r.cancelled_at),
    confirmationSentAt: iso(r.confirmation_sent_at),
    preArrivalSentAt: iso(r.pre_arrival_sent_at),
    reviewSentAt: iso(r.review_sent_at),
  };
}

const globalForPg = globalThis as unknown as { __capeSql?: postgres.Sql };

class PostgresStore implements BookingStore {
  private sql: postgres.Sql;
  constructor(url: string) {
    // prepare:false → works with Supabase's transaction pooler (serverless-friendly)
    this.sql = globalForPg.__capeSql ??= postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  }

  async blockedRanges(from: ISODate, to: ISODate) {
    const rows = await this.sql`
      select check_in as start, check_out as "end", 'reservation' as source from reservations
       where (status = 'confirmed' or (status = 'hold' and expires_at > now()))
         and check_out > ${from} and check_in < ${to}
      union all
      select start_date, end_date, source from calendar_blocks
       where end_date > ${from} and start_date < ${to}`;
    return rows.map((r) => ({ start: day(r.start), end: day(r.end), source: String(r.source) }));
  }

  async createHold(i: HoldInput) {
    try {
      const [row] = await this.sql`
        select * from create_hold(${i.ref}, ${i.tokenHash}, ${i.checkIn}, ${i.checkOut}, ${i.guests},
                                  ${i.locale}, ${i.quote.totalCents}, ${this.sql.json(i.quote as never)}, ${i.holdMinutes})`;
      return fromRow(row);
    } catch (e) {
      if (e instanceof Error && e.message === "unavailable") return null;
      throw e;
    }
  }

  async getByRef(ref: string) {
    const [row] = await this.sql`select * from reservations where ref = ${ref}`;
    return row ? fromRow(row) : null;
  }

  async confirm(id: string, guest: GuestDetails, payment: PaymentRecord) {
    const [row] = await this.sql`
      update reservations
         set status = 'confirmed', confirmed_at = now(), expires_at = null,
             guest = ${this.sql.json(guest as never)}, payment = ${this.sql.json(payment as never)}
       where id = ${id} and status = 'hold' and expires_at > now()
       returning *`;
    return row ? fromRow(row) : null;
  }

  async releaseHold(id: string) {
    await this.sql`update reservations set status = 'expired' where id = ${id} and status = 'hold'`;
  }

  async expireHolds() {
    const [r] = await this.sql`select expire_holds() as n`;
    return Number(r.n);
  }

  async replaceBlocks(source: string, events: ICalEvent[]) {
    const [r] = await this.sql`select replace_calendar_blocks(${source}, ${this.sql.json(events as never)}) as n`;
    return Number(r.n);
  }

  async exportEvents() {
    const rows = await this.sql`
      select 'res-' || ref as uid, check_in as start, check_out as "end", 'Cape Avra: booked' as summary
        from reservations where status = 'confirmed' and check_out >= current_date
      union all
      select 'block-' || uid, start_date, end_date, coalesce(summary, 'Not available')
        from calendar_blocks where source = 'manual' and end_date >= current_date`;
    return rows.map((r) => ({ uid: `${r.uid}@capeavra.com`, start: day(r.start), end: day(r.end), summary: String(r.summary) }));
  }

  async dueForEmail(kind: "preArrival" | "review", date: ISODate) {
    const rows =
      kind === "preArrival"
        ? await this.sql`select * from reservations where status = 'confirmed' and check_in = ${date} and pre_arrival_sent_at is null`
        : await this.sql`select * from reservations where status = 'confirmed' and check_out = ${date} and review_sent_at is null`;
    return rows.map(fromRow);
  }

  async markEmailSent(id: string, kind: EmailKind) {
    const col = { confirmation: "confirmation_sent_at", preArrival: "pre_arrival_sent_at", review: "review_sent_at" }[kind];
    await this.sql`update reservations set ${this.sql(col)} = now() where id = ${id}`;
  }

  async loadConfig() {
    const [row] = await this.sql`select config from booking_config where id = 1`;
    return row?.config ?? null;
  }
}

/* ------------------------------------------------------ local file (dev only) */

type FileDb = { reservations: Reservation[]; blocks: (BlockedRange & { uid: string; summary: string })[] };
const FILE = path.join(process.cwd(), ".data/booking.json");
let lock: Promise<unknown> = Promise.resolve();

/** Same semantics as Postgres, for running locally without a database. Single process only. */
class FileStore implements BookingStore {
  private async tx<T>(fn: (db: FileDb) => T | Promise<T>, write = false): Promise<T> {
    const run = lock.then(async () => {
      let db: FileDb = { reservations: [], blocks: [] };
      try {
        db = JSON.parse(await readFile(FILE, "utf8"));
      } catch {}
      const out = await fn(db);
      if (write) {
        await mkdir(path.dirname(FILE), { recursive: true });
        await writeFile(FILE, JSON.stringify(db, null, 2));
      }
      return out;
    });
    lock = run.catch(() => {});
    return run;
  }
  private active = (r: Reservation) => r.status === "confirmed" || (r.status === "hold" && r.expiresAt! > new Date().toISOString());
  private overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && b.start < a.end;

  blockedRanges(from: ISODate, to: ISODate) {
    return this.tx((db) => [
      ...db.reservations.filter(this.active).map((r) => ({ start: r.checkIn, end: r.checkOut, source: "reservation" })),
      ...db.blocks.map((b) => ({ start: b.start, end: b.end, source: b.source })),
    ].filter((r) => this.overlaps(r, { start: from, end: to })));
  }
  createHold(i: HoldInput) {
    return this.tx((db) => {
      const want = { start: i.checkIn, end: i.checkOut };
      const now = new Date();
      db.reservations.forEach((r) => {
        if (r.status === "hold" && r.expiresAt! <= now.toISOString()) r.status = "expired";
      });
      const taken =
        db.reservations.some((r) => this.active(r) && this.overlaps({ start: r.checkIn, end: r.checkOut }, want)) ||
        db.blocks.some((b) => this.overlaps(b, want));
      if (taken) return null;
      const r: Reservation = {
        id: crypto.randomUUID(),
        ref: i.ref,
        tokenHash: i.tokenHash,
        status: "hold",
        source: "direct",
        checkIn: i.checkIn,
        checkOut: i.checkOut,
        guests: i.guests,
        locale: i.locale,
        currency: i.quote.currency,
        totalCents: i.quote.totalCents,
        quote: i.quote,
        guest: null,
        payment: null,
        expiresAt: new Date(now.getTime() + i.holdMinutes * 60_000).toISOString(),
        createdAt: now.toISOString(),
        confirmedAt: null,
        cancelledAt: null,
        confirmationSentAt: null,
        preArrivalSentAt: null,
        reviewSentAt: null,
      };
      db.reservations.push(r);
      return r;
    }, true);
  }
  getByRef(ref: string) {
    return this.tx((db) => db.reservations.find((r) => r.ref === ref) ?? null);
  }
  confirm(id: string, guest: GuestDetails, payment: PaymentRecord) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id);
      if (!r || r.status !== "hold" || r.expiresAt! <= new Date().toISOString()) return null;
      Object.assign(r, { status: "confirmed", confirmedAt: new Date().toISOString(), expiresAt: null, guest, payment });
      return r;
    }, true);
  }
  releaseHold(id: string) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id);
      if (r?.status === "hold") r.status = "expired";
    }, true);
  }
  expireHolds() {
    return this.tx((db) => {
      let n = 0;
      for (const r of db.reservations) {
        if (r.status === "hold" && r.expiresAt! <= new Date().toISOString()) {
          r.status = "expired";
          n++;
        }
      }
      return n;
    }, true);
  }
  replaceBlocks(source: string, events: ICalEvent[]) {
    return this.tx((db) => {
      db.blocks = db.blocks.filter((b) => b.source !== source);
      for (const e of events) if (e.end > e.start) db.blocks.push({ source, uid: e.uid, start: e.start, end: e.end, summary: e.summary });
      return events.length;
    }, true);
  }
  exportEvents() {
    const today = new Date().toISOString().slice(0, 10);
    return this.tx((db) => [
      ...db.reservations
        .filter((r) => r.status === "confirmed" && r.checkOut >= today)
        .map((r) => ({ uid: `res-${r.ref}@capeavra.com`, start: r.checkIn, end: r.checkOut, summary: "Cape Avra: booked" })),
      ...db.blocks
        .filter((b) => b.source === "manual" && b.end >= today)
        .map((b) => ({ uid: `block-${b.uid}@capeavra.com`, start: b.start, end: b.end, summary: b.summary || "Not available" })),
    ]);
  }
  dueForEmail(kind: "preArrival" | "review", date: ISODate) {
    return this.tx((db) =>
      db.reservations.filter((r) =>
        r.status === "confirmed" && (kind === "preArrival" ? r.checkIn === date && !r.preArrivalSentAt : r.checkOut === date && !r.reviewSentAt),
      ),
    );
  }
  markEmailSent(id: string, kind: EmailKind) {
    const key = { confirmation: "confirmationSentAt", preArrival: "preArrivalSentAt", review: "reviewSentAt" }[kind] as keyof Reservation;
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id);
      if (r) (r as Record<string, unknown>)[key] = new Date().toISOString();
    }, true);
  }
  async loadConfig() {
    return null;
  }
}

/* -------------------------------------------------------------------- choose */

let store: BookingStore | null = null;
export function getBookingStore(): BookingStore {
  if (store) return store;
  if (process.env.DATABASE_URL) return (store = new PostgresStore(process.env.DATABASE_URL));
  if (process.env.VERCEL) throw new StoreUnavailableError("DATABASE_URL is not set");
  return (store = new FileStore());
}

/** Window used by the calendar: today → maxAdvanceMonths ahead (+ a margin). */
export const calendarWindow = (today: ISODate, months: number): [ISODate, ISODate] => [today, addDays(today, months * 31 + 7)];

