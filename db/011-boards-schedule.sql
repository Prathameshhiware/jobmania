-- Hourly poll of the employer job boards.
-- Run once in the Supabase SQL editor, after db/010-schedules.sql.
--
-- Nothing in this file needs editing. It reuses the secret already in Vault as
-- 'jobmania_ingest_secret', the same one the other three jobs use.
--
-- Hourly rather than every minute, because a company does not post a role every
-- minute and each pass reads 25 boards in full. The pass does two things: it
-- ingests roles published since the last run, and it retires any listing of
-- ours that has disappeared from its board, which is how a filled job comes off
-- this site without anyone noticing it was filled.
--
-- Times are IST throughout this project. pg_cron reads the expression in UTC,
-- but '7 * * * *' is hourly either way; the 7 just keeps it off the hour, where
-- every other scheduled job on the internet is already queueing.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'jobmania-boards',
  '7 * * * *',
  $$
  select net.http_post(
    url     := 'https://jobmania.dpdns.org/api/boards',
    headers := jsonb_build_object(
      'authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'jobmania_ingest_secret'
      ),
      'origin',       'https://jobmania.dpdns.org',
      'content-type', 'application/json'
    ),
    body        := '{}'::jsonb,
    timeout_milliseconds := 58000
  );
  $$
);

-- ------------------------------------------------------------------ checking
-- All four jobs:
--   select jobid, jobname, schedule, active from cron.job order by jobname;
--
-- What did the endpoint answer? "added" is new roles, "retired" is roles the
-- employer has stopped listing:
--   select created, status_code, content
--   from net._http_response order by created desc limit 5;
--
-- How the source is doing:
--   select last_run_at, last_ok_at, runs, items_added, last_error
--   from public.source_state where source = 'greenhouse';
--
-- To pause: select cron.unschedule('jobmania-boards');
