-- Read-only checks after reservations_auto_close_in_house.sql.
-- Do not update, insert, or delete. SQL NOT APPLIED until the owner approves the migration.

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reservations'
  and column_name in ('auto_closed_at', 'auto_closed_from_status')
order by column_name;

select
  p.proname,
  p.prosecdef as security_definer,
  p.prosrc as source
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
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'reservations'
  and indexname in (
    'reservations_auto_close_checked_in_idx',
    'reservations_auto_close_in_house_idx'
  );

select
  count(*) filter (where auto_closed_at is not null) as auto_closed_rows,
  count(*) filter (
    where auto_closed_at is not null
      and auto_closed_from_status is null
  ) as auto_closed_missing_from_status,
  count(*) filter (
    where status in ('Checked In', 'Walk In', 'Checked In (Partial)')
      and reservation_date < (now() at time zone 'Europe/Nicosia')::date
  ) as still_in_house_before_today
from public.reservations;
