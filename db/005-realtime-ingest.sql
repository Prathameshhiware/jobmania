-- Near-real-time polling. Run once in the Supabase SQL editor.
--
-- Why this exists. The poll used to run on GitHub Actions asking for every five
-- minutes. GitHub deprioritises frequent scheduled workflows on free runners,
-- so the real interval was three to six hours: openings appeared on the source
-- and reached this site a quarter of a day later. Vercel's own cron is once a
-- day on the Hobby plan. pg_cron runs inside this database on a schedule it
-- actually keeps, and pg_net makes the call.
--
-- The GitHub workflow still runs, hourly, as a safety net for when this is
-- failing and nobody has noticed.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------- the secret
-- Kept in Vault rather than written into the job definition, so it is not
-- sitting in cron.job in plain text for anyone with database access to read.
--
-- REPLACE __INGEST_SECRET__ with the value Claude gave you, keeping the quotes.
select vault.create_secret('__INGEST_SECRET__', 'jobmania_ingest_secret');

-- ------------------------------------------------------------------ the job
-- Every minute. The endpoint is cheap when nothing is new: it asks the source
-- for anything past the stored cursor, gets an empty list, and writes nothing.
--
-- The origin header is not decoration. Astro refuses a cross-site POST, and a
-- call from a database has no origin of its own, so it states the site's. The
-- bearer token is what actually protects the endpoint.
select cron.schedule(
  'jobmania-poll',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://jobmania.dpdns.org/api/ingest',
    headers := jsonb_build_object(
      'authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'jobmania_ingest_secret'
      ),
      'origin',       'https://jobmania.dpdns.org',
      'content-type', 'application/json'
    ),
    body        := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- ------------------------------------------------------------------ checking
-- Is the job scheduled?
--   select jobid, schedule, jobname, active from cron.job;
--
-- Did the last runs succeed? (pg_cron's own log)
--   select start_time, status, return_message
--   from cron.job_run_details
--   where jobname = 'jobmania-poll'
--   order by start_time desc limit 10;
--
-- What did the endpoint actually answer? (pg_net's response log)
--   select created, status_code, content
--   from net._http_response
--   order by created desc limit 10;
--
-- To pause it:    select cron.unschedule('jobmania-poll');
-- To change the secret later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'jobmania_ingest_secret'),
--     'new-secret-value'
--   );
