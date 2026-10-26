import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const applySql = readFileSync(join(HERE, '../supabase/workspace_storage_rename.sql'), 'utf8')
const verifySql = readFileSync(join(HERE, '../supabase/workspace_storage_rename_verify.sql'), 'utf8')
const rollbackSql = readFileSync(join(HERE, '../supabase/workspace_storage_rename_rollback.sql'), 'utf8')

describe('workspace_storage_rename.sql', () => {
  it('drops only the name = location_key check and does not write rows or policies', () => {
    expect(applySql).toContain('SQL NOT APPLIED')
    expect(applySql).toContain('drop constraint if exists workspace_storages_name_equals_location_key_chk')
    expect(applySql).toContain('workspace_storages_update_managers')
    expect(applySql).not.toMatch(/create policy/i)
    expect(applySql).not.toMatch(/\bupdate public\.workspace_storages\b/i)
    expect(applySql).not.toMatch(/location_key\s*=/)
    expect(applySql).toContain('workspace_storage_rename_verify.sql')
    expect(applySql).toContain('workspace_storage_rename_rollback.sql')
  })

  it('verifies the check is gone and the manager update, key lock, and duplicate name stay', () => {
    expect(verifySql).toContain('verify_failed_name_still_equals_location_key')
    expect(verifySql).toContain('workspace_storages_update_managers')
    expect(verifySql).toContain('verify_failed_manager_update_policy')
    expect(verifySql).toContain('workspace_storages_location_key_immutable')
    expect(verifySql).toContain('workspace_storages_workspace_name_normalized_uidx')
    expect(verifySql).toContain('workspace_storages_workspace_location_key_uidx')
    expect(verifySql).not.toMatch(/\bupdate public\b/i)
    expect(verifySql).not.toMatch(/\binsert\b/i)
    expect(verifySql).not.toMatch(/\bdelete\b/i)
  })

  it('rolls the equality check back only when no display name has drifted', () => {
    expect(rollbackSql).toContain('workspace_storage_rename_rollback_blocked_drifted_names')
    expect(rollbackSql).toContain('name is distinct from location_key')
    expect(rollbackSql).toContain('add constraint workspace_storages_name_equals_location_key_chk')
    expect(rollbackSql).toContain('check (name = location_key)')
    expect(rollbackSql).not.toMatch(/set location_key/i)
  })
})
