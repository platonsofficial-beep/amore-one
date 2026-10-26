-- Read-only checks after reservations_auto_close.sql.
-- Do not update, insert, or delete. SQL NOT APPLIED until the owner approves the migration.

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reservations'
  and column_name = 'auto_closed_at';

select
  column_name,
  data_type,
  column_default,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workspace_profiles'
  and column_name = 'reservation_auto_close_time';

select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'auto_close_stale_seated_reservations';

select
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'auto_close_stale_seated_reservations'
order by grantee, privilege_type;

select
  jobid,
  jobname,
  schedule,
  command
from cron.job
where jobname = 'auto-close-stale-seated-reservations';

select
  count(*) filter (where auto_closed_at is not null) as auto_closed_rows,
  count(*) filter (
    where status = 'Checked In'
      and auto_closed_at is not null
  ) as checked_in_still_marked
from public.reservations;
