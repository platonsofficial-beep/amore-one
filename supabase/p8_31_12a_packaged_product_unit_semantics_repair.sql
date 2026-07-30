-- =============================================================================
-- P8.31.12a — Packaged Product Unit Semantics Repair (LIVE, unit-label-only)
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
-- Do NOT auto-run from the app. Do NOT wire into migrations.
--
-- Scope:
--   Temporary real-label catalog batch ONLY
--   product UUID namespace: c0318a00-2026-4000-8000-*
--   sequences: 151, 152, 153, 154, 158, 160, 161, 162, 163
--
-- Change:
--   stock_items.unit → 'Piece'
--
-- Does NOT change:
--   current_quantity, min/target/order quantities
--   location balances
--   movement quantities / history
--   valuation math
--
-- Source JSON / seed SQL must already reflect Piece for these sequences.
-- =============================================================================

begin;

do $p8_31_12a_packaged_unit_semantics_repair$
declare
  v_workspace_id uuid;
  v_match_count bigint := 0;
  v_target_ids uuid[] := array[
    'c0318a00-2026-4000-8000-000000000097'::uuid, -- 151 Funkin Mango Purée
    'c0318a00-2026-4000-8000-000000000098'::uuid, -- 152 Funkin Passion Fruit Purée
    'c0318a00-2026-4000-8000-000000000099'::uuid, -- 153 Illy Classico Coffee Beans
    'c0318a00-2026-4000-8000-00000000009a'::uuid, -- 154 Lavazza Qualità Rossa Beans
    'c0318a00-2026-4000-8000-00000000009e'::uuid, -- 158 Fresh Mint
    'c0318a00-2026-4000-8000-0000000000a0'::uuid, -- 160 Fresh Milk
    'c0318a00-2026-4000-8000-0000000000a1'::uuid, -- 161 Single Cream
    'c0318a00-2026-4000-8000-0000000000a2'::uuid, -- 162 Strawberries
    'c0318a00-2026-4000-8000-0000000000a3'::uuid  -- 163 Fresh Basil
  ];
  v_found bigint := 0;
  v_updated bigint := 0;
  v_agg_item_before numeric(14, 3);
  v_agg_item_after numeric(14, 3);
  v_agg_bal_before numeric(14, 3);
  v_agg_bal_after numeric(14, 3);
begin
  select count(*)
  into v_match_count
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  if v_match_count <> 1 then
    raise exception
      'P8.31.12a abort: expected exactly one AMORE.NICOSIA workspace, found %',
      v_match_count;
  end if;

  select w.id into v_workspace_id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  select count(*)
  into v_found
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.id = any (v_target_ids);

  if v_found <> 9 then
    raise exception
      'P8.31.12a abort: expected 9 target batch items, found %',
      v_found;
  end if;

  -- Snapshot aggregates for the nine targets (must be unchanged after unit update)
  select coalesce(sum(s.current_quantity), 0)
  into v_agg_item_before
  from public.stock_items s
  where s.id = any (v_target_ids);

  select coalesce(sum(b.quantity), 0)
  into v_agg_bal_before
  from public.stock_item_location_balances b
  where b.stock_item_id = any (v_target_ids);

  update public.stock_items s
  set
    unit = 'Piece',
    updated_at = now()
  where s.workspace_id = v_workspace_id
    and s.id = any (v_target_ids)
    and s.unit is distinct from 'Piece';

  get diagnostics v_updated = row_count;

  if v_updated > 9 then
    raise exception 'P8.31.12a abort: updated more than 9 rows (%)', v_updated;
  end if;

  -- Refuse if any target is still not Piece
  if exists (
    select 1
    from public.stock_items s
    where s.id = any (v_target_ids)
      and s.unit is distinct from 'Piece'
  ) then
    raise exception 'P8.31.12a abort: one or more targets still not Piece after update';
  end if;

  select coalesce(sum(s.current_quantity), 0)
  into v_agg_item_after
  from public.stock_items s
  where s.id = any (v_target_ids);

  select coalesce(sum(b.quantity), 0)
  into v_agg_bal_after
  from public.stock_item_location_balances b
  where b.stock_item_id = any (v_target_ids);

  if v_agg_item_before is distinct from v_agg_item_after then
    raise exception
      'P8.31.12a abort: item aggregate quantity changed % → %',
      v_agg_item_before, v_agg_item_after;
  end if;

  if v_agg_bal_before is distinct from v_agg_bal_after then
    raise exception
      'P8.31.12a abort: balance aggregate quantity changed % → %',
      v_agg_bal_before, v_agg_bal_after;
  end if;

  raise notice
    'P8.31.12a OK: workspace=% targets=9 updated=% item_agg=% balance_agg=% (quantities unchanged)',
    v_workspace_id, v_updated, v_agg_item_after, v_agg_bal_after;
end;
$p8_31_12a_packaged_unit_semantics_repair$;

commit;

-- Read-only confirmation
select
  s.id,
  s.brand,
  s.name,
  s.size,
  s.unit,
  s.current_quantity,
  s.minimum_quantity,
  s.target_quantity
from public.stock_items s
where s.id in (
  'c0318a00-2026-4000-8000-000000000097',
  'c0318a00-2026-4000-8000-000000000098',
  'c0318a00-2026-4000-8000-000000000099',
  'c0318a00-2026-4000-8000-00000000009a',
  'c0318a00-2026-4000-8000-00000000009e',
  'c0318a00-2026-4000-8000-0000000000a0',
  'c0318a00-2026-4000-8000-0000000000a1',
  'c0318a00-2026-4000-8000-0000000000a2',
  'c0318a00-2026-4000-8000-0000000000a3'
)
order by s.id;
