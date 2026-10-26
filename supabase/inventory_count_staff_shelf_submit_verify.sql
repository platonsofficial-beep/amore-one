-- Run with explicit owner approval
-- =============================================================================
-- Verify staff shelf count submit (SQL NOT APPLIED)
-- =============================================================================
-- Read-only. Raises if the submit function is missing, can be executed by
-- anon or public, reads cost, writes balances, or if manager posting was
-- opened to staff. Does not insert a count or change stock.
-- =============================================================================

begin;

do $$
declare
  function_body text;
  post_body text;
begin
  select pg_get_functiondef(
    'public.submit_staff_shelf_count(uuid,uuid,jsonb)'::regprocedure
  )
  into function_body;

  if function_body is null or function_body = '' then
    raise exception 'verify_failed_function_missing';
  end if;

  if function_body not ilike '%wm.role = ''staff''%'
     or function_body not ilike '%counting_complete%'
     or function_body not ilike '%Staff shelf count%'
     or function_body not ilike '%is_supply%' then
    raise exception 'verify_failed_staff_shelf_rules';
  end if;

  if function_body ilike '%cost_price%'
     or function_body ilike '%unit_price%'
     or function_body ilike '%update public.stock_item_location_balances%'
     or function_body ilike '%post_inventory_count_finish%' then
    raise exception 'verify_failed_staff_shelf_must_not_post_or_read_cost';
  end if;

  if has_function_privilege(
       'anon',
       'public.submit_staff_shelf_count(uuid,uuid,jsonb)',
       'execute'
     )
     or has_function_privilege(
       'public',
       'public.submit_staff_shelf_count(uuid,uuid,jsonb)',
       'execute'
     ) then
    raise exception 'verify_failed_anon_or_public_execute';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.submit_staff_shelf_count(uuid,uuid,jsonb)',
    'execute'
  ) then
    raise exception 'verify_failed_authenticated_execute';
  end if;

  select pg_get_functiondef(
    'public.post_inventory_count_finish(uuid,uuid)'::regprocedure
  )
  into post_body;

  if post_body is null
     or post_body not ilike '%can_manage_workspace_stock%' then
    raise exception 'verify_failed_manager_post_opened';
  end if;
end $$;

commit;
