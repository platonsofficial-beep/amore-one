import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('reverse_inventory_count_session SQL contract (P8.22.6 / P8.22.6a)', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_reverse_session_rpc.sql'),
    'utf8',
  )
  const functionBody = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;') + 3)
  const postSql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_post_finish_rpc.sql'),
    'utf8',
  )
  const correctionSql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_apply_corrections_rpc.sql'),
    'utf8',
  )
  const lineageSql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_reversal_lineage_schema.sql'),
    'utf8',
  )

  const headerIdx = functionBody.indexOf('insert into public.inventory_count_reversals')
  const stockMovementInsertIdx = functionBody.indexOf('insert into public.stock_movements')
  const stockUpdateIdx = functionBody.indexOf('update public.stock_items si')
  const metaIdx = functionBody.indexOf('reversed_at = v_now')

  it('defines SECURITY DEFINER RPC with auth, reason, and authenticated grant', () => {
    expect(sql).toContain('create or replace function public.reverse_inventory_count_session(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('p_reason text')
    expect(sql).toMatch(/security definer/i)
    expect(sql).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(sql).toContain(
      'grant execute on function public.reverse_inventory_count_session(uuid, uuid, text, text) to authenticated',
    )
  })

  it('accepts zero-variance posted lines with null movement (legitimate skip)', () => {
    expect(postSql).toContain('if v_variance_quantity <> 0 then')
    expect(functionBody).toContain('v_session_item.variance_quantity is null')
    expect(functionBody).toContain('v_session_item.variance_quantity = 0')
    expect(functionBody).toContain('continue')
    expect(functionBody).toMatch(
      /variance_quantity = 0 then[\s\S]*continue[\s\S]*posted_movement_id is null/,
    )
  })

  it('aborts when non-zero posted variance has null posted_movement_id', () => {
    expect(functionBody).toContain('v_session_item.posted_movement_id is null')
    expect(functionBody).toContain('inventory_count_reversal_movement_missing')
    expect(functionBody).toContain('Posted non-zero variance is missing its stock movement reference')
  })

  it('aborts when non-zero posted variance movement row is missing', () => {
    expect(functionBody).toContain('where m.id = v_session_item.posted_movement_id')
    expect(functionBody).toContain('A posted inventory count movement no longer exists')
    expect(functionBody.indexOf('inventory_count_reversal_movement_missing')).toBeLessThan(headerIdx)
  })

  it('aborts when non-zero correction delta has null movement_id', () => {
    expect(correctionSql).toContain('if v_delta = 0 then')
    expect(correctionSql).toContain('insert into public.inventory_count_correction_lines')
    expect(functionBody).toContain('v_correction_line.delta_quantity = 0')
    expect(functionBody).toContain('v_correction_line.movement_id is null')
    expect(functionBody).toContain('Correction line is missing its stock movement reference')
  })

  it('aborts when correction movement row is missing', () => {
    expect(functionBody).toContain('where m.id = v_correction_line.movement_id')
    expect(functionBody).toContain('A correction movement no longer exists')
  })

  it('aborts on workspace, item, and quantity mismatches for required sources', () => {
    expect(functionBody).toContain('inventory_count_reversal_movement_workspace_mismatch')
    expect(functionBody).toContain('inventory_count_reversal_movement_item_mismatch')
    expect(functionBody).toContain('inventory_count_reversal_movement_quantity_mismatch')
    expect(functionBody).toContain('v_orig.quantity is distinct from v_expected_quantity')
    expect(functionBody).toContain('v_session_item.variance_quantity')
    expect(functionBody).toContain('v_correction_line.delta_quantity')
    expect(functionBody).toContain('v_expected_item_id is not null')
    expect(functionBody).toContain('v_orig.item_id is distinct from v_expected_item_id')
  })

  it('runs all source-validation failures before reversal header and stock mutation', () => {
    const postedNullIdx = functionBody.indexOf('Posted non-zero variance is missing its stock movement reference')
    const correctionNullIdx = functionBody.indexOf('Correction line is missing its stock movement reference')
    const qtyMismatchIdx = functionBody.indexOf('inventory_count_reversal_movement_quantity_mismatch')
    const workspaceMismatchIdx = functionBody.indexOf('inventory_count_reversal_movement_workspace_mismatch')
    const itemMismatchIdx = functionBody.indexOf('inventory_count_reversal_movement_item_mismatch')

    expect(headerIdx).toBeGreaterThan(-1)
    expect(stockMovementInsertIdx).toBeGreaterThan(headerIdx)
    expect(stockUpdateIdx).toBeGreaterThan(stockMovementInsertIdx)
    expect(metaIdx).toBeGreaterThan(stockUpdateIdx)

    for (const idx of [
      postedNullIdx,
      correctionNullIdx,
      qtyMismatchIdx,
      workspaceMismatchIdx,
      itemMismatchIdx,
    ]) {
      expect(idx).toBeGreaterThan(-1)
      expect(idx).toBeLessThan(headerIdx)
    }
  })

  it('still reverses validated posted + correction movements successfully (happy path shape)', () => {
    expect(functionBody).toContain('array_append(v_source_ids, v_session_item.posted_movement_id)')
    expect(functionBody).toContain('array_append(v_source_ids, v_correction_line.movement_id)')
    expect(functionBody).toContain('m.id = any (v_source_ids)')
    expect(functionBody).toContain('order by m.created_at asc, m.id asc')
    expect(functionBody).toContain("'adjustment'")
    expect(functionBody).toContain('v_reversal_quantity := -v_orig.quantity')
    expect(functionBody).toContain('insert into public.inventory_count_reversal_lines')
    expect(functionBody).toContain('update public.stock_item_location_balances b')
    expect(functionBody).toContain('set current_quantity = v_aggregate_sum')
    expect(functionBody).toContain("'inventory_count_reversal'")
    expect(functionBody).toContain("'status', 'posted'")
    expect(lineageSql).toContain('inventory_count_reversal_lines')
  })

  it('guarantees no partial reverse via single-transaction exceptions and count match', () => {
    expect(functionBody).not.toContain('exception when others then')
    expect(functionBody).not.toContain('commit')
    expect(functionBody).not.toContain('rollback')
    expect(functionBody).toContain('inventory_count_reversal_movement_count_mismatch')
    expect(functionBody).toContain('inventory_count_reversal_session_finalize_failed')
    expect(functionBody).not.toMatch(/\bdelete\s+from\s+public\.stock_movements\b/i)
    expect(sql).not.toContain('.jsx')
  })
})
