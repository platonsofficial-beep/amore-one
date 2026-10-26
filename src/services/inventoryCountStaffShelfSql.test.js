import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const applySql = readFileSync(join(HERE, '../../supabase/inventory_count_staff_shelf.sql'), 'utf8')
const rollbackSql = readFileSync(join(HERE, '../../supabase/inventory_count_staff_shelf_rollback.sql'), 'utf8')
const verifySql = readFileSync(join(HERE, '../../supabase/inventory_count_staff_shelf_verify.sql'), 'utf8')

describe('staff shelf count SQL', () => {
  it('lets staff count one shelf and leaves posting manager-only', () => {
    expect(applySql).toContain('SQL NOT APPLIED')
    expect(applySql).toContain('is_workspace_staff_counter')
    expect(applySql).toContain("v_normalized_count_type <> 'partial'")
    expect(applySql).toContain('v_location_count <> 1')
    expect(applySql).toContain('can_staff_edit_shelf_count')
    expect(applySql.match(/can_staff_edit_shelf_count\(p_workspace_id, p_session_id\)/g)).toHaveLength(3)
    expect(applySql).not.toContain('post_inventory_count_finish')
    expect(rollbackSql).not.toContain('is_workspace_staff_counter(p_workspace_id)')
    expect(rollbackSql).toContain('drop function if exists public.is_workspace_staff_counter(uuid)')
    expect(verifySql).not.toMatch(/declare\s+column_default\b/)
    expect(verifySql).toContain('verify_failed_staff_post_opened')
  })
})
