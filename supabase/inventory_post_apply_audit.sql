-- =============================================================================
-- P7.4.11 — Post-apply consistency audit (READ-ONLY)
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Guarantees (READ-ONLY):
--   - No INSERT / UPDATE / DELETE / MERGE / TRUNCATE
--   - No ALTER / DROP / CREATE TABLE / CREATE INDEX
--   - Completes even when findings exist (NOTICE only; no RAISE for data)
--
-- Purpose:
--   Verify inventory migration consistency after Phase 1 + Phase 2.
--
-- Prerequisites:
--   public.inventory_stock_item_map
--   public.stock_items
--   public.stock_movements
-- =============================================================================

do $$
declare
  v_a_unapplied bigint := 0;
  v_a_stuck_unapplied bigint := 0;
  v_b_migrated bigint := 0;
  v_c_migrated_null_stock bigint := 0;
  v_d_orphan_stock bigint := 0;
  v_e_cross_workspace bigint := 0;
  v_f_dup_notes bigint := 0;
  v_g_zero_movement bigint := 0;
  v_h_multi_movement bigint := 0;
  v_i_item_mismatch bigint := 0;
  v_j_workspace_mismatch bigint := 0;
  v_k_negative_qty bigint := 0;
  v_l_inactive_migrated bigint := 0;
  v_m_bad_type bigint := 0;
  v_created_linked bigint := 0;
  v_completion_pct numeric := 0;
  v_q_bad_coverage bigint := 0;
  v_attention boolean := false;
  r record;
begin
  -- Scope helpers
  select count(*)::bigint into v_created_linked
  from public.inventory_stock_item_map
  where status in ('created', 'linked');

  -- A) created/linked with migrated_at IS NULL
  select count(*)::bigint into v_a_unapplied
  from public.inventory_stock_item_map
  where status in ('created', 'linked')
    and migrated_at is null;

  -- A stuck: unapplied but Phase 1 movement exists (should have been applied)
  select count(*)::bigint into v_a_stuck_unapplied
  from public.inventory_stock_item_map m
  where m.status in ('created', 'linked')
    and m.migrated_at is null
    and (
      select count(*)::bigint
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    ) = 1;

  -- B) created/linked with migrated_at IS NOT NULL
  select count(*)::bigint into v_b_migrated
  from public.inventory_stock_item_map
  where status in ('created', 'linked')
    and migrated_at is not null;

  -- C) migrated rows missing stock_item_id
  select count(*)::bigint into v_c_migrated_null_stock
  from public.inventory_stock_item_map
  where migrated_at is not null
    and stock_item_id is null;

  -- D) migrated rows whose stock item no longer exists
  select count(*)::bigint into v_d_orphan_stock
  from public.inventory_stock_item_map m
  where m.migrated_at is not null
    and m.stock_item_id is not null
    and not exists (
      select 1 from public.stock_items s where s.id = m.stock_item_id
    );

  -- E) cross-workspace map ↔ stock
  select count(*)::bigint into v_e_cross_workspace
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.status in ('created', 'linked')
    and s.workspace_id is distinct from m.workspace_id;

  -- F) duplicate INITIAL_IMPORT notes (same deterministic identity)
  select coalesce(sum(n - 1), 0)::bigint into v_f_dup_notes
  from (
    select count(*)::bigint as n
    from public.stock_movements
    where note like 'INITIAL_IMPORT|map_id=%'
    group by note
    having count(*) > 1
  ) d;

  -- G) created/linked with zero matching INITIAL_IMPORT
  select count(*)::bigint into v_g_zero_movement
  from public.inventory_stock_item_map m
  where m.status in ('created', 'linked')
    and not exists (
      select 1
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    );

  -- H) created/linked with more than one matching INITIAL_IMPORT
  select count(*)::bigint into v_h_multi_movement
  from public.inventory_stock_item_map m
  where m.status in ('created', 'linked')
    and (
      select count(*)::bigint
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    ) > 1;

  -- I) movement item mismatch
  select count(*)::bigint into v_i_item_mismatch
  from public.inventory_stock_item_map m
  join public.stock_movements sm
    on sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
  where m.status in ('created', 'linked')
    and sm.item_id is distinct from m.stock_item_id;

  -- J) movement workspace mismatch
  select count(*)::bigint into v_j_workspace_mismatch
  from public.inventory_stock_item_map m
  join public.stock_movements sm
    on sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
  where m.status in ('created', 'linked')
    and sm.workspace_id is distinct from m.workspace_id;

  -- K) negative stock quantities
  select count(*)::bigint into v_k_negative_qty
  from public.stock_items
  where current_quantity < 0;

  -- L) inactive stock items that were migrated
  select count(*)::bigint into v_l_inactive_migrated
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.migrated_at is not null
    and s.active is distinct from true;

  -- M) INITIAL_IMPORT movement type not receive/usage
  select count(*)::bigint into v_m_bad_type
  from public.stock_movements sm
  where sm.note like 'INITIAL_IMPORT|map_id=%'
    and sm.type not in ('receive', 'usage');

  -- P) completion percentage
  v_completion_pct := case
    when v_created_linked = 0 then 0
    else round((v_b_migrated::numeric / v_created_linked::numeric) * 100, 2)
  end;

  -- Q) migrated rows without exactly one INITIAL_IMPORT movement
  select count(*)::bigint into v_q_bad_coverage
  from public.inventory_stock_item_map m
  where m.migrated_at is not null
    and (
      select count(*)::bigint
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    ) is distinct from 1;

  -- R) verdict — hard integrity + stuck unapplied (movement exists, not applied)
  -- Note: A/G include Phase 1 delta=0 skips (no movement); those alone do not fail.
  v_attention := (
    v_a_stuck_unapplied > 0
    or v_c_migrated_null_stock > 0
    or v_d_orphan_stock > 0
    or v_e_cross_workspace > 0
    or v_f_dup_notes > 0
    or v_h_multi_movement > 0
    or v_i_item_mismatch > 0
    or v_j_workspace_mismatch > 0
    or v_k_negative_qty > 0
    or v_l_inactive_migrated > 0
    or v_m_bad_type > 0
    or v_q_bad_coverage > 0
  );

  raise notice '========== P7.4.11 POST-APPLY AUDIT ==========';
  raise notice 'A unapplied_created_linked_migrated_at_null=% (stuck_with_movement=%)',
    v_a_unapplied, v_a_stuck_unapplied;
  raise notice 'B migrated_created_linked_migrated_at_set=%', v_b_migrated;
  raise notice 'C migrated_missing_stock_item_id=%', v_c_migrated_null_stock;
  raise notice 'D migrated_orphan_stock_item=%', v_d_orphan_stock;
  raise notice 'E cross_workspace_map_stock=%', v_e_cross_workspace;
  raise notice 'F duplicate_INITIAL_IMPORT_extra_rows=%', v_f_dup_notes;
  raise notice 'G created_linked_zero_INITIAL_IMPORT=% (may include Phase1 delta=0 skips)', v_g_zero_movement;
  raise notice 'H created_linked_multi_INITIAL_IMPORT=%', v_h_multi_movement;
  raise notice 'I movement_item_mismatch=%', v_i_item_mismatch;
  raise notice 'J movement_workspace_mismatch=%', v_j_workspace_mismatch;
  raise notice 'K negative_stock_quantities=%', v_k_negative_qty;
  raise notice 'L inactive_migrated_stock_items=%', v_l_inactive_migrated;
  raise notice 'M INITIAL_IMPORT_bad_movement_type=%', v_m_bad_type;
  raise notice '--- N status distribution ---';

  for r in
    select status, count(*)::bigint as n
    from public.inventory_stock_item_map
    group by status
    order by status
  loop
    raise notice '  status=% count=%', r.status, r.n;
  end loop;

  raise notice '--- O resolution_type distribution ---';

  for r in
    select coalesce(resolution_type, '<null>') as resolution_type, count(*)::bigint as n
    from public.inventory_stock_item_map
    group by resolution_type
    order by resolution_type nulls first
  loop
    raise notice '  resolution_type=% count=%', r.resolution_type, r.n;
  end loop;

  raise notice 'P completion_pct=% (migrated=% / created_linked=%)',
    v_completion_pct, v_b_migrated, v_created_linked;
  raise notice 'Q migrated_without_exactly_one_INITIAL_IMPORT=%', v_q_bad_coverage;
  raise notice 'R verdict_attention_required=%', v_attention;

  if v_attention then
    raise notice 'POST MIGRATION AUDIT REQUIRES ATTENTION';
  else
    raise notice 'POST MIGRATION AUDIT PASSED';
  end if;
end $$;

-- =============================================================================
-- VERIFICATION QUERIES (commented — SELECT only)
-- =============================================================================

-- Migrated rows
-- select * from public.inventory_stock_item_map
-- where status in ('created','linked') and migrated_at is not null;

-- Unapplied rows
-- select * from public.inventory_stock_item_map
-- where status in ('created','linked') and migrated_at is null;

-- Duplicate deterministic notes
-- select note, count(*)::bigint as n
-- from public.stock_movements
-- where note like 'INITIAL_IMPORT|map_id=%'
-- group by note having count(*) > 1;

-- Orphan stock items (migrated map → missing stock)
-- select m.*
-- from public.inventory_stock_item_map m
-- where m.migrated_at is not null
--   and m.stock_item_id is not null
--   and not exists (select 1 from public.stock_items s where s.id = m.stock_item_id);

-- Workspace mismatches
-- select m.id, m.workspace_id as map_ws, s.workspace_id as stock_ws
-- from public.inventory_stock_item_map m
-- join public.stock_items s on s.id = m.stock_item_id
-- where s.workspace_id is distinct from m.workspace_id;

-- Negative quantities
-- select * from public.stock_items where current_quantity < 0;

-- Inactive migrated stock
-- select m.id, s.id as stock_item_id, s.active, m.migrated_at
-- from public.inventory_stock_item_map m
-- join public.stock_items s on s.id = m.stock_item_id
-- where m.migrated_at is not null and s.active is distinct from true;

-- Movement coverage (migrated must have exactly one)
-- select m.id,
--   (select count(*) from public.stock_movements sm
--    where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text) as mov_n
-- from public.inventory_stock_item_map m
-- where m.migrated_at is not null
--   and (select count(*) from public.stock_movements sm
--        where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text) is distinct from 1;

-- Completion percentage
-- select
--   count(*) filter (where status in ('created','linked'))::bigint as created_linked,
--   count(*) filter (where status in ('created','linked') and migrated_at is not null)::bigint as migrated,
--   case when count(*) filter (where status in ('created','linked')) = 0 then 0
--        else round(
--          (count(*) filter (where status in ('created','linked') and migrated_at is not null)::numeric
--           / count(*) filter (where status in ('created','linked'))::numeric) * 100, 2)
--   end as completion_pct
-- from public.inventory_stock_item_map;

-- Status / resolution distributions
-- select status, count(*) from public.inventory_stock_item_map group by 1 order by 1;
-- select resolution_type, count(*) from public.inventory_stock_item_map group by 1 order by 1;

-- Prove read-only: re-run twice; notices identical; fingerprints unchanged.
-- select 'map' as t, count(*) from public.inventory_stock_item_map
-- union all select 'stock_items', count(*) from public.stock_items
-- union all select 'stock_qty_sum', coalesce(sum(current_quantity),0)::bigint from public.stock_items
-- union all select 'stock_movements', count(*) from public.stock_movements
-- union all select 'migrated_at_set', count(*) from public.inventory_stock_item_map where migrated_at is not null;
-- =============================================================================
