-- =============================================================================
-- P8.26.6c — Stock Supplier UUID Schema Repair
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Align stock_items.supplier_id and stock_orders.supplier_id to uuid
--   so they can FK to live public.suppliers(id) (uuid).
--
-- Replaces the incompatible historical BIGINT attempt in:
--   supabase/stock_supplier_id_columns.sql  (keep unchanged; do not re-run)
--
-- Guarantees:
--   - suppliers.id is verified as uuid (never altered)
--   - No silent bigint → uuid cast
--   - Populated BIGINT supplier_id aborts with a clear diagnostic
--   - Empty BIGINT supplier_id is dropped and recreated as uuid
--   - UUID columns are preserved; missing FK/indexes are added
--   - ON DELETE SET NULL
--   - No backfill (stock_supplier_id_backfill.sql is separate)
--   - No RLS / trigger / text `supplier` changes
--
-- After successful execution, reload PostgREST schema cache:
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

do $p8266c_repair$
declare
  v_suppliers_id_type text;
  v_table text;
  v_col_type text;
  v_non_null bigint;
  v_fk_exists boolean;
  v_conname text;
  v_attnum int2;
begin
  if to_regclass('public.suppliers') is null then
    raise exception 'P8.26.6c: public.suppliers does not exist';
  end if;

  if to_regclass('public.stock_items') is null then
    raise exception 'P8.26.6c: public.stock_items does not exist';
  end if;

  if to_regclass('public.stock_orders') is null then
    raise exception 'P8.26.6c: public.stock_orders does not exist';
  end if;

  select c.udt_name
  into v_suppliers_id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'suppliers'
    and c.column_name = 'id';

  if v_suppliers_id_type is distinct from 'uuid' then
    raise exception
      'P8.26.6c: public.suppliers.id must be uuid before Stock supplier_id repair (found %). Refusing to alter suppliers.id.',
      coalesce(v_suppliers_id_type, '<missing>');
  end if;

  foreach v_table in array array['stock_items', 'stock_orders']
  loop
    select c.udt_name
    into v_col_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_table
      and c.column_name = 'supplier_id';

    if v_col_type = 'int8' then
      v_col_type := 'bigint';
    elsif v_col_type = 'int4' then
      v_col_type := 'integer';
    elsif v_col_type = 'int2' then
      v_col_type := 'smallint';
    end if;

    if v_col_type is null then
      -- State A: column absent → create uuid nullable column
      execute format(
        'alter table public.%I add column supplier_id uuid',
        v_table
      );

    elsif v_col_type in ('bigint', 'integer', 'smallint') then
      execute format(
        'select count(*)::bigint from public.%I where supplier_id is not null',
        v_table
      ) into v_non_null;

      if coalesce(v_non_null, 0) > 0 then
        -- State C: populated incompatible BIGINT — abort, no mutation
        raise exception
          'P8.26.6c: public.%.supplier_id is BIGINT with % non-null value(s). Incompatible BIGINT data exists; manual review is required; no automatic cast was performed.',
          v_table,
          v_non_null;
      end if;

      -- State B: empty BIGINT → drop dependents via DROP COLUMN, recreate as uuid
      -- (DROP COLUMN removes FKs/indexes that depend on supplier_id)
      execute format(
        'alter table public.%I drop column supplier_id',
        v_table
      );
      execute format(
        'alter table public.%I add column supplier_id uuid',
        v_table
      );

    elsif v_col_type = 'uuid' then
      -- State D / E: keep uuid column; FK/indexes ensured below
      null;

    else
      raise exception
        'P8.26.6c: public.%.supplier_id has unexpected type % (expected absent, bigint, or uuid)',
        v_table,
        v_col_type;
    end if;

    -- Ensure ON DELETE SET NULL FK to suppliers(id) without duplicate constraints
    select a.attnum
    into v_attnum
    from pg_attribute a
    join pg_class t on t.oid = a.attrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = v_table
      and a.attname = 'supplier_id'
      and not a.attisdropped;

    select exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_class ft on ft.oid = c.confrelid
      join pg_namespace fn on fn.oid = ft.relnamespace
      where n.nspname = 'public'
        and t.relname = v_table
        and c.contype = 'f'
        and fn.nspname = 'public'
        and ft.relname = 'suppliers'
        and c.conkey = array[v_attnum]::int2[]
        and c.confkey = array[
          (
            select a.attnum
            from pg_attribute a
            where a.attrelid = ft.oid
              and a.attname = 'id'
              and not a.attisdropped
          )
        ]::int2[]
    )
    into v_fk_exists;

    if not coalesce(v_fk_exists, false) then
      -- Drop any stale FK on supplier_id that does not match the target (State F)
      for v_conname in
        select c.conname
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = v_table
          and c.contype = 'f'
          and c.conkey = array[v_attnum]::int2[]
      loop
        execute format(
          'alter table public.%I drop constraint if exists %I',
          v_table,
          v_conname
        );
      end loop;

      execute format(
        'alter table public.%I
           add constraint %I
           foreign key (supplier_id)
           references public.suppliers(id)
           on delete set null',
        v_table,
        v_table || '_supplier_id_fkey'
      );
    end if;

    -- State E / F: idempotent indexes
    execute format(
      'create index if not exists %I on public.%I (supplier_id)',
      v_table || '_supplier_id_idx',
      v_table
    );
    execute format(
      'create index if not exists %I on public.%I (workspace_id, supplier_id)',
      v_table || '_workspace_supplier_id_idx',
      v_table
    );
  end loop;

  raise notice
    'P8.26.6c: stock_items.supplier_id and stock_orders.supplier_id aligned to uuid → suppliers(id). Reload PostgREST: notify pgrst, ''reload schema'';';
end;
$p8266c_repair$;

commit;

-- =============================================================================
-- Operator notes (do not auto-execute)
-- =============================================================================
-- After this script succeeds:
--   notify pgrst, 'reload schema';
--
-- Do NOT run stock_supplier_id_backfill.sql in the same step unless separately approved.
-- Do NOT re-run supabase/stock_supplier_id_columns.sql (historical BIGINT migration).
-- =============================================================================
