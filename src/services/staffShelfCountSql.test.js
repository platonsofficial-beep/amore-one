import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const applySql = readFileSync(join(HERE, '../../supabase/inventory_count_staff_shelf_submit.sql'), 'utf8')
const rollbackSql = readFileSync(join(HERE, '../../supabase/inventory_count_staff_shelf_submit_rollback.sql'), 'utf8')
const verifySql = readFileSync(join(HERE, '../../supabase/inventory_count_staff_shelf_submit_verify.sql'), 'utf8')

describe('staff shelf count SQL', () => {
  it('submits a shelf count and leaves posting with managers', () => {
    expect(applySql).toContain('SQL NOT APPLIED')
    expect(applySql).toContain('submit_staff_shelf_count')
    expect(applySql).toContain("wm.role = 'staff'")
    expect(applySql).toContain("'counting_complete'")
    expect(applySql).toContain("'Staff shelf count'")
    expect(applySql).toContain('staff_shelf_count_not_a_shelf')
    const functionBody = applySql.slice(applySql.indexOf('as $$'), applySql.lastIndexOf('$$'))
    expect(functionBody).not.toContain('cost_price')
    expect(functionBody).not.toContain('post_inventory_count_finish')
    expect(functionBody).not.toContain('update public.stock_item_location_balances')
    expect(rollbackSql).toContain('drop function if exists public.submit_staff_shelf_count')
    expect(rollbackSql).not.toContain('delete from public.inventory_count_sessions')
    expect(verifySql).toContain('verify_failed_manager_post_opened')
    expect(verifySql).toContain('can_manage_workspace_stock')
    expect(verifySql).not.toMatch(/declare\s+column_default\b/)
  })
})
