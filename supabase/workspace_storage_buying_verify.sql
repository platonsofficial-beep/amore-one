-- Verify workspace_storages.is_buying. Read-only. Raises on failure.
-- Run after workspace_storage_buying.sql commits.

do $$
declare
  v_type text;
  v_not_null boolean;
  v_default text;
begin
  select c.data_type, c.is_nullable = 'NO', c.column_default
    into v_type, v_not_null, v_default
  from information_schema.columns as c
  where c.table_schema = 'public'
    and c.table_name = 'workspace_storages'
    and c.column_name = 'is_buying';

  if v_type is null then
    raise exception 'verify_failed_is_buying_column';
  end if;

  if v_type <> 'boolean' then
    raise exception 'verify_failed_is_buying_type';
  end if;

  if v_not_null is distinct from true then
    raise exception 'verify_failed_is_buying_nullable';
  end if;

  if v_default is null or v_default not ilike '%false%' then
    raise exception 'verify_failed_is_buying_default';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_storages'
      and column_name = 'is_supply'
  ) then
    raise exception 'verify_failed_is_supply_still_present';
  end if;

  if to_regclass('public.workspace_storages_workspace_buying_idx') is null then
    raise exception 'verify_failed_is_buying_index';
  end if;
end $$;
