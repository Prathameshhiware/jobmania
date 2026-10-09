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
-- Read the verdict. This is the one that matters: the endpoint always
-- answers 200, because a health check returning 500 when the site is broken
-- cannot be told apart from one that is broken itself. So the status_code
-- tells you the call arrived, and the body tells you what it found.
--
--   select created, status_code, content::json->>'verdict' as verdict
--   from net._http_response order by created desc limit 3;
--
-- Note status_code, not status. The column on net._http_response is
-- status_code; cron.job_run_details is the one with a status column, and
-- mixing them up gives "column status does not exist".
--
-- Whether the job itself fired and completed, which is a different question
-- from what it found:
--
--   select start_time, status, return_message
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'jobmania-health')
--   order by start_time desc limit 10;
--
-- To pause it:   select cron.unschedule('jobmania-health');
