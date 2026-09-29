-- Migration 004 — visitor counter.
--
-- Counts distinct browsers, not page views: the API route sets a first-party
-- cookie and only increments when it is absent. No IP address, user agent or
-- any other identifier is stored — the table holds a single integer, which
-- keeps this clear of the DPDP Act's personal-data obligations entirely.
--
-- The counter starts at zero and counts real visits. It is never seeded with
-- a flattering opening number.
--
-- Safe to re-run.

create table if not exists public.site_counters (
  key        text primary key,
  value      bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.site_counters (key, value)
values ('visitors', 0)
on conflict (key) do nothing;

alter table public.site_counters enable row level security;

-- No direct table access for anon. The two functions below are the only way
-- in, so a visitor can add exactly one and read the total — nothing else.
create or replace function public.bump_visitor()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v bigint;
begin
  update public.site_counters
     set value = value + 1, updated_at = now()
   where key = 'visitors'
  returning value into v;
  return coalesce(v, 0);
end $$;

create or replace function public.get_visitors()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.site_counters where key = 'visitors'), 0)
$$;

revoke all on function public.bump_visitor() from public;
revoke all on function public.get_visitors() from public;
grant execute on function public.bump_visitor() to anon, authenticated;
grant execute on function public.get_visitors() to anon, authenticated;
