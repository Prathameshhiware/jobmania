-- Keep where the listings come from out of reach of the public key.
-- Run once in the Supabase SQL editor.
--
-- The site already gives nothing away: no page names a source, and every apply
-- link points at the employer rather than at an intermediary. This closes the
-- one remaining path. `jobs` is readable by the anon role, and five of its
-- columns record provenance:
--
--   source              which pipeline brought the listing in
--   source_uid          that pipeline's own id for it
--   source_url          the page it was read from
--   dedupe_key          company|role|city, which leaks nothing on its own but
--                       makes two catalogues trivially comparable
--   description_source  which employer system the write-up came from
--
-- Row level security decides which ROWS the anon role may read. It has nothing
-- to say about COLUMNS, so a client holding the anon key could have selected
-- those five from a live row. Nothing published ever exposed that key, but the
-- fix is cheap and removes the question.
--
-- Column grants are the mechanism: revoke the blanket privilege, then grant
-- back only the columns the site actually renders. After this, a select * by
-- the anon role fails rather than returning provenance, which is the right way
-- round — a mistake becomes an error instead of a quiet leak.
--
-- The service role is untouched. The ingest pipeline needs every column.

revoke select on public.jobs from anon, authenticated;

grant select (
  id, short_id, slug, canonical_url,
  first_seen_at, last_checked_at, last_verified_at,
  company_name, company_slug, title,
  locations, city_primary, is_remote, lat, lng,
  exp_min, exp_max, qualification, eligible_batches,
  salary_min, salary_max, salary_currency, salary_period,
  hiring_type, experience_level, work_mode,
  walkin_start, walkin_end, walkin_time, walkin_venue,
  description_html, posted_at, valid_through,
  status, review_reason, scam_flags, report_count,
  apply_url, created_at, updated_at
) on public.jobs to anon, authenticated;

-- job_sources and source_state already have no anon policy and no grant, so
-- they stay service-role only. Stated here so a future reader does not assume
-- this file is the whole story.

-- ------------------------------------------------------------------ checking
-- What the public key may now read. The five provenance columns should be absent:
--   select column_name from information_schema.column_privileges
--   where table_name = 'jobs' and grantee = 'anon' order by column_name;
--
-- And it should refuse a wildcard read:
--   set role anon; select * from public.jobs limit 1;   -- permission denied
--   reset role;
