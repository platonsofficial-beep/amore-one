import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEPARTMENTS_UNAVAILABLE_MESSAGE } from '../lib/stockDepartmentGroups.js'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

import {
  assignWorkspaceStorageDepartment,
  createWorkspaceDepartment,
  listWorkspaceDepartments,
  renameWorkspaceDepartment,
  setWorkspaceDepartmentActive,
  setWorkspaceStorageSupply,
} from './workspaceDepartmentService.js'

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}

describe('workspaceDepartmentService', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('returns an unavailable catalog when the department table is missing', async () => {
    const query = createQuery({
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.workspace_departments' in the schema cache",
      },
    })
    fromMock.mockReturnValue(query)

    await expect(listWorkspaceDepartments('ws-1')).resolves.toEqual({
      available: false,
      departments: [],
    })
    expect(query.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
  })

  it('creates, renames, and archives without a delete', async () => {
    const created = createQuery({
      data: {
        id: 'd-1',
        workspace_id: 'ws-1',
        name: 'Bar',
        active: true,
        sort_order: 0,
      },
      error: null,
    })
    fromMock.mockReturnValue(created)

    await expect(createWorkspaceDepartment('ws-1', '  Bar ')).resolves.toMatchObject({
      id: 'd-1',
      name: 'Bar',
      active: true,
    })
    expect(created.insert).toHaveBeenCalledWith({
      workspace_id: 'ws-1',
      name: 'Bar',
      active: true,
    })

    const renamed = createQuery({
      data: {
        id: 'd-1',
        workspace_id: 'ws-1',
        name: 'Service bar',
        active: true,
        sort_order: 0,
      },
      error: null,
    })
    fromMock.mockReturnValue(renamed)
    await renameWorkspaceDepartment('ws-1', 'd-1', 'Service bar')
    expect(renamed.update).toHaveBeenCalledWith({ name: 'Service bar' })
    expect(renamed.eq).toHaveBeenCalledWith('id', 'd-1')

    const archived = createQuery({
      data: {
        id: 'd-1',
        workspace_id: 'ws-1',
        name: 'Service bar',
        active: false,
        sort_order: 0,
      },
      error: null,
    })
    fromMock.mockReturnValue(archived)
    await expect(setWorkspaceDepartmentActive('ws-1', 'd-1', false)).resolves.toMatchObject({
      active: false,
    })
    expect(archived.update).toHaveBeenCalledWith({ active: false })
  })

  it('maps a duplicate department name and a missing schema on write', async () => {
    fromMock.mockReturnValue(createQuery({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    }))
    await expect(createWorkspaceDepartment('ws-1', 'Bar')).rejects.toThrow(
      /already exists/i,
    )

    fromMock.mockReturnValue(createQuery({
      data: null,
      error: {
        code: '42703',
        message: 'column workspace_storages.department_id does not exist',
      },
    }))
    await expect(assignWorkspaceStorageDepartment('ws-1', 's-1', 'd-1')).rejects.toThrow(
      DEPARTMENTS_UNAVAILABLE_MESSAGE,
    )
  })

  it('assigns a department or clears it, and sets the supply flag without location_key', async () => {
    const assigned = createQuery({
      data: { id: 's-1', department_id: 'd-bar' },
      error: null,
    })
    fromMock.mockReturnValue(assigned)
    await expect(assignWorkspaceStorageDepartment('ws-1', 's-1', 'd-bar')).resolves.toEqual({
      id: 's-1',
      departmentId: 'd-bar',
    })
    expect(assigned.update).toHaveBeenCalledWith({ department_id: 'd-bar' })
    expect(fromMock).toHaveBeenCalledWith('workspace_storages')

    const cleared = createQuery({
      data: { id: 's-1', department_id: null },
      error: null,
    })
    fromMock.mockReturnValue(cleared)
    await expect(assignWorkspaceStorageDepartment('ws-1', 's-1', '')).resolves.toEqual({
      id: 's-1',
      departmentId: null,
    })
    expect(cleared.update).toHaveBeenCalledWith({ department_id: null })

    const supply = createQuery({
      data: { id: 's-soft', is_supply: true },
      error: null,
    })
    fromMock.mockReturnValue(supply)
    await expect(setWorkspaceStorageSupply('ws-1', 's-soft', true)).resolves.toEqual({
      id: 's-soft',
      isSupply: true,
    })
    expect(supply.update).toHaveBeenCalledWith({ is_supply: true })
    expect(JSON.stringify(supply.update.mock.calls)).not.toMatch(/location_key/)
  })
})
