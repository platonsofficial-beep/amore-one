import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

import {
  createSupplier,
  getSuppliers,
  resetSupplierWorkspaceColumnCacheForTests,
  resolveSupplierDualRead,
  resolveSupplierWorkspaceIdForCreate,
  resolveSupplierWorkspaceIdForUpdate,
  serializeSupplierForCreate,
  serializeSupplierForUpdate,
  updateSupplier,
} from './supplierService'

const NIL_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000'
const MISSING_COLUMN = {
  code: '42703',
  message: 'column suppliers.workspace_id does not exist',
}

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve(result)),
    limit: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
  }
  return query
}

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

describe('supplier workspace column cache', () => {
  beforeEach(() => {
    fromMock.mockReset()
    resetSupplierWorkspaceColumnCacheForTests()
  })

  it('probes once when workspace_id is missing, then lists without filtering', async () => {
    const probe = createQuery({ data: null, error: MISSING_COLUMN })
    const list = createQuery({
      data: [{ id: 1, company_name: 'Acme', active: true }],
      error: null,
    })
    fromMock.mockReturnValueOnce(probe).mockReturnValueOnce(list)

    await expect(getSuppliers('ws-1')).resolves.toEqual([
      expect.objectContaining({ id: 1, companyName: 'Acme' }),
    ])
    expect(probe.select).toHaveBeenCalledWith('id')
    expect(probe.eq).toHaveBeenCalledWith('workspace_id', NIL_WORKSPACE_ID)
    expect(probe.limit).toHaveBeenCalledWith(1)
    expect(list.eq).not.toHaveBeenCalled()
    expect(list.order).toHaveBeenCalledWith('company_name', { ascending: true })

    const secondList = createQuery({
      data: [{ id: 1, company_name: 'Acme', active: true }],
      error: null,
    })
    fromMock.mockClear()
    fromMock.mockReturnValue(secondList)
    await getSuppliers('ws-1')
    expect(fromMock).toHaveBeenCalledTimes(1)
    expect(secondList.eq).not.toHaveBeenCalled()
    expect(secondList.limit).not.toHaveBeenCalled()
  })

  it('filters by workspace_id once the column exists and does not merge null rows', async () => {
    const probe = createQuery({ data: [], error: null })
    const list = createQuery({
      data: [{ id: 2, company_name: 'Venue Co', workspace_id: 'ws-1', active: true }],
      error: null,
    })
    fromMock.mockReturnValueOnce(probe).mockReturnValueOnce(list)

    await expect(getSuppliers('ws-1')).resolves.toEqual([
      expect.objectContaining({ companyName: 'Venue Co', workspaceId: 'ws-1' }),
    ])
    expect(list.eq).toHaveBeenCalledTimes(1)
    expect(list.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(list.is).not.toHaveBeenCalled()

    const secondList = createQuery({ data: [], error: null })
    fromMock.mockReturnValue(secondList)
    await getSuppliers('ws-1')
    expect(secondList.limit).not.toHaveBeenCalled()
    expect(secondList.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
  })

  it('returns no rows when the column exists and no workspace is selected', async () => {
    fromMock.mockReturnValue(createQuery({ data: [], error: null }))

    await expect(getSuppliers('')).resolves.toEqual([])
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight probe across parallel lists', async () => {
    let resolveProbe
    const probeResult = new Promise((resolve) => {
      resolveProbe = resolve
    })
    const probe = createQuery({ data: [], error: null })
    probe.limit.mockReturnValue(probeResult)
    const listA = createQuery({
      data: [{ id: 1, company_name: 'A', workspace_id: 'ws-1', active: true }],
      error: null,
    })
    const listB = createQuery({
      data: [{ id: 1, company_name: 'A', workspace_id: 'ws-1', active: true }],
      error: null,
    })
    fromMock
      .mockReturnValueOnce(probe)
      .mockReturnValueOnce(listA)
      .mockReturnValueOnce(listB)

    const pending = Promise.all([getSuppliers('ws-1'), getSuppliers('ws-1')])
    await Promise.resolve()
    expect(fromMock).toHaveBeenCalledTimes(1)
    resolveProbe({ data: [], error: null })
    await pending
    expect(probe.eq).toHaveBeenCalledTimes(1)
    expect(listA.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(listB.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(fromMock).toHaveBeenCalledTimes(3)
  })

  it('writes workspace_id when the column exists', async () => {
    const probe = createQuery({ data: [], error: null })
    const inserted = createQuery({
      data: { id: 4, company_name: 'Fresh Co', workspace_id: 'ws-1', active: true },
      error: null,
    })
    fromMock.mockReturnValueOnce(probe).mockReturnValueOnce(inserted)

    await expect(createSupplier({
      companyName: 'Fresh Co',
      workspaceId: 'ws-1',
    })).resolves.toMatchObject({ companyName: 'Fresh Co', workspaceId: 'ws-1' })
    expect(inserted.insert).toHaveBeenCalledWith([
      expect.objectContaining({ company_name: 'Fresh Co', workspace_id: 'ws-1' }),
    ])
  })

  it('omits workspace_id on create and update when the column is missing', async () => {
    const probe = createQuery({ data: null, error: MISSING_COLUMN })
    const inserted = createQuery({
      data: { id: 5, company_name: 'Legacy Co', active: true },
      error: null,
    })
    fromMock.mockReturnValueOnce(probe).mockReturnValueOnce(inserted)

    await createSupplier({ companyName: 'Legacy Co', workspaceId: 'ws-1' })
    const insertPayload = inserted.insert.mock.calls[0][0][0]
    expect(insertPayload.company_name).toBe('Legacy Co')
    expect(insertPayload).not.toHaveProperty('workspace_id')

    const updated = createQuery({
      data: { id: 5, company_name: 'Legacy Co', notes: 'edited', active: true },
      error: null,
    })
    fromMock.mockReturnValue(updated)
    await updateSupplier(5, { companyName: 'Legacy Co', notes: 'edited' }, {
      existingWorkspaceId: 'ws-1',
    })
    const updatePayload = updated.update.mock.calls[0][0]
    expect(updatePayload.notes).toBe('edited')
    expect(updatePayload).not.toHaveProperty('workspace_id')
    expect(updated.eq).not.toHaveBeenCalledWith('workspace_id', expect.anything())
  })

  it('retries a create once without workspace_id if the column disappears after the probe', async () => {
    const probe = createQuery({ data: [], error: null })
    const rejected = createQuery({ data: null, error: MISSING_COLUMN })
    const inserted = createQuery({
      data: { id: 6, company_name: 'Retry Co', active: true },
      error: null,
    })
    fromMock
      .mockReturnValueOnce(probe)
      .mockReturnValueOnce(rejected)
      .mockReturnValueOnce(inserted)

    await expect(createSupplier({
      companyName: 'Retry Co',
      workspaceId: 'ws-1',
    })).resolves.toMatchObject({ companyName: 'Retry Co' })
    expect(rejected.insert.mock.calls[0][0][0]).toMatchObject({ workspace_id: 'ws-1' })
    expect(inserted.insert.mock.calls[0][0][0]).not.toHaveProperty('workspace_id')

    const list = createQuery({ data: [], error: null })
    fromMock.mockReturnValue(list)
    await getSuppliers('ws-1')
    expect(list.limit).not.toHaveBeenCalled()
    expect(list.eq).not.toHaveBeenCalled()
  })
})
