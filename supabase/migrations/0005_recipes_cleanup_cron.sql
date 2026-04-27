-- Phase 2 — Recipe cleanup cron job
--
-- Daily at 03:00 UTC, hard-delete every non-favorited recipe whose
-- `expires_at` has passed. Favorites are kept indefinitely.
--
-- Verify the job is registered:
--     SELECT jobid, schedule, command, active
--     FROM cron.job
--     WHERE jobname = 'delete_expired_recipes';
--
-- Inspect recent runs:
--     SELECT *
--     FROM cron.job_run_details
--     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'delete_expired_recipes')
--     ORDER BY start_time DESC
--     LIMIT 10;
--
-- Manually trigger the cleanup logic for testing (does NOT invoke cron, runs
-- the same SQL the job would run):
--     DELETE FROM public.recipes
--     WHERE is_favorite = false AND expires_at < now();
--
-- Tear the job down (only if you really want to disable it):
--     SELECT cron.unschedule('delete_expired_recipes');

create extension if not exists pg_cron;

-- pg_cron stores all jobs in cron.job. Re-running this migration would
-- otherwise create duplicate jobs with the same name, so unschedule any
-- existing copy first. Check for the row before calling unschedule so real
-- errors (permissions, missing extension) surface instead of being swallowed.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete_expired_recipes') then
    perform cron.unschedule('delete_expired_recipes');
  end if;
end;
$$;

select cron.schedule(
  'delete_expired_recipes',
  '0 3 * * *',
  $$DELETE FROM public.recipes WHERE is_favorite = false AND expires_at < now();$$
);
