-- Booking engine: reservations (holds + bookings), calendar blocks (manual + iCal imports)
-- and the admin-editable booking configuration.
-- All tables: RLS on, no public policies. Only the server (service role) reads/writes.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- reservations
create table if not exists public.reservations (
  id                    uuid primary key default gen_random_uuid(),
  ref                   text not null unique,              -- shown to the guest, e.g. CA-7KQ2-9M
  token_hash            text not null,                     -- sha256 of the secret in the guest's link
  status                text not null check (status in ('hold', 'confirmed', 'cancelled', 'expired')),
  source                text not null default 'direct',
  check_in              date not null,
  check_out             date not null,
  guests                smallint not null check (guests between 1 and 20),
  locale                text not null default 'en' check (locale in ('en', 'el', 'it', 'de')),
  currency              text not null default 'EUR',
  total_cents           integer not null check (total_cents >= 0),
  quote                 jsonb not null,                    -- full price breakdown at the time of booking
  guest                 jsonb,                             -- name, email, phone, country, arrival time, message
  payment               jsonb,                             -- provider, status, references, amounts (Phase 4)
  expires_at            timestamptz,                       -- holds only
  created_at            timestamptz not null default now(),
  confirmed_at          timestamptz,
  cancelled_at          timestamptz,
  confirmation_sent_at  timestamptz,
  pre_arrival_sent_at   timestamptz,
  review_sent_at        timestamptz,
  notes                 text,
  constraint reservations_dates check (check_out > check_in),
  constraint reservations_hold_expiry check (status <> 'hold' or expires_at is not null),
  -- THE double-booking guard: no two active reservations may share a night.
  -- '[)' = check-out day is free for the next arrival.
  constraint reservations_no_overlap exclude using gist (
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('hold', 'confirmed'))
);

create index if not exists reservations_status_dates_idx on public.reservations (status, check_in, check_out);
create index if not exists reservations_check_in_idx on public.reservations (check_in) where status = 'confirmed';

-- ------------------------------------------------------------- calendar blocks
-- Nights that cannot be booked: manual blocks (owner) and events imported from
-- Airbnb / Booking.com iCal feeds. end_date is exclusive (the check-out day).
create table if not exists public.calendar_blocks (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,                -- 'manual', 'airbnb', 'booking', ...
  uid         text not null,                -- iCal UID (or generated for manual blocks)
  start_date  date not null,
  end_date    date not null,
  summary     text,
  updated_at  timestamptz not null default now(),
  constraint calendar_blocks_dates check (end_date > start_date),
  unique (source, uid)
);
create index if not exists calendar_blocks_dates_idx on public.calendar_blocks (start_date, end_date);

-- -------------------------------------------------------------- booking config
-- One row holding the admin-edited copy of content/booking.ts (validated in the app).
create table if not exists public.booking_config (
  id          smallint primary key default 1 check (id = 1),
  config      jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.reservations    enable row level security;
alter table public.calendar_blocks enable row level security;
alter table public.booking_config  enable row level security;

-- ------------------------------------------------------------------ functions
-- Create a hold atomically: expire stale holds, refuse blocked nights, insert.
-- The exclusion constraint catches any race with another booking.
create or replace function public.create_hold(
  p_ref text, p_token_hash text, p_check_in date, p_check_out date, p_guests int,
  p_locale text, p_total_cents int, p_quote jsonb, p_hold_minutes int
) returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  r public.reservations;
begin
  update reservations set status = 'expired'
   where status = 'hold' and expires_at <= now();

  if exists (
    select 1 from calendar_blocks b
     where daterange(b.start_date, b.end_date, '[)') && daterange(p_check_in, p_check_out, '[)')
  ) then
    raise exception 'unavailable' using errcode = 'P0001';
  end if;

  begin
    insert into reservations (ref, token_hash, status, check_in, check_out, guests, locale, total_cents, quote, expires_at)
    values (p_ref, p_token_hash, 'hold', p_check_in, p_check_out, p_guests, p_locale, p_total_cents, p_quote,
            now() + make_interval(mins => p_hold_minutes))
    returning * into r;
  exception when exclusion_violation then
    raise exception 'unavailable' using errcode = 'P0001';
  end;
  return r;
end $$;

-- Replace all blocks of one iCal source in a single transaction.
create or replace function public.replace_calendar_blocks(p_source text, p_events jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from calendar_blocks where source = p_source;
  insert into calendar_blocks (source, uid, start_date, end_date, summary)
  select p_source, e->>'uid', (e->>'start')::date, (e->>'end')::date, e->>'summary'
    from jsonb_array_elements(p_events) e
   where (e->>'end')::date > (e->>'start')::date
  on conflict (source, uid) do update
     set start_date = excluded.start_date, end_date = excluded.end_date,
         summary = excluded.summary, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Mark holds past their expiry; returns how many were released.
create or replace function public.expire_holds() returns integer
language sql security definer set search_path = public as $$
  with x as (update reservations set status = 'expired' where status = 'hold' and expires_at <= now() returning 1)
  select count(*)::int from x;
$$;

revoke all on function public.create_hold(text, text, date, date, int, text, int, jsonb, int) from public, anon, authenticated;
revoke all on function public.replace_calendar_blocks(text, jsonb) from public, anon, authenticated;
revoke all on function public.expire_holds() from public, anon, authenticated;
