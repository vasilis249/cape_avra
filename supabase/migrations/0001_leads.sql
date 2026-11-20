-- Early booking requests and contact messages from the public website.
-- Inserts happen server-side with the service-role key; RLS denies everything
-- else (no policies = no access for anon/authenticated clients).

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  kind              text not null check (kind in ('waitlist', 'contact')),
  locale            text not null check (locale in ('en', 'el', 'it', 'de')),
  name              text not null check (char_length(name) between 2 and 120),
  email             text not null check (char_length(email) <= 200),
  phone             text check (char_length(phone) <= 40),
  check_in          date,
  check_out         date,
  flexible          boolean,
  guests            smallint check (guests between 1 and 20),
  message           text check (char_length(message) <= 4000),
  marketing_consent boolean not null default false,
  privacy_version   text not null,
  status            text not null default 'new' check (status in ('new', 'contacted', 'converted', 'archived')),
  notes             text,
  constraint leads_dates check (check_out is null or check_in is null or check_out > check_in)
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_kind_status_idx on public.leads (kind, status);

alter table public.leads enable row level security;
-- Intentionally no policies: only the service role (server) can read or write.
-- The admin panel (Phase 5) will add policies for the authenticated owner.

comment on table public.leads is 'Website enquiries: early booking requests (waitlist) and contact messages.';
