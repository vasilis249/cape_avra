-- Payments (Phase 4): one row per charge/authorisation, webhook event log,
-- saved customer/card on the reservation. RLS on, no public policies.

alter table public.reservations
  add column if not exists provider_customer_id   text,
  add column if not exists payment_method_id      text,
  add column if not exists balance_due_date       date,
  add column if not exists cancellation           jsonb,   -- who, when, refund % and amount
  add column if not exists cancellation_sent_at   timestamptz;

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete restrict,
  kind            text not null check (kind in ('deposit', 'full', 'balance', 'security_deposit')),
  provider        text not null,
  provider_ref    text not null unique,                    -- e.g. Stripe PaymentIntent id
  amount_cents    integer not null check (amount_cents > 0),
  currency        text not null default 'EUR',
  status          text not null check (status in ('pending', 'succeeded', 'failed', 'canceled', 'authorized', 'captured')),
  refunded_cents  integer not null default 0 check (refunded_cents >= 0),
  failure         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint payments_refund_le_amount check (refunded_cents <= amount_cents)
);
create index if not exists payments_reservation_idx on public.payments (reservation_id);
-- at most one live (pending/succeeded) balance charge per reservation
create unique index if not exists payments_one_balance_idx on public.payments (reservation_id)
  where kind = 'balance' and status in ('pending', 'succeeded');

-- Webhook idempotency: an event id is processed once.
create table if not exists public.payment_events (
  id            text primary key,                          -- provider event id (evt_…)
  provider      text not null,
  type          text not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);

alter table public.payments       enable row level security;
alter table public.payment_events enable row level security;

-- Confirm a reservation once its first payment succeeded. Normally the hold is still
-- active; if it expired meanwhile we still confirm when the dates are free (the
-- exclusion constraint makes that safe). Returns null when the dates were taken.
create or replace function public.confirm_paid_reservation(p_id uuid)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare r public.reservations;
begin
  begin
    update reservations
       set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), expires_at = null
     where id = p_id and status in ('hold', 'expired', 'confirmed')
       and not exists (
         select 1 from calendar_blocks b
          where daterange(b.start_date, b.end_date, '[)') && daterange(reservations.check_in, reservations.check_out, '[)'))
     returning * into r;
  exception when exclusion_violation then
    return null;
  end;
  return r;
end $$;

revoke all on function public.confirm_paid_reservation(uuid) from public, anon, authenticated;
