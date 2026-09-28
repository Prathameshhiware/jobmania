-- JoBmania schema. Run once in the Supabase SQL editor.
-- Integrity rule: a column is NULL when the source did not state the value.
-- Nothing in this schema is ever inferred, estimated or filled in.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- jobs
create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),
  short_id        text not null unique,
  slug            text not null unique,
  dedupe_key      text not null,

  -- provenance: where every field on this row came from
  source          text not null,                  -- 'foundthejob' | 'greenhouse' | 'lever' | ...
  source_uid      text not null,                  -- the source's own id for this posting
  source_url      text,                           -- the page we read it from
  canonical_url   text,                           -- the employer's own listing, when resolved
  first_seen_at   timestamptz not null default now(),
  last_checked_at timestamptz,                    -- last time we tested the apply link
  last_verified_at timestamptz,                   -- last time that test passed

  -- employer and role (extracted verbatim)
  company_name    text not null,
  company_slug    text not null,
  title           text not null,

  -- location
  locations       jsonb not null default '[]'::jsonb,
  city_primary    text,
  is_remote       boolean not null default false,
  lat             double precision,
  lng             double precision,

  -- eligibility: NULL means the employer did not state it
  exp_min         numeric,
  exp_max         numeric,
  qualification   text,
  eligible_batches int[],

  -- pay: NULL means not disclosed. Never synthesised. See README.
  salary_min      numeric,
  salary_max      numeric,
  salary_currency text,
  salary_period   text,

  -- facets
  hiring_type     text not null default 'regular'
                  check (hiring_type in ('regular','walk-in','off-campus','internship')),
  experience_level text check (experience_level in ('fresher','0-2','2-5','5-10','10+')),
  work_mode       text check (work_mode in ('onsite','hybrid','remote')),

  -- walk-in specifics
  walkin_start    date,
  walkin_end      date,
  walkin_time     text,
  walkin_venue    text,

  -- the employer's own description, only when fetched from their ATS.
  -- never copied from an aggregator.
  description_html   text,
  description_source text,

  posted_at       timestamptz not null,
  valid_through   timestamptz not null,           -- required before a row may go live

  status          text not null default 'needs_review'
                  check (status in ('live','expired','dead_link','needs_review','rejected')),
  review_reason   text,

  scam_flags      text[],
  report_count    int not null default 0,

  apply_url       text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (source, source_uid)
);

create index if not exists jobs_status_posted_idx  on public.jobs (status, posted_at desc);
create index if not exists jobs_dedupe_idx         on public.jobs (dedupe_key);
create index if not exists jobs_city_idx           on public.jobs (city_primary) where status = 'live';
create index if not exists jobs_company_idx        on public.jobs (company_slug) where status = 'live';
create index if not exists jobs_hiring_type_idx    on public.jobs (hiring_type) where status = 'live';
create index if not exists jobs_valid_through_idx  on public.jobs (valid_through) where status = 'live';
create index if not exists jobs_title_trgm_idx     on public.jobs using gin (title gin_trgm_ops);
create index if not exists jobs_company_trgm_idx   on public.jobs using gin (company_name gin_trgm_ops);

-- full-text search over title + company
alter table public.jobs
  add column if not exists search tsvector
  generated always as (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(company_name,'') || ' ' || coalesce(city_primary,''))
  ) stored;
create index if not exists jobs_search_idx on public.jobs using gin (search);

-- a row may only be live if it has an expiry and an apply route
alter table public.jobs drop constraint if exists jobs_live_requires_expiry;
alter table public.jobs add constraint jobs_live_requires_expiry
  check (status <> 'live' or (valid_through is not null and apply_url is not null));

-- ------------------------------------------------- per-source poll cursor
create table if not exists public.source_state (
  source        text primary key,
  cursor_ts     timestamptz,                      -- newest item we have ingested
  last_run_at   timestamptz,
  last_ok_at    timestamptz,
  last_error    text,
  runs          int not null default 0,
  items_seen    int not null default 0,
  items_added   int not null default 0
);

-- ------------------------------------------- every source that saw this job
create table if not exists public.job_sources (
  job_id      uuid not null references public.jobs(id) on delete cascade,
  source      text not null,
  source_uid  text not null,
  source_url  text,
  seen_at     timestamptz not null default now(),
  primary key (job_id, source, source_uid)
);

-- ------------------------------------------------------------ updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------- RLS
alter table public.jobs         enable row level security;
alter table public.source_state enable row level security;
alter table public.job_sources  enable row level security;

-- the public site reads live rows only; everything else needs the service role
drop policy if exists jobs_public_read on public.jobs;
create policy jobs_public_read on public.jobs
  for select to anon, authenticated using (status = 'live');

-- no anon policy on source_state or job_sources: service role only.

-- ---------------------------------------------------------------- grants
-- RLS and GRANTs are two separate layers. service_role bypasses RLS but it
-- still needs ordinary table privileges, and newer Supabase projects do not
-- grant these automatically when a table is created. Without this block every
-- request fails with 42501 "permission denied", even with a valid key.
grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- the public site reads with the anon key; the RLS policy above still limits
-- it to status = 'live'.
grant select on public.jobs to anon, authenticated;

-- anything added to this schema later gets the same treatment
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
