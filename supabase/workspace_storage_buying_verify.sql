-- Verify workspace_storages.is_buying. Read-only. Raises on failure.
-- Run after workspace_storage_buying.sql commits.

do $$
declare
  column_type text;
  column_not_null boolean;
  column_default text;
begin
  select data_type, is_nullable = 'NO', column_default
    into column_type, column_not_null, column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'workspace_storages'
    and column_name = 'is_buying';

  if column_type is null then
    raise exception 'verify_failed_is_buying_column';
  end if;

  if column_type <> 'boolean' then
    raise exception 'verify_failed_is_buying_type';
  end if;

  if column_not_null is distinct from true then
    raise exception 'verify_failed_is_buying_nullable';
  end if;

  if column_default is null or column_default not ilike '%false%' then
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
