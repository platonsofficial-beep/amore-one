-- =============================================================================
-- P8.6.1g — Guarded Migration Map UUID Alignment
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
--
-- Purpose:
--   Align public.inventory_stock_item_map.legacy_inventory_item_id
--   from bigint → uuid to match live public.inventory_items.id (uuid).
--
-- Operator workflow:
--   1. Open this complete file.
--   2. Copy entire contents.
--   3. Paste into Supabase SQL Editor.
--   4. Press Run once.
--   5. Confirm final message:
--        MIGRATION MAP LEGACY ID ALIGNED TO UUID — FOUNDATION READY
--      or:
--        MIGRATION MAP LEGACY ID ALREADY UUID — FOUNDATION READY
--
-- Safety:
--   - Schema alignment only (map legacy identity type)
--   - No inventory quantity changes
--   - No stock movement changes
--   - Aborts if map contains any rows (no remap / no truncate / no delete)
--   - Transaction wrapped; COMMIT only after assertions pass
--   - Failed assertions abort the transaction (run ROLLBACK; if editor leaves it open)
--   - Idempotent if map legacy ID is already uuid
--
-- Does NOT add a foreign key to inventory_items (intentionally unchanged).
-- =============================================================================

begin;

do $p861g_align$
declare
  v_items_id_type text;
  v_map_legacy_type_before text;
  v_map_legacy_type_after text;
  v_map_row_count bigint := 0;

  v_inventory_items_before bigint := 0;
  v_stock_items_before bigint := 0;
  v_stock_movements_before bigint := 0;
  v_sessions_before bigint := 0;
  v_steps_before bigint := 0;

  v_inventory_items_after bigint := 0;
  v_stock_items_after bigint := 0;
  v_stock_movements_after bigint := 0;
  v_sessions_after bigint := 0;
  v_steps_after bigint := 0;

  v_unique_index_present boolean := false;
  v_is_nullable text;
  v_performed_alter boolean := false;
  v_alignment_status text;
  v_final_message text;
begin
  if to_regclass('public.inventory_items') is null then
    raise exception 'P8.6.1g: public.inventory_items does not exist';
  end if;

  if to_regclass('public.inventory_stock_item_map') is null then
    raise exception 'P8.6.1g: public.inventory_stock_item_map does not exist';
  end if;

  select c.udt_name
  into v_items_id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'inventory_items'
    and c.column_name = 'id';

  if v_items_id_type is distinct from 'uuid' then
    raise exception
      'P8.6.1g: inventory_items.id must be uuid (found %)',
      coalesce(v_items_id_type, '<missing>');
  end if;

  select c.udt_name, c.is_nullable
  into v_map_legacy_type_before, v_is_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'inventory_stock_item_map'
    and c.column_name = 'legacy_inventory_item_id';

  if v_map_legacy_type_before is null then
    raise exception 'P8.6.1g: inventory_stock_item_map.legacy_inventory_item_id column missing';
  end if;

  if v_map_legacy_type_before not in ('int8', 'uuid') then
    raise exception
      'P8.6.1g: unexpected map legacy ID type % (expected int8/bigint or uuid)',
      v_map_legacy_type_before;
  end if;

  -- Normalize catalog udt_name int8 → bigint label for messaging.
  if v_map_legacy_type_before = 'int8' then
    v_map_legacy_type_before := 'bigint';
  end if;

  select count(*)::bigint into v_inventory_items_before from public.inventory_items;
  select count(*)::bigint into v_stock_items_before from public.stock_items;
  select count(*)::bigint into v_stock_movements_before from public.stock_movements;
  select count(*)::bigint into v_sessions_before from public.inventory_migration_sessions;
  select count(*)::bigint into v_steps_before from public.inventory_migration_session_steps;

  select count(*)::bigint into v_map_row_count from public.inventory_stock_item_map;

  if v_map_legacy_type_before = 'bigint' then
    if v_map_row_count > 0 then
      raise exception
        'P8.6.1g: MAP CONTAINS DATA — UUID ALIGNMENT ABORTED; REMAP REVIEW REQUIRED (map_row_count=%)',
        v_map_row_count;
    end if;

    -- Empty-table type change only. Drop the identity unique index/constraint that
    -- blocks ALTER TYPE (repo name + any unique constraint solely on these cols).
    drop index if exists public.inventory_stock_item_map_legacy_workspace_uidx;

    -- Drop unique table constraints that include legacy_inventory_item_id if present
    -- (does not drop PK or unrelated indexes such as workspace_status / stock_item_id).
    declare
      v_conname text;
    begin
      for v_conname in
        select c.conname
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'inventory_stock_item_map'
          and c.contype = 'u'
          and c.conkey @> array[
            (
              select a.attnum
              from pg_attribute a
              where a.attrelid = t.oid
                and a.attname = 'legacy_inventory_item_id'
                and not a.attisdropped
            )
          ]::int2[]
      loop
        execute format(
          'alter table public.inventory_stock_item_map drop constraint if exists %I',
          v_conname
        );
      end loop;
    end;

    -- USING is never applied to rows when the table is empty; the count gate above
    -- is the safety mechanism. Do not treat this as bigint→uuid remapping.
    alter table public.inventory_stock_item_map
      alter column legacy_inventory_item_id type uuid
      using nullif(legacy_inventory_item_id::text, '')::uuid;

    create unique index if not exists inventory_stock_item_map_legacy_workspace_uidx
      on public.inventory_stock_item_map (legacy_inventory_item_id, workspace_id);

    comment on column public.inventory_stock_item_map.legacy_inventory_item_id is
      'Original inventory_items.id (uuid). Not FK-linked so the map survives legacy retirement.';

    v_performed_alter := true;
  end if;

  select c.udt_name, c.is_nullable
  into v_map_legacy_type_after, v_is_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'inventory_stock_item_map'
    and c.column_name = 'legacy_inventory_item_id';

  if v_map_legacy_type_after = 'int8' then
    v_map_legacy_type_after := 'bigint';
  end if;

  if v_map_legacy_type_after is distinct from 'uuid' then
    raise exception
      'P8.6.1g: post-mutation map legacy ID type is % (expected uuid)',
      coalesce(v_map_legacy_type_after, '<missing>');
  end if;

  if v_is_nullable is distinct from 'NO' then
    raise exception 'P8.6.1g: legacy_inventory_item_id must remain NOT NULL';
  end if;

  select exists (
    select 1
    from pg_index ix
    join pg_class t on t.oid = ix.indrelid
    join pg_class i on i.oid = ix.indexrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'inventory_stock_item_map'
      and i.relname = 'inventory_stock_item_map_legacy_workspace_uidx'
      and ix.indisunique
      and ix.indisvalid
  )
  into v_unique_index_present;

  if not v_unique_index_present then
    -- Ensure uniqueness contract even on already-aligned installs missing the index.
    create unique index if not exists inventory_stock_item_map_legacy_workspace_uidx
      on public.inventory_stock_item_map (legacy_inventory_item_id, workspace_id);

    select exists (
      select 1
      from pg_index ix
      join pg_class t on t.oid = ix.indrelid
      join pg_class i on i.oid = ix.indexrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'inventory_stock_item_map'
        and i.relname = 'inventory_stock_item_map_legacy_workspace_uidx'
        and ix.indisunique
        and ix.indisvalid
    )
    into v_unique_index_present;
  end if;

  if not v_unique_index_present then
    raise exception 'P8.6.1g: unique index inventory_stock_item_map_legacy_workspace_uidx missing';
  end if;

  select count(*)::bigint into v_map_row_count from public.inventory_stock_item_map;
  if v_map_row_count <> 0 and v_performed_alter then
    raise exception 'P8.6.1g: map row count became non-zero during alignment (%)', v_map_row_count;
  end if;

  select count(*)::bigint into v_inventory_items_after from public.inventory_items;
  select count(*)::bigint into v_stock_items_after from public.stock_items;
  select count(*)::bigint into v_stock_movements_after from public.stock_movements;
  select count(*)::bigint into v_sessions_after from public.inventory_migration_sessions;
  select count(*)::bigint into v_steps_after from public.inventory_migration_session_steps;

  if v_inventory_items_after is distinct from v_inventory_items_before
     or v_stock_items_after is distinct from v_stock_items_before
     or v_stock_movements_after is distinct from v_stock_movements_before
     or v_sessions_after is distinct from v_sessions_before
     or v_steps_after is distinct from v_steps_before then
    raise exception
      'P8.6.1g: unrelated row counts changed (items %→%, stock %→%, movements %→%, sessions %→%, steps %→%)',
      v_inventory_items_before, v_inventory_items_after,
      v_stock_items_before, v_stock_items_after,
      v_stock_movements_before, v_stock_movements_after,
      v_sessions_before, v_sessions_after,
      v_steps_before, v_steps_after;
  end if;

  if to_regprocedure('public.run_inventory_migration_persist(uuid,uuid)') is null then
    raise exception 'P8.6.1g: run_inventory_migration_persist(uuid,uuid) missing';
  end if;

  if to_regprocedure('public.run_inventory_migration_auto_link(uuid,uuid)') is null then
    raise exception 'P8.6.1g: run_inventory_migration_auto_link(uuid,uuid) missing';
  end if;

  if v_performed_alter then
    v_alignment_status := 'aligned';
    v_final_message := 'MIGRATION MAP LEGACY ID ALIGNED TO UUID — FOUNDATION READY';
  else
    v_alignment_status := 'already_aligned';
    v_final_message := 'MIGRATION MAP LEGACY ID ALREADY UUID — FOUNDATION READY';
  end if;

  create temporary table if not exists p861g_alignment_result (
    inventory_items_id_type text,
    map_legacy_id_type_before text,
    map_legacy_id_type_after text,
    map_row_count bigint,
    unique_identity_index_present boolean,
    inventory_items_count_unchanged boolean,
    stock_items_count_unchanged boolean,
    stock_movements_count_unchanged boolean,
    migration_sessions_count_unchanged boolean,
    migration_steps_count_unchanged boolean,
    alignment_status text,
    final_message text
  ) on commit preserve rows;

  delete from p861g_alignment_result;

  insert into p861g_alignment_result values (
    v_items_id_type,
    v_map_legacy_type_before,
    v_map_legacy_type_after,
    v_map_row_count,
    v_unique_index_present,
    true,
    true,
    true,
    true,
    true,
    v_alignment_status,
    v_final_message
  );
end;
$p861g_align$;

select * from p861g_alignment_result;

commit;
