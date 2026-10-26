-- Run with explicit owner approval
-- =============================================================================
-- Verify staff take from supply (SQL NOT APPLIED)
-- =============================================================================
-- Read-only. Raises if the function is missing, still requires a manager,
-- does not reject a non-supply source, or anon/public can execute it.
-- Does not move stock.
-- =============================================================================

begin;

do $$
declare
  function_body text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_storages'
      and column_name = 'is_supply'
  ) then
    raise exception 'verify_failed_is_supply_column';
  end if;

  select pg_get_functiondef(
    'public.take_from_supply_storage(uuid,uuid,uuid,uuid,numeric,bigint,bigint,text,uuid)'::regprocedure
  )
  into function_body;

  if function_body is null or function_body = '' then
    raise exception 'verify_failed_function_missing';
  end if;

  if function_body ilike '%can_manage_workspace_stock%' then
    raise exception 'verify_failed_manager_check';
  end if;

  if function_body not ilike '%take_from_supply_source_not_supply%'
     or function_body not ilike '%take_from_supply_destination_is_supply%'
     or function_body not ilike '%is_supply%' then
    raise exception 'verify_failed_supply_direction';
  end if;

  if has_function_privilege(
       'anon',
       'public.take_from_supply_storage(uuid,uuid,uuid,uuid,numeric,bigint,bigint,text,uuid)',
       'execute'
     )
     or has_function_privilege(
       'public',
       'public.take_from_supply_storage(uuid,uuid,uuid,uuid,numeric,bigint,bigint,text,uuid)',
       'execute'
     ) then
    raise exception 'verify_failed_anon_or_public_execute';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.take_from_supply_storage(uuid,uuid,uuid,uuid,numeric,bigint,bigint,text,uuid)',
    'execute'
  ) then
    raise exception 'verify_failed_authenticated_execute';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.transfer_stock_between_locations(uuid,uuid,uuid,uuid,numeric,bigint,bigint,text,uuid)',
    'execute'
  ) then
    raise exception 'verify_failed_manager_transfer_missing';
  end if;
end $$;

commit;
