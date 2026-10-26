-- =============================================================================
-- Read-only verify for supabase/inventory_import_apply_cost.sql
-- =============================================================================
-- Do not call the function. SELECT only.
-- Expected after apply:
--   apply_inventory_import_session is SECURITY DEFINER
--   proconfig includes search_path=public
--   prosrc reads costPrice and rejects inventory_import_apply_invalid_cost_price
--   EXECUTE for authenticated
--   no EXECUTE for anon or public
-- =============================================================================

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  p.proconfig as config,
  position('costPrice' in p.prosrc) > 0 as reads_cost_price,
  position('inventory_import_apply_invalid_cost_price' in p.prosrc) > 0 as rejects_bad_cost
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'apply_inventory_import_session';

select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'apply_inventory_import_session'
order by grantee, privilege_type;
