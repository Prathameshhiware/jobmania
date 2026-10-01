-- Fires the Sunday roundup at 10:00 IST, from inside the database.
-- Run once in the Supabase SQL editor, after db/007-daily-stats.sql.
--
-- Why not just use GitHub's own schedule. GitHub deprioritises scheduled
-- workflows on free runners: the monitor asked for every five minutes and
-- actually ran every three to six hours. pg_cron keeps time to the second,
-- which we have watched it do, and a workflow_dispatch is not throttled the
-- way a schedule is. So the clock lives here and GitHub only does the work.
--
-- The workflow also carries its own Sunday schedule as a safety net. If this
-- job stops firing the post goes out late rather than never, and the generator
-- refuses to overwrite an existing file so the two triggers cannot collide.
--
-- 04:30 UTC is 10:00 IST. The Action takes roughly a minute to start, so the
-- post lands about 10:01.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------- the token
-- A GitHub fine-grained personal access token, scoped to this one repository,
-- with Actions permission set to read and write. Nothing else.
--
-- In Vault rather than in the job definition, so it is not sitting in cron.job
-- in plain text for anyone with database access to read.
--
-- REPLACE __GITHUB_TOKEN__ with the token, keeping the quotes.
select vault.create_secret('__GITHUB_TOKEN__', 'jobmania_github_token');

-- ------------------------------------------------------------------ the job
select cron.schedule(
  'jobmania-weekly-roundup',
  '30 4 * * 0',                                  -- Sunday 04:30 UTC = 10:00 IST
  $$
  select net.http_post(
    url     := 'https://api.github.com/repos/Prathameshhiware/jobmania/actions/workflows/roundup.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'jobmania_github_token'
      ),
      'Accept',        'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent',    'jobmania-scheduler',
      'Content-Type',  'application/json'
    ),
    body        := jsonb_build_object('ref', 'main'),
    timeout_milliseconds := 20000
  );
  $$
);

-- ------------------------------------------------------------------ checking
-- Is it scheduled?
--   select jobid, schedule, jobname, active from cron.job;
--
-- Did it fire? job_run_details keys on jobid, so it has to be joined:
--   select d.start_time, d.status, d.return_message
--   from cron.job_run_details d
--   join cron.job j on j.jobid = d.jobid
--   where j.jobname = 'jobmania-weekly-roundup'
--   order by d.start_time desc limit 5;
--
-- What did GitHub answer? 204 means accepted; 401 means the token is wrong or
-- expired; 404 usually means the token cannot see the repository.
--   select created, status_code, content
--   from net._http_response order by created desc limit 5;
--
-- Fire it once by hand to test, without waiting for Sunday:
--   select cron.schedule('roundup-test', '* * * * *', $$ ... same body ... $$);
--   select cron.unschedule('roundup-test');
--
-- To pause: select cron.unschedule('jobmania-weekly-roundup');
