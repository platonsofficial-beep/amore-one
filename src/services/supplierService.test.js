import { describe, expect, it } from 'vitest'
import {
  resolveSupplierDualRead,
  resolveSupplierWorkspaceIdForCreate,
  resolveSupplierWorkspaceIdForUpdate,
  serializeSupplierForCreate,
  serializeSupplierForUpdate,
} from './supplierService'

function supplier(id, companyName, workspaceId = null) {
  return { id, companyName, workspaceId }
}

describe('resolveSupplierDualRead', () => {
  it('returns workspace suppliers when any exist', () => {
    const workspace = [supplier(1, 'Workspace Co', 'ws-1')]
    const legacy = [supplier(2, 'Legacy Co', null)]

    expect(resolveSupplierDualRead(workspace, legacy)).toEqual(workspace)
  })

  it('falls back to legacy when workspace list is empty', () => {
    const legacy = [
      supplier(2, 'Legacy Co', null),
      supplier(3, 'Other Legacy', null),
    ]

    expect(resolveSupplierDualRead([], legacy)).toEqual(legacy)
  })

  it('falls back when workspace list is empty and never merges', () => {
    const workspace = []
    const legacy = [supplier(9, 'Only Legacy', null)]
    const result = resolveSupplierDualRead(workspace, legacy)

    expect(result).toEqual(legacy)
    expect(result).toHaveLength(1)
    expect(result.some((row) => row.id === 1)).toBe(false)
  })

  it('returns empty array when both lists are empty', () => {
    expect(resolveSupplierDualRead([], [])).toEqual([])
  })

  it('treats null/undefined workspace list as empty and uses legacy', () => {
    const legacy = [supplier(4, 'Legacy', null)]
    expect(resolveSupplierDualRead(null, legacy)).toEqual(legacy)
    expect(resolveSupplierDualRead(undefined, legacy)).toEqual(legacy)
  })

  it('does not return legacy when workspace has rows', () => {
    const workspace = [
      supplier(10, 'A', 'ws-1'),
      supplier(11, 'B', 'ws-1'),
    ]
    const legacy = [
      supplier(10, 'A duplicate name', null),
      supplier(99, 'Legacy Only', null),
    ]
    const result = resolveSupplierDualRead(workspace, legacy)

    expect(result).toEqual(workspace)
    expect(result).toHaveLength(2)
    expect(result.map((row) => row.id)).toEqual([10, 11])
  })
})

describe('supplier workspace write payloads', () => {
  it('create includes workspace_id when active workspace is present', () => {
    const payload = serializeSupplierForCreate({
      companyName: 'Fresh Co',
      contactPerson: 'Alex',
      workspaceId: 'ws-abc',
    })

    expect(payload.workspace_id).toBe('ws-abc')
    expect(payload.company_name).toBe('Fresh Co')
    expect(payload.contact_person).toBe('Alex')
  })

  it('create omits workspace_id when workspace is unavailable (boot-safe)', () => {
    expect(resolveSupplierWorkspaceIdForCreate('')).toBeNull()
    expect(resolveSupplierWorkspaceIdForCreate(null)).toBeNull()
    expect(resolveSupplierWorkspaceIdForCreate(undefined)).toBeNull()

    const payload = serializeSupplierForCreate({
      companyName: 'Boot Co',
      workspaceId: '',
    })

    expect(payload).not.toHaveProperty('workspace_id')
    expect(payload.company_name).toBe('Boot Co')
  })

  it('update preserves existing workspace_id', () => {
    expect(resolveSupplierWorkspaceIdForUpdate('ws-keep')).toBe('ws-keep')

    const payload = serializeSupplierForUpdate({
      companyName: 'Updated Co',
      contactPerson: 'Sam',
      workspaceId: null,
    }, 'ws-keep')

    expect(payload.workspace_id).toBe('ws-keep')
    expect(payload.company_name).toBe('Updated Co')
  })

  it('legacy supplier update omits workspace_id and does not write null', () => {
    expect(resolveSupplierWorkspaceIdForUpdate(null)).toBeNull()
    expect(resolveSupplierWorkspaceIdForUpdate('')).toBeNull()

    const payload = serializeSupplierForUpdate({
      companyName: 'Legacy Co',
      notes: 'still editable',
      workspaceId: null,
    }, null)

    expect(payload).not.toHaveProperty('workspace_id')
    expect(payload.company_name).toBe('Legacy Co')
    expect(payload.notes).toBe('still editable')
  })

  it('does not overwrite existing workspace with empty incoming value', () => {
    const payload = serializeSupplierForUpdate({
      companyName: 'Owned Co',
      workspaceId: '',
    }, 'ws-owned')

    expect(payload.workspace_id).toBe('ws-owned')
  })
})
