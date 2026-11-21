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
export type Cancellation = { by: "guest" | "owner" | "system"; at: string; refundPercent: number; refundCents: number; reason?: string };

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
  expiresAt: string | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  confirmationSentAt: string | null;
  preArrivalSentAt: string | null;
  reviewSentAt: string | null;
  providerCustomerId: string | null;
  paymentMethodId: string | null;
  balanceDueDate: ISODate | null;
  cancellation: Cancellation | null;
  cancellationSentAt: string | null;
};

export type PaymentKind = "deposit" | "full" | "balance" | "security_deposit";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "canceled" | "authorized" | "captured";
export type Payment = {
  id: string;
  reservationId: string;
  kind: PaymentKind;
  provider: string;
  providerRef: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  refundedCents: number;
  failure: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BlockedRange = { start: ISODate; end: ISODate; source: string };
export type CalendarBlock = { id: string; source: string; uid: string; start: ISODate; end: ISODate; summary: string | null };
export type ReservationNote = { id: string; reservationId: string; body: string; createdAt: string };
export type SitePhoto = {
  slot: string;
  path: string;
  width: number;
  height: number;
  blur: string;
  color: string;
  alt: { en: string; el: string };
  focal: string | null;
  updatedAt: string;
};
/** upcoming = not yet departed (includes guests in the house); pending = active holds awaiting payment */
export type ReservationScope = "upcoming" | "pending" | "past" | "cancelled" | "all";
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
export type EmailKind = "confirmation" | "preArrival" | "review" | "cancellation";

export interface BookingStore {
  /** confirmed bookings, active holds and calendar blocks overlapping [from, to) */
  blockedRanges(from: ISODate, to: ISODate): Promise<BlockedRange[]>;
  /** null = dates no longer available */
  createHold(input: HoldInput): Promise<Reservation | null>;
  getByRef(ref: string): Promise<Reservation | null>;
  getById(id: string): Promise<Reservation | null>;
  /** guest details entered at checkout; extends an active hold by `extendMinutes` (payment in progress) */
  saveGuest(id: string, guest: GuestDetails, extendMinutes: number): Promise<Reservation | null>;
  setPaymentProfile(id: string, profile: { customerId?: string | null; paymentMethodId?: string | null }): Promise<void>;
  /** first successful payment → confirmed (also late, if the dates are still free); null = dates taken */
  confirmPaid(id: string): Promise<Reservation | null>;
  cancel(id: string, cancellation: Cancellation): Promise<Reservation | null>;
  /** release a hold early */
  releaseHold(id: string): Promise<void>;
  expireHolds(): Promise<number>;

  createPayment(p: Omit<Payment, "id" | "createdAt" | "updatedAt" | "refundedCents" | "failure"> & { failure?: string | null }): Promise<Payment>;
  getPayment(providerRef: string): Promise<Payment | null>;
  listPayments(reservationId: string): Promise<Payment[]>;
  updatePayment(providerRef: string, patch: Partial<Pick<Payment, "status" | "refundedCents" | "failure" | "amountCents">>): Promise<Payment | null>;
  /** atomic status change: only applies (and returns the row) when the current status is in `from` */
  transitionPayment(providerRef: string, from: PaymentStatus[], patch: Partial<Pick<Payment, "status" | "failure">>): Promise<Payment | null>;

  /** webhook idempotency: records the event; false if it was already processed */
  recordEvent(id: string, provider: string, type: string): Promise<boolean>;
  markEventProcessed(id: string): Promise<void>;

  replaceBlocks(source: string, events: ICalEvent[]): Promise<number>;
  /** what we publish in our own iCal feed: direct bookings + manual blocks (never re-export imports) */
  exportEvents(): Promise<ICalEvent[]>;
  dueForEmail(kind: "preArrival" | "review", date: ISODate): Promise<Reservation[]>;
  markEmailSent(id: string, kind: EmailKind): Promise<void>;
  /** atomically mark an email as sent; false if another process already did (so it goes out once) */
  claimEmail(id: string, kind: EmailKind): Promise<boolean>;
  /** undo a claim when sending failed, so a later run retries */
  releaseEmail(id: string, kind: EmailKind): Promise<void>;
  /** confirmed stays whose balance is due on/before `date` and not yet paid or attempted */
  balancesDue(date: ISODate): Promise<Reservation[]>;
  /**
   * confirmed stays in their security-deposit window (check-in day → check-out + releaseDays) with a
   * saved card and no live authorisation (expired authorisations, which cards drop after ~7 days, are re-placed)
   */
  securityHoldsToPlace(today: ISODate, releaseDays: number): Promise<Reservation[]>;
  /** authorised security deposits whose window ended, or whose stay was cancelled */
  securityHoldsToRelease(today: ISODate, releaseDays: number): Promise<Payment[]>;
  /** unpaid (pending/failed) checkout payments of holds that have expired, to cancel at the provider */
  abandonedPayments(): Promise<Payment[]>;
  loadConfig(): Promise<unknown | null>;

  /* ---- admin (Phase 5) ---- */
  /** confirmed/cancelled stays for the admin list (`all` also shows holds); q matches ref, name or email */
  listReservations(opts: { scope: ReservationScope; today: ISODate; q?: string }): Promise<Reservation[]>;
  allPayments(): Promise<Payment[]>;
  listBlocks(from: ISODate, to: ISODate): Promise<CalendarBlock[]>;
  /** "booked" = the range covers a confirmed booking or an active hold */
  addManualBlock(start: ISODate, end: ISODate, summary: string): Promise<CalendarBlock | "booked">;
  removeManualBlock(id: string): Promise<boolean>;
  /** move an active hold's expiry (owner bookings awaiting payment); null if it is no longer an active hold */
  extendHold(id: string, until: string): Promise<Reservation | null>;
  /** null removes the stored copy (back to the seed in content/booking.ts) */
  saveConfig(config: unknown | null): Promise<void>;
  listNotes(reservationId: string): Promise<ReservationNote[]>;
  addNote(reservationId: string, body: string): Promise<ReservationNote>;
  saveLoginToken(tokenHash: string, email: string, expiresAt: string): Promise<void>;
  /** marks the token used; returns its email if it was valid, unused and not expired */
  consumeLoginToken(tokenHash: string): Promise<string | null>;
  /** GDPR: delete never-paid (expired) reservations created before `before`; returns how many */
  purgeAbandoned(before: string): Promise<number>;
  listSitePhotos(): Promise<SitePhoto[]>;
  saveSitePhoto(p: Omit<SitePhoto, "updatedAt">): Promise<void>;
  deleteSitePhoto(slot: string): Promise<SitePhoto | null>;
}

export class StoreUnavailableError extends Error {}

/* ----------------------------------------------------------------- Postgres */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const day = (v: unknown): ISODate => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const dayOrNull = (v: unknown) => (v == null ? null : day(v));

function resFromRow(r: Row): Reservation {
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
    expiresAt: iso(r.expires_at),
    createdAt: iso(r.created_at)!,
    confirmedAt: iso(r.confirmed_at),
    cancelledAt: iso(r.cancelled_at),
    confirmationSentAt: iso(r.confirmation_sent_at),
    preArrivalSentAt: iso(r.pre_arrival_sent_at),
    reviewSentAt: iso(r.review_sent_at),
    providerCustomerId: (r.provider_customer_id as string) ?? null,
    paymentMethodId: (r.payment_method_id as string) ?? null,
    balanceDueDate: dayOrNull(r.balance_due_date),
    cancellation: (r.cancellation as Cancellation) ?? null,
    cancellationSentAt: iso(r.cancellation_sent_at),
  };
}

function payFromRow(r: Row): Payment {
  return {
    id: String(r.id),
    reservationId: String(r.reservation_id),
    kind: r.kind as PaymentKind,
    provider: String(r.provider),
    providerRef: String(r.provider_ref),
    amountCents: Number(r.amount_cents),
    currency: String(r.currency),
    status: r.status as PaymentStatus,
    refundedCents: Number(r.refunded_cents),
    failure: (r.failure as string) ?? null,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

const globalForPg = globalThis as unknown as { __capeSql?: postgres.Sql };
const EMAIL_COLUMN: Record<EmailKind, string> = {
  confirmation: "confirmation_sent_at",
  preArrival: "pre_arrival_sent_at",
  review: "review_sent_at",
  cancellation: "cancellation_sent_at",
};

class PostgresStore implements BookingStore {
  private sql: postgres.Sql;
  constructor(url: string) {
    // prepare:false → works with Supabase's transaction pooler (serverless-friendly)
    this.sql = globalForPg.__capeSql ??= postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  }
  private json = (v: unknown) => this.sql.json(v as never);

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
                                  ${i.locale}, ${i.quote.totalCents}, ${this.json(i.quote)}, ${i.holdMinutes})`;
      if (i.quote.payment.balanceDueDate) await this.sql`update reservations set balance_due_date = ${i.quote.payment.balanceDueDate} where id = ${row.id}`;
      return resFromRow({ ...row, balance_due_date: i.quote.payment.balanceDueDate });
    } catch (e) {
      if (e instanceof Error && e.message === "unavailable") return null;
      throw e;
    }
  }

  async getByRef(ref: string) {
    const [row] = await this.sql`select * from reservations where ref = ${ref}`;
    return row ? resFromRow(row) : null;
  }
  async getById(id: string) {
    const [row] = await this.sql`select * from reservations where id = ${id}`;
    return row ? resFromRow(row) : null;
  }

  async saveGuest(id: string, guest: GuestDetails, extendMinutes: number) {
    const [row] = await this.sql`
      update reservations
         set guest = ${this.json(guest)},
             expires_at = greatest(expires_at, now() + make_interval(mins => ${extendMinutes}))
       where id = ${id} and status = 'hold' and expires_at > now()
       returning *`;
    return row ? resFromRow(row) : null;
  }

  async setPaymentProfile(id: string, p: { customerId?: string | null; paymentMethodId?: string | null }) {
    await this.sql`
      update reservations
         set provider_customer_id = coalesce(${p.customerId ?? null}, provider_customer_id),
             payment_method_id = coalesce(${p.paymentMethodId ?? null}, payment_method_id)
       where id = ${id}`;
  }

  async confirmPaid(id: string) {
    const [row] = await this.sql`select * from confirm_paid_reservation(${id})`;
    return row?.id ? resFromRow(row) : null;
  }

  async cancel(id: string, c: Cancellation) {
    const [row] = await this.sql`
      update reservations set status = 'cancelled', cancelled_at = now(), expires_at = null, cancellation = ${this.json(c)}
       where id = ${id} and status in ('hold', 'confirmed', 'expired')
       returning *`;
    return row ? resFromRow(row) : null;
  }

  async releaseHold(id: string) {
    await this.sql`update reservations set status = 'expired' where id = ${id} and status = 'hold'`;
  }

  async expireHolds() {
    const [r] = await this.sql`select expire_holds() as n`;
    return Number(r.n);
  }

  async createPayment(p: Parameters<BookingStore["createPayment"]>[0]) {
    const [row] = await this.sql`
      insert into payments (reservation_id, kind, provider, provider_ref, amount_cents, currency, status, failure)
      values (${p.reservationId}, ${p.kind}, ${p.provider}, ${p.providerRef}, ${p.amountCents}, ${p.currency}, ${p.status}, ${p.failure ?? null})
      returning *`;
    return payFromRow(row);
  }
  async getPayment(providerRef: string) {
    const [row] = await this.sql`select * from payments where provider_ref = ${providerRef}`;
    return row ? payFromRow(row) : null;
  }
  async listPayments(reservationId: string) {
    const rows = await this.sql`select * from payments where reservation_id = ${reservationId} order by created_at`;
    return rows.map(payFromRow);
  }
  async updatePayment(providerRef: string, patch: Partial<Pick<Payment, "status" | "refundedCents" | "failure" | "amountCents">>) {
    const [row] = await this.sql`
      update payments set
        status = coalesce(${patch.status ?? null}, status),
        amount_cents = coalesce(${patch.amountCents ?? null}, amount_cents),
        refunded_cents = coalesce(${patch.refundedCents ?? null}, refunded_cents),
        failure = case when ${patch.failure === undefined} then failure else ${patch.failure ?? null} end,
        updated_at = now()
      where provider_ref = ${providerRef}
      returning *`;
    return row ? payFromRow(row) : null;
  }

  async transitionPayment(providerRef: string, from: PaymentStatus[], patch: Partial<Pick<Payment, "status" | "failure">>) {
    const [row] = await this.sql`
      update payments set
        status = coalesce(${patch.status ?? null}, status),
        failure = case when ${patch.failure === undefined} then failure else ${patch.failure ?? null} end,
        updated_at = now()
      where provider_ref = ${providerRef} and status = any(${from})
      returning *`;
    return row ? payFromRow(row) : null;
  }

  async recordEvent(id: string, provider: string, type: string) {
    const [row] = await this.sql`
      insert into payment_events (id, provider, type) values (${id}, ${provider}, ${type})
      on conflict (id) do update set type = excluded.type
      returning processed_at`;
    return row.processed_at == null;
  }
  async markEventProcessed(id: string) {
    await this.sql`update payment_events set processed_at = now() where id = ${id}`;
  }

  async replaceBlocks(source: string, events: ICalEvent[]) {
    const [r] = await this.sql`select replace_calendar_blocks(${source}, ${this.json(events)}) as n`;
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
    return rows.map(resFromRow);
  }

  async markEmailSent(id: string, kind: EmailKind) {
    await this.sql`update reservations set ${this.sql(EMAIL_COLUMN[kind])} = now() where id = ${id}`;
  }

  async claimEmail(id: string, kind: EmailKind) {
    const col = this.sql(EMAIL_COLUMN[kind]);
    const rows = await this.sql`update reservations set ${col} = now() where id = ${id} and ${col} is null returning id`;
    return rows.length === 1;
  }
  async releaseEmail(id: string, kind: EmailKind) {
    await this.sql`update reservations set ${this.sql(EMAIL_COLUMN[kind])} = null where id = ${id}`;
  }

  async balancesDue(date: ISODate) {
    const rows = await this.sql`
      select r.* from reservations r
       where r.status = 'confirmed' and r.balance_due_date is not null and r.balance_due_date <= ${date}
         and r.check_in > ${date}
         and not exists (select 1 from payments p where p.reservation_id = r.id and p.kind = 'balance'
                          and p.status in ('pending', 'succeeded', 'failed'))`;
    return rows.map(resFromRow);
  }

  async securityHoldsToPlace(today: ISODate, releaseDays: number) {
    const rows = await this.sql`
      select r.* from reservations r
       where r.status = 'confirmed' and r.payment_method_id is not null
         and r.check_in <= ${today} and r.check_out + ${releaseDays}::int > ${today}::date
         and not exists (select 1 from payments p where p.reservation_id = r.id and p.kind = 'security_deposit'
                          and p.status in ('pending', 'authorized', 'captured', 'failed'))`;
    return rows.map(resFromRow);
  }

  async securityHoldsToRelease(today: ISODate, releaseDays: number) {
    const rows = await this.sql`
      select p.* from payments p join reservations r on r.id = p.reservation_id
       where p.kind = 'security_deposit' and p.status = 'authorized'
         and (r.check_out + ${releaseDays}::int <= ${today}::date or r.status = 'cancelled')`;
    return rows.map(payFromRow);
  }

  async abandonedPayments() {
    const rows = await this.sql`
      select p.* from payments p join reservations r on r.id = p.reservation_id
       where p.status in ('pending', 'failed') and p.kind in ('deposit', 'full') and r.status = 'expired'`;
    return rows.map(payFromRow);
  }

  async loadConfig() {
    const [row] = await this.sql`select config from booking_config where id = 1`;
    return row?.config ?? null;
  }

  async listReservations({ scope, today, q }: { scope: ReservationScope; today: ISODate; q?: string }) {
    const like = q ? `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
    const rows = await this.sql`
      select * from reservations
       where (${scope} = 'all'
              or (${scope} = 'upcoming' and status = 'confirmed' and check_out > ${today})
              or (${scope} = 'pending' and status = 'hold' and expires_at > now())
              or (${scope} = 'past' and status = 'confirmed' and check_out <= ${today})
              or (${scope} = 'cancelled' and status = 'cancelled'))
         and (${scope} <> 'all' or status in ('confirmed', 'cancelled', 'hold'))
         and (${like}::text is null or ref ilike ${like} or guest->>'name' ilike ${like} or guest->>'email' ilike ${like})
       order by
         case when ${scope} = 'upcoming' then check_in end asc,
         case when ${scope} = 'pending' then expires_at end asc,
         case when ${scope} = 'past' then check_in end desc,
         case when ${scope} = 'cancelled' then cancelled_at end desc,
         created_at desc
       limit 500`;
    return rows.map(resFromRow);
  }

  async allPayments() {
    const rows = await this.sql`select * from payments order by created_at`;
    return rows.map(payFromRow);
  }

  async listBlocks(from: ISODate, to: ISODate) {
    const rows = await this.sql`
      select * from calendar_blocks where end_date > ${from} and start_date < ${to} order by start_date`;
    return rows.map((r) => ({ id: String(r.id), source: String(r.source), uid: String(r.uid), start: day(r.start_date), end: day(r.end_date), summary: (r.summary as string) ?? null }));
  }

  async addManualBlock(start: ISODate, end: ISODate, summary: string) {
    try {
      const [r] = await this.sql`select * from add_manual_block(${start}, ${end}, ${summary})`;
      return { id: String(r.id), source: "manual", uid: String(r.uid), start: day(r.start_date), end: day(r.end_date), summary: (r.summary as string) ?? null };
    } catch (e) {
      if (e instanceof Error && e.message === "booked") return "booked" as const;
      throw e;
    }
  }

  async extendHold(id: string, until: string) {
    const [row] = await this.sql`
      update reservations set expires_at = ${until}
       where id = ${id} and status = 'hold' and expires_at > now() returning *`;
    return row ? resFromRow(row) : null;
  }

  async removeManualBlock(id: string) {
    const rows = await this.sql`delete from calendar_blocks where id = ${id} and source = 'manual' returning id`;
    return rows.length === 1;
  }

  async saveConfig(config: unknown | null) {
    if (config === null) await this.sql`delete from booking_config where id = 1`;
    else
      await this.sql`
        insert into booking_config (id, config) values (1, ${this.json(config)})
        on conflict (id) do update set config = excluded.config, updated_at = now()`;
  }

  async listNotes(reservationId: string) {
    const rows = await this.sql`select * from reservation_notes where reservation_id = ${reservationId} order by created_at`;
    return rows.map((r) => ({ id: String(r.id), reservationId: String(r.reservation_id), body: String(r.body), createdAt: iso(r.created_at)! }));
  }
  async addNote(reservationId: string, body: string) {
    const [r] = await this.sql`insert into reservation_notes (reservation_id, body) values (${reservationId}, ${body}) returning *`;
    return { id: String(r.id), reservationId: String(r.reservation_id), body: String(r.body), createdAt: iso(r.created_at)! };
  }

  async saveLoginToken(tokenHash: string, email: string, expiresAt: string) {
    await this.sql`delete from admin_login_tokens where expires_at < now() - interval '1 day'`;
    await this.sql`insert into admin_login_tokens (token_hash, email, expires_at) values (${tokenHash}, ${email}, ${expiresAt})`;
  }
  async consumeLoginToken(tokenHash: string) {
    const [r] = await this.sql`
      update admin_login_tokens set used_at = now()
       where token_hash = ${tokenHash} and used_at is null and expires_at > now()
       returning email`;
    return r ? String(r.email) : null;
  }

  async purgeAbandoned(before: string) {
    const rows = await this.sql`
      delete from reservations r
       where r.status = 'expired' and r.created_at < ${before}
         and not exists (select 1 from payments p where p.reservation_id = r.id)
       returning id`;
    return rows.length;
  }

  async listSitePhotos() {
    const rows = await this.sql`select * from site_photos`;
    return rows.map((r) => ({
      slot: String(r.slot),
      path: String(r.path),
      width: Number(r.width),
      height: Number(r.height),
      blur: String(r.blur),
      color: String(r.color),
      alt: r.alt as { en: string; el: string },
      focal: (r.focal as string) ?? null,
      updatedAt: iso(r.updated_at)!,
    }));
  }
  async saveSitePhoto(p: Omit<SitePhoto, "updatedAt">) {
    await this.sql`
      insert into site_photos (slot, path, width, height, blur, color, alt, focal)
      values (${p.slot}, ${p.path}, ${p.width}, ${p.height}, ${p.blur}, ${p.color}, ${this.json(p.alt)}, ${p.focal})
      on conflict (slot) do update set path = excluded.path, width = excluded.width, height = excluded.height,
        blur = excluded.blur, color = excluded.color, alt = excluded.alt, focal = excluded.focal, updated_at = now()`;
  }
  async deleteSitePhoto(slot: string) {
    const [r] = await this.sql`delete from site_photos where slot = ${slot} returning *`;
    if (!r) return null;
    return { slot: String(r.slot), path: String(r.path), width: Number(r.width), height: Number(r.height), blur: String(r.blur), color: String(r.color), alt: r.alt as { en: string; el: string }, focal: (r.focal as string) ?? null, updatedAt: iso(r.updated_at)! };
  }
}

/* ------------------------------------------------------ local file (dev only) */

type FileDb = {
  reservations: Reservation[];
  blocks: (BlockedRange & { uid: string; summary: string; id?: string })[];
  payments: Payment[];
  events: { id: string; provider: string; type: string; processedAt: string | null }[];
  notes: ReservationNote[];
  loginTokens: { tokenHash: string; email: string; expiresAt: string; usedAt: string | null }[];
  sitePhotos: SitePhoto[];
  config: unknown | null;
};

let lock: Promise<unknown> = Promise.resolve();

/** Same semantics as Postgres, for running locally (and in tests) without a database. Single process only. */
export class FileStore implements BookingStore {
  constructor(private file = process.env.BOOKING_FILE ?? path.join(process.cwd(), ".data/booking.json")) {}

  private async tx<T>(fn: (db: FileDb) => T | Promise<T>, write = false): Promise<T> {
    const run = lock.then(async () => {
      let db: FileDb = { reservations: [], blocks: [], payments: [], events: [], notes: [], loginTokens: [], sitePhotos: [], config: null };
      try {
        db = { ...db, ...JSON.parse(await readFile(this.file, "utf8")) };
      } catch {}
      const out = await fn(db);
      if (write) {
        await mkdir(path.dirname(this.file), { recursive: true });
        await writeFile(this.file, JSON.stringify(db, null, 2));
      }
      return structuredClone(out);
    });
    lock = run.catch(() => {});
    return run;
  }
  private now = () => new Date().toISOString();
  private active = (r: Reservation) => r.status === "confirmed" || (r.status === "hold" && r.expiresAt! > this.now());
  private overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && b.start < a.end;
  private range = (r: Reservation) => ({ start: r.checkIn, end: r.checkOut });

  blockedRanges(from: ISODate, to: ISODate) {
    return this.tx((db) =>
      [
        ...db.reservations.filter(this.active).map((r) => ({ start: r.checkIn, end: r.checkOut, source: "reservation" })),
        ...db.blocks.map((b) => ({ start: b.start, end: b.end, source: b.source })),
      ].filter((r) => this.overlaps(r, { start: from, end: to })),
    );
  }
  createHold(i: HoldInput) {
    return this.tx((db) => {
      const want = { start: i.checkIn, end: i.checkOut };
      db.reservations.forEach((r) => {
        if (r.status === "hold" && r.expiresAt! <= this.now()) r.status = "expired";
      });
      const taken =
        db.reservations.some((r) => this.active(r) && this.overlaps(this.range(r), want)) || db.blocks.some((b) => this.overlaps(b, want));
      if (taken) return null;
      const now = new Date();
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
        expiresAt: new Date(now.getTime() + i.holdMinutes * 60_000).toISOString(),
        createdAt: now.toISOString(),
        confirmedAt: null,
        cancelledAt: null,
        confirmationSentAt: null,
        preArrivalSentAt: null,
        reviewSentAt: null,
        providerCustomerId: null,
        paymentMethodId: null,
        balanceDueDate: i.quote.payment.balanceDueDate,
        cancellation: null,
        cancellationSentAt: null,
      };
      db.reservations.push(r);
      return r;
    }, true);
  }
  getByRef(ref: string) {
    return this.tx((db) => db.reservations.find((r) => r.ref === ref) ?? null);
  }
  getById(id: string) {
    return this.tx((db) => db.reservations.find((r) => r.id === id) ?? null);
  }
  saveGuest(id: string, guest: GuestDetails, extendMinutes: number) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id);
      if (!r || r.status !== "hold" || r.expiresAt! <= this.now()) return null;
      r.guest = guest;
      const ext = new Date(Date.now() + extendMinutes * 60_000).toISOString();
      if (ext > r.expiresAt!) r.expiresAt = ext;
      return r;
    }, true);
  }
  setPaymentProfile(id: string, p: { customerId?: string | null; paymentMethodId?: string | null }) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id);
      if (!r) return;
      if (p.customerId) r.providerCustomerId = p.customerId;
      if (p.paymentMethodId) r.paymentMethodId = p.paymentMethodId;
    }, true);
  }
  confirmPaid(id: string) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id);
      if (!r || !["hold", "expired", "confirmed"].includes(r.status)) return null;
      if (r.status !== "confirmed") {
        const clash =
          db.reservations.some((o) => o.id !== r.id && this.active(o) && this.overlaps(this.range(o), this.range(r))) ||
          db.blocks.some((b) => this.overlaps(b, this.range(r)));
        if (clash) return null;
        r.status = "confirmed";
        r.confirmedAt = this.now();
        r.expiresAt = null;
      }
      return r;
    }, true);
  }
  cancel(id: string, c: Cancellation) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id);
      if (!r || r.status === "cancelled") return null;
      Object.assign(r, { status: "cancelled", cancelledAt: this.now(), expiresAt: null, cancellation: c });
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
        if (r.status === "hold" && r.expiresAt! <= this.now()) {
          r.status = "expired";
          n++;
        }
      }
      return n;
    }, true);
  }
  createPayment(p: Parameters<BookingStore["createPayment"]>[0]) {
    return this.tx((db) => {
      if (db.payments.some((x) => x.providerRef === p.providerRef)) throw new Error("duplicate provider_ref");
      if (p.kind === "balance" && ["pending", "succeeded"].includes(p.status) && db.payments.some((x) => x.reservationId === p.reservationId && x.kind === "balance" && ["pending", "succeeded"].includes(x.status)))
        throw new Error("a live balance payment already exists");
      const row: Payment = { ...p, id: crypto.randomUUID(), refundedCents: 0, failure: p.failure ?? null, createdAt: this.now(), updatedAt: this.now() };
      db.payments.push(row);
      return row;
    }, true);
  }
  getPayment(providerRef: string) {
    return this.tx((db) => db.payments.find((p) => p.providerRef === providerRef) ?? null);
  }
  listPayments(reservationId: string) {
    return this.tx((db) => db.payments.filter((p) => p.reservationId === reservationId));
  }
  updatePayment(providerRef: string, patch: Partial<Pick<Payment, "status" | "refundedCents" | "failure" | "amountCents">>) {
    return this.tx((db) => {
      const p = db.payments.find((x) => x.providerRef === providerRef);
      if (!p) return null;
      Object.assign(p, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updatedAt: this.now() });
      return p;
    }, true);
  }
  transitionPayment(providerRef: string, from: PaymentStatus[], patch: Partial<Pick<Payment, "status" | "failure">>) {
    return this.tx((db) => {
      const p = db.payments.find((x) => x.providerRef === providerRef);
      if (!p || !from.includes(p.status)) return null;
      Object.assign(p, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updatedAt: this.now() });
      return p;
    }, true);
  }
  recordEvent(id: string, provider: string, type: string) {
    return this.tx((db) => {
      const e = db.events.find((x) => x.id === id);
      if (e) return !e.processedAt;
      db.events.push({ id, provider, type, processedAt: null });
      return true;
    }, true);
  }
  markEventProcessed(id: string) {
    return this.tx((db) => {
      const e = db.events.find((x) => x.id === id);
      if (e) e.processedAt = this.now();
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
    const today = this.now().slice(0, 10);
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
      db.reservations.filter(
        (r) => r.status === "confirmed" && (kind === "preArrival" ? r.checkIn === date && !r.preArrivalSentAt : r.checkOut === date && !r.reviewSentAt),
      ),
    );
  }
  private emailKey = (kind: EmailKind) =>
    ({ confirmation: "confirmationSentAt", preArrival: "preArrivalSentAt", review: "reviewSentAt", cancellation: "cancellationSentAt" })[kind];
  markEmailSent(id: string, kind: EmailKind) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id) as Record<string, unknown> | undefined;
      if (r) r[this.emailKey(kind)] = this.now();
    }, true);
  }
  claimEmail(id: string, kind: EmailKind) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id) as Record<string, unknown> | undefined;
      if (!r || r[this.emailKey(kind)]) return false;
      r[this.emailKey(kind)] = this.now();
      return true;
    }, true);
  }
  releaseEmail(id: string, kind: EmailKind) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id) as Record<string, unknown> | undefined;
      if (r) r[this.emailKey(kind)] = null;
    }, true);
  }
  balancesDue(date: ISODate) {
    return this.tx((db) =>
      db.reservations.filter(
        (r) =>
          r.status === "confirmed" &&
          !!r.balanceDueDate &&
          r.balanceDueDate <= date &&
          r.checkIn > date &&
          !db.payments.some((p) => p.reservationId === r.id && p.kind === "balance" && ["pending", "succeeded", "failed"].includes(p.status)),
      ),
    );
  }
  securityHoldsToPlace(today: ISODate, releaseDays: number) {
    return this.tx((db) =>
      db.reservations.filter(
        (r) =>
          r.status === "confirmed" &&
          !!r.paymentMethodId &&
          r.checkIn <= today &&
          addDays(r.checkOut, releaseDays) > today &&
          !db.payments.some(
            (p) => p.reservationId === r.id && p.kind === "security_deposit" && ["pending", "authorized", "captured", "failed"].includes(p.status),
          ),
      ),
    );
  }
  securityHoldsToRelease(today: ISODate, releaseDays: number) {
    return this.tx((db) =>
      db.payments.filter((p) => {
        const r = db.reservations.find((x) => x.id === p.reservationId);
        return p.kind === "security_deposit" && p.status === "authorized" && !!r && (addDays(r.checkOut, releaseDays) <= today || r.status === "cancelled");
      }),
    );
  }
  abandonedPayments() {
    return this.tx((db) =>
      db.payments.filter((p) => {
        const r = db.reservations.find((x) => x.id === p.reservationId);
        return (p.status === "pending" || p.status === "failed") && (p.kind === "deposit" || p.kind === "full") && r?.status === "expired";
      }),
    );
  }
  loadConfig() {
    return this.tx((db) => db.config ?? null);
  }

  listReservations({ scope, today, q }: { scope: ReservationScope; today: ISODate; q?: string }) {
    const needle = q?.toLowerCase();
    return this.tx((db) => {
      const list = db.reservations.filter((r) => {
        const inScope =
          scope === "all"
            ? ["confirmed", "cancelled", "hold"].includes(r.status)
            : scope === "upcoming"
              ? r.status === "confirmed" && r.checkOut > today
              : scope === "pending"
                ? r.status === "hold" && r.expiresAt! > this.now()
              : scope === "past"
                ? r.status === "confirmed" && r.checkOut <= today
                : r.status === "cancelled";
        const match = !needle || [r.ref, r.guest?.name, r.guest?.email].some((v) => v?.toLowerCase().includes(needle));
        return inScope && match;
      });
      const by = (f: (r: Reservation) => string, dir = 1) => (a: Reservation, b: Reservation) => (f(a) < f(b) ? -dir : f(a) > f(b) ? dir : 0);
      if (scope === "upcoming") list.sort(by((r) => r.checkIn));
      else if (scope === "pending") list.sort(by((r) => r.expiresAt ?? ""));
      else if (scope === "past") list.sort(by((r) => r.checkIn, -1));
      else if (scope === "cancelled") list.sort(by((r) => r.cancelledAt ?? "", -1));
      else list.sort(by((r) => r.createdAt, -1));
      return list.slice(0, 500);
    });
  }
  allPayments() {
    return this.tx((db) => db.payments);
  }
  private blockId = (b: FileDb["blocks"][number]) => b.id ?? `${b.source}:${b.uid}`;
  listBlocks(from: ISODate, to: ISODate) {
    return this.tx((db) =>
      db.blocks
        .filter((b) => b.end > from && b.start < to)
        .sort((a, b) => (a.start < b.start ? -1 : 1))
        .map((b) => ({ id: this.blockId(b), source: b.source, uid: b.uid, start: b.start, end: b.end, summary: b.summary || null })),
    );
  }
  addManualBlock(start: ISODate, end: ISODate, summary: string) {
    return this.tx((db) => {
      if (end <= start) throw new Error("invalid range");
      const want = { start, end };
      if (db.reservations.some((r) => this.active(r) && this.overlaps(this.range(r), want))) return "booked" as const;
      const b = { id: crypto.randomUUID(), source: "manual", uid: crypto.randomUUID(), start, end, summary };
      db.blocks.push(b);
      return { id: b.id, source: "manual", uid: b.uid, start, end, summary: summary || null };
    }, true);
  }
  extendHold(id: string, until: string) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === id);
      if (!r || r.status !== "hold" || r.expiresAt! <= this.now()) return null;
      r.expiresAt = until;
      return r;
    }, true);
  }
  removeManualBlock(id: string) {
    return this.tx((db) => {
      const before = db.blocks.length;
      db.blocks = db.blocks.filter((b) => !(b.source === "manual" && this.blockId(b) === id));
      return db.blocks.length < before;
    }, true);
  }
  saveConfig(config: unknown | null) {
    return this.tx((db) => {
      db.config = config;
    }, true);
  }
  listNotes(reservationId: string) {
    return this.tx((db) => db.notes.filter((n) => n.reservationId === reservationId));
  }
  addNote(reservationId: string, body: string) {
    return this.tx((db) => {
      const n = { id: crypto.randomUUID(), reservationId, body, createdAt: this.now() };
      db.notes.push(n);
      return n;
    }, true);
  }
  saveLoginToken(tokenHash: string, email: string, expiresAt: string) {
    return this.tx((db) => {
      db.loginTokens = db.loginTokens.filter((t) => t.expiresAt > new Date(Date.now() - 86_400_000).toISOString());
      db.loginTokens.push({ tokenHash, email, expiresAt, usedAt: null });
    }, true);
  }
  consumeLoginToken(tokenHash: string) {
    return this.tx((db) => {
      const t = db.loginTokens.find((x) => x.tokenHash === tokenHash);
      if (!t || t.usedAt || t.expiresAt <= this.now()) return null;
      t.usedAt = this.now();
      return t.email;
    }, true);
  }
  purgeAbandoned(before: string) {
    return this.tx((db) => {
      const keep = db.reservations.filter((r) => !(r.status === "expired" && r.createdAt < before && !db.payments.some((p) => p.reservationId === r.id)));
      const n = db.reservations.length - keep.length;
      db.reservations = keep;
      return n;
    }, true);
  }
  listSitePhotos() {
    return this.tx((db) => db.sitePhotos);
  }
  saveSitePhoto(p: Omit<SitePhoto, "updatedAt">) {
    return this.tx((db) => {
      db.sitePhotos = db.sitePhotos.filter((x) => x.slot !== p.slot);
      db.sitePhotos.push({ ...p, updatedAt: this.now() });
    }, true);
  }
  deleteSitePhoto(slot: string) {
    return this.tx((db) => {
      const found = db.sitePhotos.find((x) => x.slot === slot) ?? null;
      db.sitePhotos = db.sitePhotos.filter((x) => x.slot !== slot);
      return found;
    }, true);
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
