-- Rollback for reservations_auto_close.sql.
-- SQL NOT APPLIED. Run only with owner approval, after the migration.
--
-- The first cron run sets status to 'Checked Out' and fills auto_closed_at.
-- Dropping the column without this update would leave those guests checked out
-- with no way to tell which rows the job closed. This restores 'Checked In'
-- for rows that are still 'Checked Out' and still have auto_closed_at, then
-- drops the column. A manager undo already cleared auto_closed_at, so those
-- rows stay 'Checked In'. Rows moved to another status after auto-close are
-- left alone.
--
-- Does not drop pg_cron. Other jobs may use it.

do $$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid
      into existing_job
    from cron.job
    where jobname = 'auto-close-stale-seated-reservations'
    limit 1;

    if existing_job is not null then
      perform cron.unschedule(existing_job);
    end if;
  end if;
end;
$$;

begin;

update public.reservations
set
  status = 'Checked In',
  updated_at = now()
where auto_closed_at is not null
  and status = 'Checked Out';

drop function if exists public.auto_close_stale_seated_reservations();

alter table public.reservations
  drop column if exists auto_closed_at;

alter table public.workspace_profiles
  drop column if exists reservation_auto_close_time;

commit;
