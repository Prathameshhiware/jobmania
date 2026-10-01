-- A daily snapshot of the table, so the site can say what changed over time.
-- Run once in the Supabase SQL editor.
--
-- Why this exists. Every count on the site is computed live from `jobs`, which
-- answers "how many now" perfectly and "how many last Tuesday" not at all. A
-- weekly roundup that cannot compare itself to last week has nothing to report
-- beyond a list, and a trend line needs points behind it.
--
-- Written once a day by the expire pass, which already runs daily and already
-- holds the service role key. One row per day, upserted, so a re-run corrects
-- the day rather than duplicating it.
--
-- Deliberately not a log of every change. This is a photograph of the table
-- taken at the same time each day. Fine detail about individual listings is
-- already in `jobs` and in `job_sources`.

create table if not exists public.daily_stats (
  day             date primary key,

  live            int not null default 0,
  needs_review    int not null default 0,
  expired         int not null default 0,
  dead_link       int not null default 0,

  -- first_seen_at inside the last 24h, so a true count of what arrived
  added_today     int not null default 0,

  live_walkins    int not null default 0,
  live_freshers   int not null default 0,
  live_remote     int not null default 0,
  with_description int not null default 0,

  -- {"Hyderabad": 99, "Bengaluru": 46, ...} and {"walk-in": 44, ...}
  by_city         jsonb not null default '{}'::jsonb,
  by_type         jsonb not null default '{}'::jsonb,

  recorded_at     timestamptz not null default now()
);

comment on table public.daily_stats is
  'One photograph of the jobs table per day, written by the daily expire pass. Exists so trends can be stated rather than guessed: a weekly roundup needs last week to compare against.';

alter table public.daily_stats enable row level security;

-- Public read. These are aggregate counts with nothing identifying in them, and
-- the site renders them in the weekly roundup.
drop policy if exists daily_stats_public_read on public.daily_stats;
create policy daily_stats_public_read on public.daily_stats
  for select to anon, authenticated using (true);

grant select on public.daily_stats to anon, authenticated;
grant all privileges on public.daily_stats to service_role;

-- Check it is filling up:
--   select day, live, added_today, dead_link from public.daily_stats
--   order by day desc limit 14;
