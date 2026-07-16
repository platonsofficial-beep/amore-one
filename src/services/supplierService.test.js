import { describe, expect, it } from 'vitest'
import { resolveSupplierDualRead } from './supplierService'

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
