-- The remaining two schedules, moved off GitHub.
-- Run once in the Supabase SQL editor, after db/009-generated-posts.sql.
--
-- Nothing in this file needs editing. Both jobs reuse the secret the poll
-- already stores in Vault as 'jobmania_ingest_secret', so there is no token to
-- create, paste, or renew. If db/005 has not been run on this database, run it
-- first: it is the one that creates that secret.
--
-- Why not GitHub Actions. Its scheduler deprioritises cron on free runners:
-- a workflow asking for every five minutes actually ran every three to six
-- hours. Vercel's own cron is once a day on the Hobby plan. pg_cron runs inside
-- this database and has kept time to the second here across thousands of runs.
--
-- The origin header is not decoration. Astro refuses a cross-site POST, and a
-- call from a database has no origin of its own, so it states the site's. The
-- bearer token is what actually protects the endpoints.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------- the weekly roundup
-- Sunday 10:00 am IST. pg_cron reads the expression in UTC, which is why it is
-- written as 04:30. The endpoint builds the post from the jobs
-- table and the news allowlist and writes it to generated_posts, where the site
-- reads it; there is no deploy and no commit, so it is live within seconds.
--
-- Idempotent: a post already existing for that date is a success, not an error,
-- so a retry or a double fire cannot publish twice.
select cron.schedule(
  'jobmania-weekly-roundup',
  '30 4 * * 0',
  $$
  select net.http_post(
    url     := 'https://jobmania.dpdns.org/api/roundup',
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

-- --------------------------------------------------------- the freshness pass
-- Every 30 minutes. Expires anything past its closing date, re-tests the forty
-- least recently checked apply links, and photographs the table once a day for
-- the roundup's week-on-week figures.
--
-- This used to be one daily run of 250 links. Forty-eight passes of forty is
-- about 1,900 re-tests a day instead, and a listing whose deadline has passed
-- now comes off within half an hour rather than within a day.
select cron.schedule(
  'jobmania-expire',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := 'https://jobmania.dpdns.org/api/expire',
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
-- All three jobs, including the poll from db/005:
--   select jobid, jobname, schedule, active from cron.job order by jobname;
--
-- Did they fire? job_run_details keys on jobid, so it has to be joined:
--   select j.jobname, d.start_time, d.status, d.return_message
--   from cron.job_run_details d
--   join cron.job j on j.jobid = d.jobid
--   order by d.start_time desc limit 20;
--
-- What did the endpoints answer? 200 is good. 401 means the secret in Vault
-- does not match INGEST_SECRET in Vercel. 403 means the origin header is wrong.
--   select created, status_code, content
--   from net._http_response order by created desc limit 10;
--
-- Fire the roundup once by hand, without waiting for Sunday. Safe: it will
-- answer {"published": false, "reason": "already exists"} if this week is done.
--   select net.http_post(
--     url     := 'https://jobmania.dpdns.org/api/roundup',
--     headers := jsonb_build_object(
--       'authorization', 'Bearer ' || (
--         select decrypted_secret from vault.decrypted_secrets
--         where name = 'jobmania_ingest_secret'),
--       'origin', 'https://jobmania.dpdns.org',
--       'content-type', 'application/json'),
--     body := '{}'::jsonb, timeout_milliseconds := 55000);
--
-- To pause one:  select cron.unschedule('jobmania-expire');
