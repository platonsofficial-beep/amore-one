-- =============================================================================
-- Read-only verify for supabase/inventory_import_undo_session.sql
-- =============================================================================
-- Do not call the functions. SELECT only.
-- Expected after apply:
--   inventory_import_undo_eligibility and undo_inventory_import_session
--     are SECURITY DEFINER, search_path=public, EXECUTE for authenticated
--   inventory_import_collect_undo_refusals is SECURITY DEFINER and has
--     no EXECUTE for anon, authenticated, or public
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
    'inventory_import_collect_undo_refusals',
    'inventory_import_undo_eligibility',
    'undo_inventory_import_session'
  )
order by p.proname;

select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in (
    'inventory_import_collect_undo_refusals',
    'inventory_import_undo_eligibility',
    'undo_inventory_import_session'
  )
order by routine_name, grantee, privilege_type;
