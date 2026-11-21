-- Admin panel (Phase 5): owner notes on bookings, single-use login links, photo overrides.
-- RLS on, no public policies: only the server (DATABASE_URL / service role) reads or writes.

create table if not exists public.reservation_notes (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  body            text not null check (length(body) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index if not exists reservation_notes_res_idx on public.reservation_notes (reservation_id, created_at);

-- Magic-link sign-in: only the SHA-256 of the emailed token is stored; a token works once.
create table if not exists public.admin_login_tokens (
  token_hash  text primary key,
  email       text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Photos uploaded in the admin replace a registry photo (slot = photo id) or fill an interior
-- space (slot = "space-<id>"). Files live in storage; this row is what the site renders.
create table if not exists public.site_photos (
  slot        text primary key,
  path        text not null,
  width       integer not null check (width > 0),
  height      integer not null check (height > 0),
  blur        text not null,
  color       text not null,
  alt         jsonb not null,          -- { "en": "...", "el": "..." }
  focal       text,
  updated_at  timestamptz not null default now()
);

alter table public.reservation_notes  enable row level security;
alter table public.admin_login_tokens enable row level security;
alter table public.site_photos        enable row level security;

-- Manual block that refuses to cover a confirmed booking or an active hold.
create or replace function public.add_manual_block(p_start date, p_end date, p_summary text)
returns public.calendar_blocks
language plpgsql security definer set search_path = public as $$
declare b public.calendar_blocks;
begin
  if p_end <= p_start then
    raise exception 'invalid range' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from reservations r
     where (r.status = 'confirmed' or (r.status = 'hold' and r.expires_at > now()))
       and daterange(r.check_in, r.check_out, '[)') && daterange(p_start, p_end, '[)')
  ) then
    raise exception 'booked' using errcode = 'P0001';
  end if;
  insert into calendar_blocks (source, uid, start_date, end_date, summary)
  values ('manual', gen_random_uuid()::text, p_start, p_end, nullif(p_summary, ''))
  returning * into b;
  return b;
end $$;

revoke all on function public.add_manual_block(date, date, text) from public, anon, authenticated;
