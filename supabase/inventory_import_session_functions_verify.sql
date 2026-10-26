-- =============================================================================
-- Read-only verify for supabase/inventory_import_session_functions.sql
-- =============================================================================
-- Do not call the functions. SELECT only.
-- Expected after apply:
--   4 functions, each SECURITY DEFINER, search_path = public
--   EXECUTE for authenticated
--   no EXECUTE for anon or public
-- apply_inventory_import_session is listed only so you can see it is still present.
-- =============================================================================

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_inventory_import_session',
    'stage_inventory_import_rows',
    'cancel_inventory_import_session',
    'mark_inventory_import_session_ready',
    'apply_inventory_import_session'
  )
order by p.proname;

select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in (
    'create_inventory_import_session',
    'stage_inventory_import_rows',
    'cancel_inventory_import_session',
    'mark_inventory_import_session_ready'
  )
order by routine_name, grantee, privilege_type;
