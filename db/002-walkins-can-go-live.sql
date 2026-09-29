-- Migration 002 — let walk-ins go live.
--
-- The original constraint required an apply_url before a row could be
-- published. That gated out every walk-in, because a walk-in has no online
-- application by definition: the route is a venue and a date. All 128 held
-- back by this rule had both.
--
-- Safe to re-run.

-- 1. widen the rule: an apply URL *or* a venue and a date
alter table public.jobs drop constraint if exists jobs_live_requires_expiry;
alter table public.jobs add constraint jobs_live_requires_expiry
  check (
    status <> 'live' or (
      valid_through is not null and (
        apply_url is not null
        or (walkin_venue is not null and walkin_start is not null)
      )
    )
  );

-- 2. publish the walk-ins that were only ever blocked by the old rule.
--    Anything flagged for a fee, or whose drive has already finished, stays put.
update public.jobs
   set status = 'live',
       review_reason = null
 where status = 'needs_review'
   and review_reason = 'no-apply-link'
   and hiring_type = 'walk-in'
   and walkin_venue is not null
   and walkin_start is not null
   and valid_through > now()
   and (scam_flags is null or cardinality(scam_flags) = 0);

-- 3. what is left in review, and why
select coalesce(review_reason, '(none)') as reason, count(*)
  from public.jobs where status = 'needs_review'
 group by 1 order by 2 desc;
