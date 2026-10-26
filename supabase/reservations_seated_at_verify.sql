-- Read-only checks after reservations_seated_at.sql.
-- SQL NOT APPLIED until the owner approves the migration. This file only reads.

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reservations'
  and column_name = 'seated_at';

select
  tg.tgname as trigger_name,
  pg_get_triggerdef(tg.oid) as trigger_def
from pg_trigger tg
join pg_class rel on rel.oid = tg.tgrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'reservations'
  and tg.tgname = 'reservations_set_seated_at'
  and not tg.tgisinternal;

select pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'reservations_set_seated_at';
