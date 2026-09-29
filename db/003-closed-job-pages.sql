-- Migration 003 — let the site serve closed listings as pages.
--
-- Until now anon could read only status = 'live', so a closed job 404'd.
-- Someone following a bookmark, a shared link or a stale search result got
-- nothing useful. Widen the read to include the two CLOSED states so those
-- pages can say "this finished on 12 August, here are live alternatives".
--
-- needs_review and rejected stay private: those rows have not been vetted and
-- must never be public.
--
-- List queries still filter to 'live' explicitly, so nothing closed can leak
-- into the home page, a facet page or the sitemap.
--
-- Safe to re-run.

drop policy if exists jobs_public_read on public.jobs;
create policy jobs_public_read on public.jobs
  for select to anon, authenticated
  using (status in ('live', 'expired', 'dead_link'));
