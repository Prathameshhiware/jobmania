-- The daily health check.
--
-- Runs from pg_cron for the same reason everything else does: the clock
-- belongs somewhere that is always awake, and that is the database, not a
-- laptop and not a CI runner that deprioritises free cron.
--
-- 02:30 UTC is 08:00 IST — half an hour before anyone looks at the site, and
-- well clear of the expire pass on the half hour and the boards on :07.
--
-- ?fix=1 lets it retire listings whose deadline has passed. That is the only
-- change it makes, it is what the expire pass does anyway, and the endpoint
-- refuses if more than fifty rows look expired at once, on the grounds that
-- that is a clock problem rather than a real sweep.
--
-- Everything else it only reports. Nothing here edits code.
--
-- Run this once in the Supabase SQL editor.

select cron.unschedule('jobmania-health')
where exists (select 1 from cron.job where jobname = 'jobmania-health');

select cron.schedule(
  'jobmania-health',
  '30 2 * * *',                      -- 08:00 IST, daily
  $$
  select net.http_get(
    url     := 'https://jobmania.dpdns.org/api/health?fix=1',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret
                    from vault.decrypted_secrets
                    where name = 'jobmania_ingest_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- Check it registered:
--   select jobname, schedule, active from cron.job order by jobname;
--
-- See what it has been doing. A failure here means the request did not
-- complete; the verdict itself is in the response body and in the Vercel
-- function log, because a health check that returns 500 when the site is
-- broken cannot be told apart from one that is broken itself.
--
--   select start_time, status, return_message
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'jobmania-health')
--   order by start_time desc limit 10;
--
-- To pause it:   select cron.unschedule('jobmania-health');
