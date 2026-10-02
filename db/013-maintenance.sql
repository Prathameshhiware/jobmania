-- Housekeeping for the scheduler's own logs.
-- Run once in the Supabase SQL editor, after db/011.
--
-- Why this is needed. The data this project stores is small: 863 listings and
-- about 3.4 MB of job descriptions, against 500 MB on the free plan. Nothing we
-- write threatens it.
--
-- The scheduler's bookkeeping is a different matter, because it grows with time
-- rather than with the number of jobs:
--
--   cron.job_run_details   one row per cron execution. The poll alone runs 1,440
--                          times a day; with the other three that is roughly
--                          1,512 rows a day, 46,000 a month, 550,000 a year.
--   net._http_response     one row per outbound HTTP call, including the whole
--                          response body. Same volume.
--
-- Neither is large per row and neither will fill a database quickly, but both
-- grow without limit and both make the cron views slow to read long before they
-- become a size problem. Pruning them is the difference between a system that
-- runs for years and one that needs attention in a few months.
--
-- Seven days of cron history is kept, which is more than enough to investigate
-- anything, and one day of HTTP responses, which is what you would actually
-- read when a job misbehaves.

create extension if not exists pg_cron;

select cron.schedule(
  'jobmania-prune-logs',
  '23 20 * * *',                       -- 01:53 IST, when nothing else is running
  $$
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  delete from net._http_response       where created  < now() - interval '1 day';
  $$
);

-- ------------------------------------------------------------------ checking
-- How big is the database, and what is taking the room?
--   select pg_size_pretty(pg_database_size(current_database())) as total;
--
--   select schemaname || '.' || relname as table,
--          pg_size_pretty(pg_total_relation_size(relid)) as size
--   from pg_catalog.pg_statio_user_tables
--   order by pg_total_relation_size(relid) desc limit 12;
--
-- How many rows have the scheduler's logs accumulated?
--   select count(*) from cron.job_run_details;
--   select count(*) from net._http_response;
--
-- Did the prune run?
--   select j.jobname, d.start_time, d.status
--   from cron.job_run_details d join cron.job j on j.jobid = d.jobid
--   where j.jobname = 'jobmania-prune-logs'
--   order by d.start_time desc limit 5;
--
-- To pause: select cron.unschedule('jobmania-prune-logs');
