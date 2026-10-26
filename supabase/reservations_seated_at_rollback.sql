-- Rollback for reservations_seated_at.sql.
-- SQL NOT APPLIED. Run only with owner approval, after the migration.
-- Drops the trigger, function, and seated_at column. Does not delete reservation rows.

begin;

drop trigger if exists reservations_set_seated_at on public.reservations;

drop function if exists public.reservations_set_seated_at();

alter table public.reservations
  drop column if exists seated_at;

commit;
