-- Rollback for reservations_auto_close_in_house.sql.
-- SQL NOT APPLIED. Run only with owner approval, after that migration.
--
-- Puts Walk In and Checked In (Partial) rows this version closed back to
-- the status stored in auto_closed_from_status, then restores the previous
-- function that only closes 'Checked In'.
--
-- Rows already closed from 'Checked In' stay Checked Out with auto_closed_at
-- set. This script does not drop auto_closed_at, the cutoff setting, or the
-- cron job. It does not delete rows.

begin;

update public.reservations
set
  status = auto_closed_from_status,
  auto_closed_at = null,
  auto_closed_from_status = null,
  updated_at = now()
where auto_closed_at is not null
  and status = 'Checked Out'
  and auto_closed_from_status in ('Walk In', 'Checked In (Partial)');

create or replace function public.auto_close_stale_seated_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_count integer := 0;
begin
  with clock as (
    select (pg_catalog.now() at time zone 'Europe/Nicosia') as local_now
  ),
  venue as (
    select coalesce(
      (
        select p.reservation_auto_close_time
        from public.workspace_profiles p
        where p.workspace_key = 'default'
        order by p.updated_at desc nulls last
        limit 1
      ),
      time '05:00'
    ) as cutoff
  ),
  bounds as (
    select
      v.cutoff,
      case
        when c.local_now::time < v.cutoff then c.local_now::date - 1
        else c.local_now::date
      end as business_date,
      case
        when c.local_now::time < v.cutoff
          then ((c.local_now::date - 1) + v.cutoff) at time zone 'Europe/Nicosia'
        else (c.local_now::date + v.cutoff) at time zone 'Europe/Nicosia'
      end as business_started_at
    from clock c
    cross join venue v
  )
  update public.reservations r
  set
    status = 'Checked Out',
    auto_closed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  from bounds b
  where r.status = 'Checked In'
    and r.reservation_date < b.business_date
    and (r.updated_at is null or r.updated_at < b.business_started_at);

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

comment on function public.auto_close_stale_seated_reservations() is
  'Idempotent. Checks out Checked In reservations from a previous Europe/Nicosia business day after the venue cutoff. Cron only.';

revoke all on function public.auto_close_stale_seated_reservations() from public;
revoke all on function public.auto_close_stale_seated_reservations() from anon;
revoke all on function public.auto_close_stale_seated_reservations() from authenticated;
revoke all on function public.auto_close_stale_seated_reservations() from service_role;

grant execute on function public.auto_close_stale_seated_reservations() to postgres;

drop index if exists public.reservations_auto_close_in_house_idx;

create index if not exists reservations_auto_close_checked_in_idx
  on public.reservations (reservation_date)
  where status = 'Checked In';

alter table public.reservations
  drop column if exists auto_closed_from_status;

comment on column public.reservations.auto_closed_at is
  'Set when end-of-day auto-close moves this row from Checked In to Checked Out. Null after a manager undo.';

commit;
